-- ===========================================================================
-- MIGRACE: údaje klienta v rozvrhu (telefon, ročník, kategorie)
-- ---------------------------------------------------------------------------
-- Pro databázi, která už běží. Spusť CELÝ tenhle soubor v Supabase:
--   SQL Editor -> New query -> vlož -> Run.
--
-- ⚠️ NESPOUŠTĚJ znovu celý schema.sql – má na konci ukázková data.
-- ⚠️ Nejdřív musí být spuštěná migrace `migrace_smeny.sql` (sloupec kind).
--
-- Co to udělá: pohled lesson_details začne vedle jména žáka vracet i jeho
-- telefon, třídu/ročník a kategorii (ZŠ/SŠ/pracující) z kartotéky. Rozvrh je
-- pak ukazuje přímo v buňce i v detailu lekce, aniž by se cokoli duplikovalo –
-- zdrojem zůstává karta klienta.
--
-- Migrace je bezpečně opakovatelná.
-- ===========================================================================

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
  -- nové sloupce se u "create or replace view" smí přidávat jen na konec
  coalesce(string_agg(s.phone,    ', ' order by s.name), '') as student_phone,
  coalesce(string_agg(s.grade,    ', ' order by s.name), '') as student_grade,
  coalesce(string_agg(s.category, ', ' order by s.name), '') as student_category
from lessons l
left join rooms r    on r.id = l.room_id
left join lectors lec on lec.id = l.lector_id
left join attendance a on a.lesson_id = l.id
left join students s  on s.id = a.student_id
group by l.id, r.name, r.color, lec.name;

-- ---------------------------------------------------------------------------
-- Kontrola po spuštění (musí projít bez chyby):
--   select student_names, student_phone, student_grade, student_category
--   from lesson_details limit 5;
-- ---------------------------------------------------------------------------
