-- ===========================================================================
-- MIGRACE: přístupová práva pro ostrý provoz (RLS)
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ---------------------------------------------------------------------------
-- Pro databázi, která vznikla ze starší verze schema.sql s prototypovými
-- politikami `proto_all` (= kdokoli se znalostí veřejného klíče směl číst
-- i zapisovat, i bez přihlášení). Tenhle skript je nahradí ostrými pravidly.
--
-- Je to TÁŽ část, kterou nově obsahuje i schema.sql – na nové databázi
-- ji spouštět nemusíš, na té staré ano.
--
-- ⚠️ NEJDŘÍV musí mít aspoň jeden účet roli 'admin', jinak po spuštění
--    nebude moct zapisovat nikdo:
--      update profiles set role = 'admin'
--      where id = (select id from auth.users where email = 'sem@dopln.cz');
--
-- Spouštěj až po migrace_ucty_lektoru.sql (potřebuje sloupec profiles.active).
-- ===========================================================================

-- ===========================================================================
-- BEZPEČNOST (RLS) – OSTRÝ PROVOZ
-- ---------------------------------------------------------------------------
-- Pravidlo: anonymní uživatel nevidí NIC. Přihlášený lektor čte rozvrh
-- a karty žáků (potřebuje to pohled lesson_details i diagnostika) a u své
-- lekce smí zapsat, že proběhla. Všechno ostatní – zakládání a mazání lekcí,
-- kartotéka, platby, výkaz hodin – patří administrátorovi.
--
-- ⚠️ NEJDŘÍV si nastav aspoň jeden účet jako 'admin' příkazem výš, jinak
--    po spuštění tohohle bloku nebude moct zapisovat nikdo.
--
-- Politiky se sčítají (OR): „read pro všechny přihlášené" platí i pro
-- administrátora, zápis navíc pouští is_admin().
-- ===========================================================================
alter table rooms         enable row level security;
alter table lectors       enable row level security;
alter table students      enable row level security;
alter table lessons       enable row level security;
alter table attendance    enable row level security;
alter table work_log      enable row level security;
alter table diagnostics   enable row level security;
alter table payments      enable row level security;
alter table credit_log    enable row level security;
alter table notifications enable row level security;

-- Prototypové „všechno všem" (i nepřihlášeným) musí zmizet dřív, než se
-- pustí nová pravidla – politiky se sčítají, takže by je jinak přebilo.
do $$
declare t text;
begin
  foreach t in array array['rooms','lectors','students','lessons','attendance',
                           'work_log','diagnostics','payments','credit_log','notifications']
  loop
    execute format('drop policy if exists proto_all on %I', t);
  end loop;
end $$;

-- ---------- Čtou všichni přihlášení, zapisuje administrátor ----------
-- (rozvrh, číselníky a karty žáků potřebuje k práci i lektor)
do $$
declare t text;
begin
  foreach t in array array['rooms','lectors','students','attendance','diagnostics']
  loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_write', t);
  end loop;
end $$;
-- Starší názvy politik ze schématu pro diagnostiku a žáky (nahrazeny výše).
drop policy if exists diag_read   on diagnostics;
drop policy if exists diag_insert on diagnostics;
drop policy if exists diag_update on diagnostics;
drop policy if exists diag_delete on diagnostics;
drop policy if exists stud_read   on students;
drop policy if exists stud_insert on students;
drop policy if exists stud_update on students;
drop policy if exists stud_delete on students;

-- ---------- Jen administrátor (peníze a mzdy) ----------
do $$
declare t text;
begin
  foreach t in array array['work_log','payments','credit_log','notifications']
  loop
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin', t);
  end loop;
end $$;
-- Kredit a hodiny plní databázové triggery (security definer), takže je
-- zavřená tabulka neomezí – zapisují mimo RLS.

-- ---------- Lekce ----------
-- Číst smí každý přihlášený, zakládat a mazat jen administrátor.
-- Upravit smí kdokoli přihlášený, ale lektorovi trigger níž vrátí zpátky
-- všechno kromě potvrzení a popisu – RLS sama sloupce omezit neumí.
drop policy if exists less_read   on lessons;
drop policy if exists less_insert on lessons;
drop policy if exists less_update on lessons;
drop policy if exists less_delete on lessons;

create policy less_read   on lessons for select to authenticated using (true);
create policy less_insert on lessons for insert to authenticated with check (is_admin());
create policy less_update on lessons for update to authenticated using (true) with check (true);
create policy less_delete on lessons for delete to authenticated using (is_admin());

-- Lektor u lekce hlásí jen „proběhla" a co se dělalo. Čas, učebnu, žáka ani
-- lektora měnit nesmí – tady se mu případná změna tiše vrátí na původní
-- hodnotu, takže rozvrh nemůže rozhodit ani ručně poslaným požadavkem.
--
-- auth.uid() is null = zápis mimo appku (SQL Editor, Table Editor, migrace,
-- service_role). Tam se nekrouhá nic, jinak by opravy z dashboardu tiše
-- mizely a nikdo by nechápal proč.
create or replace function public.guard_lesson_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
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

drop trigger if exists lessons_guard_update on lessons;
create trigger lessons_guard_update
  before update on lessons
  for each row execute function public.guard_lesson_update();

-- Kontrola po spuštění – nikde nesmí zůstat politika proto_all:
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, policyname;
