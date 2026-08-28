-- ===========================================================================
-- MIGRACE: účty lektorů se zakládají přímo z appky
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ---------------------------------------------------------------------------
-- Do teď se účty zakládaly ručně v Supabase (Authentication -> Users) a roli
-- musel někdo dopsat SQL příkazem. Nově to zvládne administrátor v appce
-- (Rozvrh -> tlačítko „Lektoři"): vyplní jméno, e-mail a heslo, účet vznikne
-- v auth.users a v profiles se objeví řádek s rolí.
--
-- Co k tomu databáze potřebuje:
--   1) profiles si drží i e-mail (jinak by admin v seznamu viděl jen jména),
--   2) sloupec active – odebrání přístupu bez mazání účtu,
--   3) politiky, aby administrátor viděl a měnil VŠECHNY profily
--      (dosud existovalo jen čtení vlastního profilu),
--   4) jména lektorů v tabulce lectors se ohlídají proti duplicitám.
--
-- ⚠️ V Supabase musí být povolené zakládání účtů heslem a VYPNUTÉ potvrzování
--    e-mailem: Authentication -> Sign In / Providers -> Email ->
--    „Confirm email" OFF. Jinak lektor sice v databázi vznikne, ale dokud
--    neklikne na potvrzovací odkaz, nepřihlásí se.
-- ===========================================================================

-- 1) E-mail a příznak aktivního účtu -----------------------------------------
alter table profiles add column if not exists email  text;
alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists created_at timestamptz not null default now();

-- Doplnit e-maily k účtům, které vznikly dřív.
update profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- Trigger na nového uživatele nově ukládá i e-mail. Zbytek beze změny:
-- běží jako security definer s přibitým search_path, jinak Supabase Auth
-- schéma public nevidí a založení uživatele spadne.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.email),
          new.email,
          'lektor')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Práva k tabulce profiles ------------------------------------------------
-- Každý smí číst svůj profil (appka z něj bere roli a jméno); administrátor
-- vidí a mění všechny, aby mohl zakládat lektory a odebírat přístup.
--
-- POZOR: is_admin() čte profiles, takže by se politika volala sama na sebe
-- a Postgres by skončil na nekonečné rekurzi. Proto je funkce security
-- definer – běží mimo RLS a rekurze nevznikne.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table profiles enable row level security;
drop policy if exists read_own_profile   on profiles;
drop policy if exists prof_read          on profiles;
drop policy if exists prof_admin_read    on profiles;
drop policy if exists prof_admin_update  on profiles;
drop policy if exists prof_admin_delete  on profiles;

create policy prof_read on profiles
  for select to authenticated using (auth.uid() = id or is_admin());
create policy prof_admin_update on profiles
  for update to authenticated using (is_admin()) with check (is_admin());
create policy prof_admin_delete on profiles
  for delete to authenticated using (is_admin());

-- Vlastní profil nikdo nesmí povýšit na admina ani si ho oživit – proto tu
-- ŽÁDNÁ politika „update vlastního profilu" není. Jméno mění administrátor.

-- 3) Karta lektora (tabulka lectors) ----------------------------------------
-- Rozvrh páruje lektora podle jména, výkaz hodin taky. Když administrátor
-- založí účet, appka rovnou vytvoří i kartu lektora se stejným jménem,
-- ať se hodiny mají kam počítat a jméno se dá našeptat ve formuláři lekce.
-- Kdyby v tabulce už dvě karty se stejným jménem byly, index se nevytvoří
-- a příkaz skončí chybou – nejdřív je slučte:
--   select name, count(*) from lectors group by name having count(*) > 1;
create unique index if not exists lectors_name_uidx on lectors (name);

-- Kontrola po spuštění:
--   select name, email, role, active from profiles order by created_at;
