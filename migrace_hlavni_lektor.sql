-- ===========================================================================
-- MIGRACE: hlavní lektor dne (hvězdička u lektora u stolu)
-- ---------------------------------------------------------------------------
-- Pro databázi, která už běží. Spusť CELÝ tenhle soubor v Supabase:
--   SQL Editor -> New query -> vlož -> Run.
--
-- ⚠️ NESPOUŠTĚJ znovu celý schema.sql – má na konci ukázková data.
--
-- Co to dělá: k zápisu „lektor u stolu" (kind = 'shift') přidá příznak
-- is_lead. Administrátor jím v detailu proužku označí jednu směnu dne jako
-- hlavního lektora – v rozvrhu pak dostane hvězdičku a žluté pozadí.
-- Migrace je bezpečně opakovatelná.
-- ===========================================================================

alter table lessons add column if not exists is_lead boolean not null default false;

-- Hledá se vždy „hlavní lektor v tenhle den", tak ať to není průchod tabulkou.
create index if not exists lessons_lead_idx on lessons (starts_at) where is_lead;

-- Pohled, ze kterého čte rozvrh, musí nový sloupec vracet.
-- U "create or replace view" se smí sloupce přidávat jen NA KONEC seznamu –
-- pořadí zbytku proto zůstává přesně takové, jaké je v schema.sql.
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
  l.kind,
  coalesce(string_agg(s.phone,    ', ' order by s.name), '') as student_phone,
  coalesce(string_agg(s.grade,    ', ' order by s.name), '') as student_grade,
  coalesce(string_agg(s.category, ', ' order by s.name), '') as student_category,
  l.is_lead
from lessons l
left join rooms r    on r.id = l.room_id
left join lectors lec on lec.id = l.lector_id
left join attendance a on a.lesson_id = l.id
left join students s  on s.id = a.student_id
group by l.id, r.name, r.color, lec.name;

-- ---------------------------------------------------------------------------
-- Kontrola po spuštění – musí projít bez chyby a vrátit prázdný výsledek
-- (dokud někomu hvězdičku nedáš):
--   select starts_at::date, lector_id, room_id from lessons where is_lead;
--
-- Kdyby někdy vznikli dva hlavní lektoři v jednom dni (appka to hlídá sama,
-- ale ruční zásah v SQL ne), vidíš je takhle:
--   select (starts_at at time zone 'Europe/Prague')::date as den, count(*)
--   from lessons where is_lead group by 1 having count(*) > 1;
-- ---------------------------------------------------------------------------
