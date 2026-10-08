-- ===========================================================================
-- MIGRACE: smlouva lektora od–do, způsob výuky a mazání z kartoték
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- Migrace je bezpečně opakovatelná.
-- ---------------------------------------------------------------------------
-- 1) Karta lektora dostane začátek smlouvy (konec už má: contract_until)
--    a způsob výuky: osobně / online / obojí.
--
-- 2) Mazání klienta a lektora úplně, i s navázanými záznamy. Dělají to dvě
--    funkce v databázi – smazání sahá do víc tabulek najednou a musí proběhnout
--    celé, nebo vůbec. Kdyby to appka posílala po kouskách, výpadek sítě
--    uprostřed by nechal napůl smazaného člověka.
--
--    Obě funkce mají parametr p_dry_run. S hodnotou true nic nemažou, jen
--    spočítají, co by zmizelo – appka to ukáže v potvrzovacím okně dřív,
--    než se cokoli smaže.
--
-- Spouštěj až po migrace_kartoteka_lektoru.sql.
-- ===========================================================================

-- 1) Karta lektora ----------------------------------------------------------
alter table lectors add column if not exists contract_from date;   -- od kdy má smlouvu
alter table lectors add column if not exists teaching_mode text;   -- 'inperson' | 'online' | 'both'

alter table lectors drop constraint if exists lectors_teaching_mode_chk;
alter table lectors add constraint lectors_teaching_mode_chk
  check (teaching_mode is null or teaching_mode in ('inperson', 'online', 'both'));


-- 2a) Smazání klienta -------------------------------------------------------
-- Smaže kartu klienta a všechno, co k ní patří:
--   • platby a čerpání kreditu (payments, credit_log – cascade z cizího klíče),
--   • účast na lekcích (attendance – cascade),
--   • diagnostické testy a záznamy o odeslaných SMS,
--   • BUDOUCÍ neodučené lekce, kde byl JEDINÝM žákem – jinak by v rozvrhu
--     zůstaly prázdné bloky, na které nikdo nepřijde.
-- Proběhlé lekce v rozvrhu ZŮSTÁVAJÍ (jen bez jména žáka): lektor je odučil
-- a jeho odpracované hodiny ve work_log se mazat nesmí. Skupinové lekce
-- zůstávají taky, jen z nich klient vypadne.
--
-- Klienta smí smazat jen administrátor – jsou na něm platby, a ty auditor
-- nevidí ani nemění.
create or replace function public.delete_student(p_student uuid, p_dry_run boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  t_name     text;
  t_lessons  uuid[];
  n_payments int;
  n_tests    int;
begin
  if not public.is_admin() then
    raise exception 'Klienta smí smazat jen administrátor.';
  end if;

  select name into t_name from public.students where id = p_student;
  if t_name is null then
    raise exception 'Takový klient už v kartotéce není.';
  end if;

  -- Budoucí neodučené lekce, kde je klient sám (ze skupiny jen vypadne).
  select coalesce(array_agg(l.id), '{}') into t_lessons
  from public.lessons l
  join public.attendance a on a.lesson_id = l.id and a.student_id = p_student
  where l.kind = 'lesson'
    and not l.done
    and l.starts_at >= now()
    and not exists (
      select 1 from public.attendance o
      where o.lesson_id = l.id and o.student_id <> p_student
    );

  select count(*) into n_payments from public.payments    where student_id = p_student;
  select count(*) into n_tests    from public.diagnostics where student_id = p_student;

  if not p_dry_run then
    delete from public.lessons       where id = any (t_lessons);
    delete from public.diagnostics   where student_id = p_student;
    delete from public.notifications where student_id = p_student;
    delete from public.students      where id = p_student;  -- payments, credit_log, attendance: cascade
  end if;

  return json_build_object(
    'name',           t_name,
    'future_lessons', coalesce(array_length(t_lessons, 1), 0),
    'payments',       n_payments,
    'tests',          n_tests
  );
end $$;

revoke all     on function public.delete_student(uuid, boolean) from public, anon;
grant  execute on function public.delete_student(uuid, boolean) to authenticated;


-- 2b) Smazání lektora -------------------------------------------------------
-- Smaže kartu lektora a:
--   • jeho odpracované hodiny (work_log) – BEZ NÁHRADY, přijdete o podklad
--     k výplatám. Proto smí lektora s hodinami smazat jen administrátor;
--     auditor (který hodiny kontroluje) smí mazat jen karty bez odučených
--     hodin, typicky překlep, ze kterého rozvrh založil druhou kartu,
--   • jeho zápisy „lektor u stolu" (směny),
--   • u LEKCÍ se lektor jen odebere – lekce patří žákům a zůstávají
--     v rozvrhu bez lektora, ať se dají přidělit někomu jinému.
-- Přihlašovací účet se tím NEMAŽE – to se dělá v Rozvrh -> Účty. Funkce jen
-- vrátí, jestli lektor nějaký účet má, ať to appka může připomenout.
create or replace function public.delete_lector(p_lector uuid, p_dry_run boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  t_name        text;
  t_email       text;
  n_work        int;
  n_minutes     int;
  n_future      int;
  n_shifts      int;
  t_has_account boolean;
begin
  if not public.is_staff() then
    raise exception 'Lektora smí smazat jen administrátor nebo auditor.';
  end if;

  select name, email into t_name, t_email from public.lectors where id = p_lector;
  if t_name is null then
    raise exception 'Takový lektor už v kartotéce není.';
  end if;

  select count(*), coalesce(sum(minutes), 0) into n_work, n_minutes
    from public.work_log where lector_id = p_lector;
  select count(*) into n_future
    from public.lessons where lector_id = p_lector and kind = 'lesson'
     and not done and starts_at >= now();
  select count(*) into n_shifts
    from public.lessons where lector_id = p_lector and kind = 'shift';
  t_has_account := t_email is not null and exists (
    select 1 from public.profiles where lower(email) = lower(t_email)
  );

  if n_work > 0 and not public.is_admin() then
    raise exception 'Lektor má zapsané odučené hodiny – smazat ho smí jen administrátor. Můžete ho označit jako bývalého.';
  end if;

  if not p_dry_run then
    -- Hodiny pryč dřív, než se lektor odpojí od lekcí – trigger
    -- log_lesson_work by u potvrzené lekce bez lektora řádek nechal viset.
    delete from public.work_log where lector_id = p_lector;
    update public.lessons set lector_id = null where lector_id = p_lector and kind = 'lesson';
    delete from public.lessons where lector_id = p_lector and kind = 'shift';
    delete from public.lectors where id = p_lector;
  end if;

  return json_build_object(
    'name',           t_name,
    'work_rows',      n_work,
    'hours',          round(n_minutes / 60.0, 2),
    'future_lessons', n_future,
    'shifts',         n_shifts,
    'has_account',    t_has_account
  );
end $$;

revoke all     on function public.delete_lector(uuid, boolean) from public, anon;
grant  execute on function public.delete_lector(uuid, boolean) to authenticated;

-- Kontrola po spuštění:
--   select column_name from information_schema.columns
--     where table_name = 'lectors' and column_name in ('contract_from', 'teaching_mode');
--   select proname from pg_proc where proname in ('delete_student', 'delete_lector');
