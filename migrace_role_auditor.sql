-- ===========================================================================
-- MIGRACE: role „auditor" a mazání účtů z appky
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ---------------------------------------------------------------------------
-- 1) Nová role `auditor`. Smí všechno co administrátor, jen NEVIDÍ DO
--    KARTOTÉKY – tedy do plateb a kreditu klientů (tabulky payments
--    a credit_log a pohled student_credit, který z nich čte).
--
--    Pozor na jednu výjimku: tabulku `students` auditor číst i zapisovat
--    MUSÍ. Rozvrh z ní bere jména žáků k lekcím a při založení lekce
--    s novým jménem zakládá kartu. Bez toho by auditor nemohl dělat
--    rozvrh, což je jeho hlavní práce. Zavřené jsou peníze, ne jména.
--
--    Účty auditor spravovat smí, ale NESMÍ vyrobit ani povýšit
--    administrátora – jinak by si sám sobě udělal přístup do kartotéky
--    a celé omezení by bylo k ničemu.
--
-- 2) Mazání účtů. Smazat řádek v auth.users z prohlížeče nejde – veřejný
--    klíč na to nemá právo a service_role klíč do webu nepatří. Řeší to
--    funkce delete_user_account() níž: běží jako security definer (tedy
--    s právy vlastníka, ne volajícího), ale hned na začátku si ověří,
--    kdo ji volá.
--
-- Spouštěj až po migrace_ucty_lektoru.sql a migrace_prava_ostry_provoz.sql.
-- ===========================================================================

-- 1) Povolené role -----------------------------------------------------------
-- Překlep v roli by tiše znamenal „nemá práva k ničemu", radši ať to spadne.
alter table profiles drop constraint if exists profiles_role_chk;
alter table profiles add  constraint profiles_role_chk
  check (role in ('admin', 'auditor', 'lektor'));

-- 2) Pomocné funkce ----------------------------------------------------------
-- security definer stejně jako is_admin(): volají je politiky nad tabulkou
-- profiles, takže bez toho by se politika ptala sama sebe a Postgres by
-- skončil na nekonečné rekurzi.
create or replace function public.is_auditor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'auditor');
$$;

-- „Staff" = administrátor NEBO auditor. Tímhle se řídí skoro všechno;
-- jen platby a kredit zůstávají na samotném is_admin().
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'auditor')
  );
$$;

-- 3) Práva k profilům --------------------------------------------------------
-- Číst účty smí admin i auditor, každý navíc vždycky ten svůj.
-- Měnit a mazat: admin kohokoli, auditor jen NE-administrátory – a zároveň
-- z nikoho nesmí administrátora udělat (to hlídá with check nad NOVÝM řádkem).
drop policy if exists prof_read         on profiles;
drop policy if exists prof_admin_update on profiles;
drop policy if exists prof_admin_delete on profiles;
drop policy if exists prof_staff_update on profiles;
drop policy if exists prof_staff_delete on profiles;

create policy prof_read on profiles
  for select to authenticated using (auth.uid() = id or is_staff());
create policy prof_staff_update on profiles
  for update to authenticated
  using      (is_admin() or (is_auditor() and role <> 'admin'))
  with check (is_admin() or (is_auditor() and role <> 'admin'));
create policy prof_staff_delete on profiles
  for delete to authenticated
  using (is_admin() or (is_auditor() and role <> 'admin'));

-- Vlastní profil si nikdo měnit nesmí – proto tu žádná politika „update
-- sebe sama" není. Jinak by se lektor povýšil na admina jedním requestem.

-- 4) Provozní tabulky: admin i auditor ---------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rooms','lectors','students','attendance','diagnostics']
  loop
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all to authenticated using (is_staff()) with check (is_staff())', t || '_write', t);
  end loop;
end $$;

-- Výkaz hodin a notifikace taky – výkaz je mzdový podklad, ne kartotéka,
-- a kontrola odpracovaných hodin je přesně to, co auditor dělá.
do $$
declare t text;
begin
  foreach t in array array['work_log','notifications']
  loop
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all to authenticated using (is_staff()) with check (is_staff())', t || '_admin', t);
  end loop;
end $$;

-- 5) Kartotéka: JEN administrátor -------------------------------------------
-- Tohle je celý smysl role auditor, tady se is_admin() nechává.
do $$
declare t text;
begin
  foreach t in array array['payments','credit_log']
  loop
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin', t);
  end loop;
end $$;

-- 6) Lekce -------------------------------------------------------------------
drop policy if exists less_insert on lessons;
drop policy if exists less_delete on lessons;
create policy less_insert on lessons for insert to authenticated with check (is_staff());
create policy less_delete on lessons for delete to authenticated using (is_staff());

-- Lektorovi se u lekce vrátí zpátky všechno kromě potvrzení a popisu.
-- Auditor má nově stejnou volnost jako administrátor.
create or replace function public.guard_lesson_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  new.starts_at   := old.starts_at;
  new.ends_at     := old.ends_at;
  new.subject     := old.subject;
  new.room_id     := old.room_id;
  new.lector_id   := old.lector_id;
  new.mode        := old.mode;
  new.kind        := old.kind;
  new.is_lead     := old.is_lead;
  new.lesson_type := old.lesson_type;
  new.created_at  := old.created_at;
  -- zbývá: done, status, description
  return new;
end $$;

-- 7) Mazání účtu -------------------------------------------------------------
-- Maže se řádek v auth.users; profil zmizí s ním (profiles.id má
-- on delete cascade). Karta lektora v `lectors` ZŮSTÁVÁ a jen se
-- deaktivuje – visí na ní odpracované hodiny ve work_log a ty se musí
-- dochovat i po odchodu člověka.
--
-- security definer = funkce běží s právy svého vlastníka, ne volajícího.
-- Jen tak se dá sáhnout do auth.users. O to důležitější je, že si hned
-- na začátku ověří, kdo volá – bez té kontroly by účty mohl mazat kdokoli
-- přihlášený.
create or replace function public.delete_user_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t_role   text;
  t_email  text;
  t_active boolean;
begin
  if not public.is_staff() then
    raise exception 'Účty smí mazat jen administrátor nebo auditor.';
  end if;

  if p_user = auth.uid() then
    raise exception 'Vlastní účet smazat nejde.';
  end if;

  select role, email, active into t_role, t_email, t_active
    from public.profiles where id = p_user;
  if t_role is null then
    raise exception 'Takový účet už neexistuje.';
  end if;

  if t_role = 'admin' then
    if not public.is_admin() then
      raise exception 'Účet administrátora smí smazat jen jiný administrátor.';
    end if;
    -- Poslední administrátor, který se může přihlásit, musí zůstat – jinak
    -- se do appky nikdo nedostane a role už nepůjde nastavit odjinud než ze
    -- SQL editoru. Zamčený administrátor se do počtu nepočítá, takže ten jde
    -- smazat vždycky.
    if t_active and (
      select count(*) from public.profiles where role = 'admin' and active
    ) <= 1 then
      raise exception 'Tohle je poslední administrátor – nechte aspoň jednoho.';
    end if;
  end if;

  -- Kartu lektora nemažeme, jen ji odložíme z nabídky.
  if t_email is not null then
    update public.lectors set active = false where email = t_email;
  end if;

  delete from auth.users where id = p_user;
end $$;

-- Nepřihlášený tuhle funkci nesmí ani zavolat.
revoke all     on function public.delete_user_account(uuid) from public, anon;
grant  execute on function public.delete_user_account(uuid) to authenticated;

-- Poslední přihlásitelný administrátor se nesmí ani zamknout, ani degradovat
-- na jinou roli – to je druhá cesta, jak se připravit o přístup do appky,
-- a kontrola v delete_user_account() ji nepokrývá.
create or replace function public.guard_last_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and (select count(*) from public.profiles where role = 'admin' and active) <= 1
  then
    raise exception 'Tohle je poslední administrátor – nechte aspoň jednoho.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_last_admin on profiles;
create trigger profiles_guard_last_admin
  before update on profiles
  for each row execute function public.guard_last_admin();


-- Kontrola po spuštění:
--   select name, email, role, active from profiles order by role, name;
--   select tablename, policyname, cmd from pg_policies
--     where schemaname = 'public' order by tablename, policyname;
