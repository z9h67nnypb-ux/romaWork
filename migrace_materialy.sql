-- ===========================================================================
-- MIGRACE: materiály na procvičování k oblastem diagnostiky
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ---------------------------------------------------------------------------
-- Materiál se váže na OBLAST TESTU, ne na konkrétní test ani žáka. Admin
-- (nebo auditor) nahraje jednou pracovní list ke „Zlomkům" a od té chvíle ho
-- u sebe vidí každý žák, kterému zlomky podle testu nejdou. Kdyby se to
-- věšelo na test, muselo by se to nahrávat pořád dokola.
--
-- Klíč oblasti (`area_key`) je ten samý, který se ukládá do diagnostics.scores
-- a je vypsaný v konstantě SUBJECTS v diagnostika.js – např. 'zlomky',
-- 'geometrie', 'pravopis'. Proto se klíče po nasazení nesmí měnit.
--
-- Materiál je buď SOUBOR v úložišti (bucket `materialy`), nebo ODKAZ ven.
-- Jedno z toho musí být vyplněné, obojí naráz nedává smysl.
--
-- Spouštěj až po migrace_role_auditor.sql (potřebuje funkci is_staff()).
-- ===========================================================================

create table if not exists materials (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null,               -- 'matematika' | 'cestina'
  area_key     text not null,               -- klíč oblasti ze SUBJECTS
  title        text not null,
  note         text,                        -- k čemu to je, jak s tím pracovat
  storage_path text,                        -- cesta v bucketu `materialy`
  url          text,                        -- nebo odkaz ven (online cvičení)
  file_name    text,                        -- původní název souboru pro stažení
  file_size    bigint,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint materials_zdroj_chk check (
    (storage_path is not null and url is null) or
    (storage_path is null and url is not null)
  )
);

create index if not exists materials_area_idx on materials (subject, area_key, created_at);

-- ---------------------------------------------------------------------------
-- Práva: čtou všichni přihlášení (lektor si materiál otevře na hodině),
-- nahrává a maže administrátor nebo auditor.
-- ---------------------------------------------------------------------------
alter table materials enable row level security;
drop policy if exists materials_read  on materials;
drop policy if exists materials_write on materials;

create policy materials_read  on materials for select to authenticated using (true);
create policy materials_write on materials for all    to authenticated
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- ÚLOŽIŠTĚ SOUBORŮ
-- ---------------------------------------------------------------------------
-- Neveřejný bucket – soubory se otevírají přes dočasně podepsanou adresu,
-- kterou si appka vyžádá až ve chvíli, kdy na materiál někdo klikne.
-- Kdyby byl bucket veřejný, stačila by komukoli znalost cesty.
insert into storage.buckets (id, name, public)
values ('materialy', 'materialy', false)
on conflict (id) do nothing;

drop policy if exists materialy_read   on storage.objects;
drop policy if exists materialy_insert on storage.objects;
drop policy if exists materialy_delete on storage.objects;

create policy materialy_read on storage.objects
  for select to authenticated using (bucket_id = 'materialy');
create policy materialy_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'materialy' and is_staff());
create policy materialy_delete on storage.objects
  for delete to authenticated using (bucket_id = 'materialy' and is_staff());

-- Kontrola po spuštění:
--   select subject, area_key, title, coalesce(file_name, url) as zdroj
--   from materials order by subject, area_key;
