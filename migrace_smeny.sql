-- ===========================================================================
-- MIGRACE: směny lektorů u stolu ("kdo tu dnes je a od kolika do kolika")
-- ---------------------------------------------------------------------------
-- Pro databázi, která už běží. Spusť CELÝ tenhle soubor v Supabase:
--   SQL Editor -> New query -> vlož -> Run.
--
-- ⚠️ NESPOUŠTĚJ znovu celý schema.sql – ten na konci obsahuje ukázková data
--    a založil by lektory, žáky a lekce podruhé.
--
-- Co to udělá:
--   1) přidá sloupec lessons.kind ('lesson' | 'shift'),
--   2) naučí triggery ignorovat směny (nepočítají se do odpracovaných hodin
--      ani nečerpají kredit žáka),
--   3) přidá kind do pohledu lesson_details, ze kterého čte appka.
--
-- Migrace je bezpečně opakovatelná – když ji pustíš dvakrát, nic se nerozbije.
-- ===========================================================================

-- 1) Nový sloupec. Všechny stávající řádky zůstanou jako 'lesson'.
alter table lessons add column if not exists kind text not null default 'lesson';

-- 2a) Odpracované hodiny: směna není odučená hodina.
create or replace function log_lesson_work() returns trigger
language plpgsql security definer as $$
begin
  if new.kind <> 'lesson' then return new; end if;
  if new.done then
    if new.lector_id is null then return new; end if;
    insert into work_log (lesson_id, lector_id, work_date, minutes, subject)
    values (new.id, new.lector_id,
            (new.starts_at at time zone 'Europe/Prague')::date,
            greatest(1, round(extract(epoch from (new.ends_at - new.starts_at)) / 60)::int),
            new.subject)
    on conflict (lesson_id) do update
      set lector_id = excluded.lector_id,
          work_date = excluded.work_date,
          minutes   = excluded.minutes,
          subject   = excluded.subject;
  elsif tg_op = 'UPDATE' and old.done then
    delete from work_log where lesson_id = new.id;
  end if;
  return new;
end $$;

-- 2b) Kredit hodin: směna nečerpá zaplacené hodiny žáka.
create or replace function sync_credit_log(p_lesson uuid) returns void
language plpgsql security definer as $$
declare l record;
begin
  delete from credit_log where lesson_id = p_lesson;
  select * into l from lessons where id = p_lesson;
  if l.id is null or not l.done or l.kind <> 'lesson' then return; end if;
  insert into credit_log (lesson_id, student_id, lesson_date, hours, subject)
  select l.id, a.student_id,
         (l.starts_at at time zone 'Europe/Prague')::date,
         round((extract(epoch from (l.ends_at - l.starts_at)) / 3600.0)::numeric, 2),
         l.subject
  from attendance a where a.lesson_id = l.id;
end $$;

-- 3) Pohled pro appku – nový sloupec kind na konci.
create or replace view lesson_details with (security_invoker = on) as
select
  l.id,
  l.starts_at,
  l.ends_at,
  l.subject,
  l.mode,
  l.status,
  l.done,
  l.description,
  l.room_id,
  r.name  as room_name,
  r.color as room_color,
  lec.name as lector_name,
  coalesce(string_agg(s.name, ', ' order by s.name), '') as student_names,
  l.kind
from lessons l
left join rooms r    on r.id = l.room_id
left join lectors lec on lec.id = l.lector_id
left join attendance a on a.lesson_id = l.id
left join students s  on s.id = a.student_id
group by l.id, r.name, r.color, lec.name;

-- ---------------------------------------------------------------------------
-- Kontrola po spuštění (mělo by projít bez chyby a vrátit samé 'lesson'):
--   select kind, count(*) from lessons group by kind;
--   select kind from lesson_details limit 1;
-- ---------------------------------------------------------------------------
