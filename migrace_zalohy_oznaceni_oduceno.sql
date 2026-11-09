-- ===========================================================================
-- MIGRACE: zálohy z appky, kontaktováno/problémový u klientů, odučeno ve 21:00
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- Migrace je bezpečně opakovatelná. Poslední řádek výsledku napíše, jestli
-- se podařilo naplánovat automatické odučení.
-- ---------------------------------------------------------------------------
-- 1) Klient: „kontaktováno" a „problémový" jsou vlastní sloupce. Dřív to byly
--    hodnoty v rozbalovacím seznamu spolu s online/osobně, takže označení
--    „kontaktováno" přepsalo, že je klient online.
-- 2) Každý den ve 21:00 se dnešní proběhlé lekce samy označí jako odučené.
-- 3) Záloha: export_snapshot() vrátí všechna data jako jeden JSON,
--    restore_snapshot() je z něj obnoví.
-- 4) Online stoly dostanou výraznější a různé barvy (jen ty, které ještě
--    nikdo nepřebarvil). Dál si je může každý nastavit v Rozvrh -> Nastavení.
--
-- Spouštěj až po migrace_online_stoly.sql.
-- ===========================================================================

-- 1) Klient: kontaktováno a problémový ---------------------------------------
alter table students add column if not exists contacted boolean not null default false;
alter table students add column if not exists problem   boolean not null default false;

-- Dosavadní označení se přesunou do nových sloupců. Co dřív bylo online nebo
-- osobně a přepsalo se na „kontaktováno", už appka zjistit neumí.
update students set contacted = true, flag = null where flag = 'contacted';
update students set problem   = true, flag = null where flag = 'problem';

-- DROP + CREATE (ne "create or replace") – stejně jako ve schema.sql.
drop view if exists student_credit;
create view student_credit with (security_invoker = on) as
select
  s.id as student_id,
  s.name, s.phone, s.email, s.school, s.status, s.note, s.flag,
  s.category, s.grade, s.subjects, s.lector_name,
  s.price_hour, s.price_hour_discount, s.payment_method,
  coalesce(p.paid_hours, 0)  as paid_hours,
  coalesce(p.paid_czk, 0)    as paid_czk,
  coalesce(u.used_hours, 0)  as used_hours,
  coalesce(p.paid_hours, 0) - coalesce(u.used_hours, 0) as balance_hours,
  s.contacted, s.problem
from students s
left join (
  select student_id, sum(hours_credit) as paid_hours, sum(amount_czk) as paid_czk
  from payments group by student_id
) p on p.student_id = s.id
left join (
  select student_id, sum(hours) as used_hours
  from credit_log group by student_id
) u on u.student_id = s.id;


-- 2) Automatické odučení ve 21:00 --------------------------------------------
-- Označí dnešní lekce, které už skončily, přesně jako tlačítko „✓ Odučeno":
-- zrušené, nedostavené ani zápisy „lektor u stolu" nechá být. Lektorům se tím
-- zapíšou hodiny a žákům se strhne kredit (triggery na tabulce lessons).
--
-- pg_cron běží v UTC a Česko se přepíná mezi UTC+1 a UTC+2, takže se úloha
-- spouští v 19:00 i 20:00 UTC a funkce si sama ověří, že je v Praze 21 hodin.
create or replace function public.auto_mark_lessons_done()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if extract(hour from now() at time zone 'Europe/Prague') <> 21 then
    return 0;
  end if;

  update public.lessons
     set done = true,
         status = case when status = 'planned' then 'done' else status end
   where kind = 'lesson'
     and not done
     and status not in ('cancelled', 'no_show')
     and ends_at <= now()
     and (starts_at at time zone 'Europe/Prague')::date = (now() at time zone 'Europe/Prague')::date;
  get diagnostics n = row_count;
  return n;
end $$;

-- Volá ji jen plánovač, z webu k ní nikdo nesmí.
revoke all on function public.auto_mark_lessons_done() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise warning 'pg_cron se nepodařilo zapnout: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Stejný název přepíše dřívější úlohu, takže opakované spuštění nic nezdvojí.
    perform cron.schedule('poradys-oduceno-21', '0 19,20 * * *', 'select public.auto_mark_lessons_done()');
  end if;
end $$;


-- 3) Zálohy ------------------------------------------------------------------
-- Tabulky v pořadí, ve kterém na sebe odkazují (rodič před potomkem).
-- profiles jsou v záloze jen pro přehled, kdo měl jakou roli: přihlášení žije
-- v Supabase Auth a z JSONu ho obnovit nejde, proto je obnova nechává být.
--
-- stable = všechny tabulky se čtou ze stejného okamžiku, záloha je konzistentní.
create or replace function public.export_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t      text;
  radky  jsonb;
  vystup jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Zálohu smí stáhnout jen administrátor.';
  end if;

  foreach t in array array['rooms','lectors','students','lessons','attendance','work_log',
                           'payments','credit_log','diagnostics','materials','notifications','profiles']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into radky;
    vystup := vystup || jsonb_build_object(t, radky);
  end loop;

  return jsonb_build_object(
    'app',        'poradys-zaloha',
    'version',    1,
    'created_at', now(),
    'tables',     vystup
  );
end $$;

revoke all     on function public.export_snapshot() from public, anon;
grant  execute on function public.export_snapshot() to authenticated;

-- Obnova NAHRADÍ všechna provozní data obsahem zálohy. Běží jako jedna
-- transakce: když cokoli selže, databáze zůstane přesně tak, jak byla.
--
-- Triggery na lessons a attendance se po dobu obnovy vypínají – jinak by při
-- vkládání znovu počítaly hodiny a kredit a srazily se s řádky ze zálohy.
-- Sloupce se berou podle toho, co v záloze opravdu je, takže jde obnovit i
-- starší záloha: co v ní chybí, dostane výchozí hodnotu.
create or replace function public.restore_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  poradi  text[] := array['rooms','lectors','students','lessons','attendance','work_log',
                          'payments','credit_log','diagnostics','materials','notifications'];
  t       text;
  radky   jsonb;
  sloupce text;
  pocty   jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Zálohu smí obnovit jen administrátor.';
  end if;

  if p_snapshot->>'app' is distinct from 'poradys-zaloha' then
    raise exception 'Tohle není záloha z PoraDys.';
  end if;
  foreach t in array poradi loop
    if jsonb_typeof(p_snapshot->'tables'->t) is distinct from 'array' then
      raise exception 'V záloze chybí tabulka %.', t;
    end if;
  end loop;
  -- Bez stolů by nešel vložit žádný řádek rozvrhu – poškozený nebo prázdný
  -- soubor nesmí smazat data.
  if jsonb_array_length(p_snapshot->'tables'->'rooms') = 0 then
    raise exception 'Záloha je prázdná, nic jsem neobnovil.';
  end if;

  alter table public.lessons    disable trigger user;
  alter table public.attendance disable trigger user;

  truncate table public.notifications, public.materials, public.diagnostics, public.credit_log,
                 public.payments, public.work_log, public.attendance, public.lessons,
                 public.students, public.lectors, public.rooms;

  foreach t in array poradi loop
    radky := p_snapshot->'tables'->t;
    if jsonb_array_length(radky) > 0 then
      -- materials.created_by míří na účet, který po havárii nemusí existovat.
      select string_agg(quote_ident(c.column_name), ', ') into sloupce
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = t
         and (radky->0) ? c.column_name
         and not (t = 'materials' and c.column_name = 'created_by');

      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
                     t, sloupce, sloupce, t) using radky;
    end if;
    pocty := pocty || jsonb_build_object(t, jsonb_array_length(radky));
  end loop;

  alter table public.lessons    enable trigger user;
  alter table public.attendance enable trigger user;

  return pocty;
end $$;

revoke all     on function public.restore_snapshot(jsonb) from public, anon;
grant  execute on function public.restore_snapshot(jsonb) to authenticated;


-- 4) Barvy online stolů ------------------------------------------------------
-- Jen stoly s původní petrolejovou barvou; co si někdo přebarvil, zůstává.
update rooms r
set color = (array['#6a4c93','#7b5ea7','#8e6bbf','#b5179e','#c2378f','#d6457f',
                   '#0f766e','#0d9488','#14a39a','#0e7490','#0891b2','#06a0c2',
                   '#b45309','#c2640a','#d97706','#475569','#64748b'])[((r.sort - 101) % 17) + 1]
where r.mode = 'online'
  and r.color in ('#1f7a8c', '#287271');


-- Ať web o nových funkcích ví hned.
notify pgrst, 'reload schema';

select case
         when exists (select 1 from pg_extension where extname = 'pg_cron')
         then 'Hotovo. Odučení ve 21:00 je naplánované.'
         else 'POZOR: pg_cron se nezapnul. Zapni ho v Database -> Extensions a spusť tento soubor znovu.'
       end as vysledek;
