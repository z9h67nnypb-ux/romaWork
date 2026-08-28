-- ===========================================================================
-- VYČIŠTĚNÍ DATABÁZE PŘED OSTRÝM PROVOZEM
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ---------------------------------------------------------------------------
-- ⚠️ NEVRATNÉ. Smaže VŠECHNA provozní data: lekce, směny, docházku, karty
--    klientů, platby, kredit, odpracované hodiny, diagnostické testy
--    i odeslané notifikace. Pusť to jen jednou, než se začne pracovat naostro.
--
-- CO ZŮSTANE:
--   • rooms    – učebny a stoly (číselník, ne data),
--   • profiles a auth.users – přihlašovací účty.
--
-- Účty se tímhle NEMAŽOU. Testovací účty smaž ručně v Supabase:
-- Authentication -> Users -> u řádku „…" -> Delete user. Profil zmizí s ním
-- (profiles.id má on delete cascade).
--
-- Ještě před spuštěním doporučuji zálohu: Supabase -> Database -> Backups,
-- nebo prostě `pg_dump`. Po spuštění už není co vracet.
-- ===========================================================================

-- Pojistka proti omylu: dokud je řádek zakomentovaný, skript nic neudělá
-- a jen vypíše, kolik řádků by smazal. Zkontroluj čísla, pak odkomentuj
-- poslední blok a spusť znovu.
select 'lessons' as tabulka, count(*) from lessons
union all select 'attendance',    count(*) from attendance
union all select 'students',      count(*) from students
union all select 'lectors',       count(*) from lectors
union all select 'payments',      count(*) from payments
union all select 'credit_log',    count(*) from credit_log
union all select 'work_log',      count(*) from work_log
union all select 'diagnostics',   count(*) from diagnostics
union all select 'notifications', count(*) from notifications
order by 1;

-- ---------------------------------------------------------------------------
-- ➜ ODKOMENTUJ NÁSLEDUJÍCÍ BLOK (označit + Ctrl+/) A SPUSŤ ZNOVU.
-- ---------------------------------------------------------------------------
-- truncate table
--   notifications,
--   credit_log,
--   work_log,
--   attendance,
--   payments,
--   diagnostics,
--   lessons,
--   students,
--   lectors
-- restart identity cascade;

-- Kontrola po smazání – všude musí být 0:
--   select 'lessons', count(*) from lessons
--   union all select 'students', count(*) from students
--   union all select 'payments', count(*) from payments
--   union all select 'diagnostics', count(*) from diagnostics;

-- Učebny zůstávají; kdyby se náhodou taky smazaly, obnov je spuštěním
-- bloku „ČÍSELNÍK UČEBEN / STOLŮ" ze schema.sql.
