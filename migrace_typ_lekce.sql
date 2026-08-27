-- ===========================================================================
-- MIGRACE: druh lekce – mimořádná vs. klasická (opakovaná)
-- ---------------------------------------------------------------------------
-- Pro databázi, která už běží. Spusť CELÝ tenhle soubor v Supabase:
--   SQL Editor -> New query -> vlož -> Run.
--
-- ⚠️ NESPOUŠTĚJ znovu celý schema.sql – má na konci ukázková data.
--
-- Co přidává:
--   * sloupec lessons.lesson_type ... 'regular' = klasická opakovaná lekce
--                                     'extra'   = mimořádná (jednorázová)
--   * ten samý sloupec do pohledu lesson_details, ať ho rozvrh vidí
--
-- POZOR: `kind` ('lesson' / 'shift') zůstává – to je rozlišení "lekce vs.
-- lektor u stolu" a s druhem lekce nemá nic společného. V appce už se
-- nepřepíná ručně, řídí ho tlačítka „+ Lekce" a „+ Lektor".
--
-- Migrace je bezpečně opakovatelná (podruhé jen vypíše, že už je hotovo).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Sloupec v tabulce
-- ---------------------------------------------------------------------------
alter table lessons
  add column if not exists lesson_type text not null default 'regular';

comment on column lessons.lesson_type is
  'regular = klasická opakovaná lekce (chodí každý týden), extra = mimořádná jednorázová';

-- ---------------------------------------------------------------------------
-- 2) Sloupec do pohledu lesson_details
-- ---------------------------------------------------------------------------
-- Pohled se NEPŘEPISUJE ručně vypsaným seznamem sloupců. Ostrá databáze má
-- v lesson_details sloupce, které ve schema.sql nejsou (např. is_lead), a
-- "create or replace view" hlídá, že se stávajícím sloupcům nezmění pořadí
-- ani název – vypsaný seznam proto spadne na hlášce:
--     cannot change name of view column "is_lead" to "lesson_type"
--
-- Místo toho si vezmeme SOUČASNOU definici pohledu, ať je jakákoli, obalíme
-- ji a lesson_type přidáme až za ni. Stávající sloupce si tak podrží pořadí
-- i názvy (jediné, co create or replace vyžaduje) a nic se neztratí.
--
-- Napojení přes v.id = l.id řádky nemnoží – lesson_details má jeden řádek na
-- lekci (group by l.id). Je schválně LEFT, aby řádek nemohl zmizet ani kdyby
-- se id nepotkalo; appka bere prázdný druh jako 'regular'.
do $mig$
declare v_def text;
begin
  if to_regclass('public.lesson_details') is null then
    raise exception 'Pohled lesson_details neexistuje – nejdřív spusť schema.sql.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'lesson_details'
      and column_name  = 'lesson_type'
  ) then
    raise notice 'lesson_details už sloupec lesson_type má – přeskakuji.';
    return;
  end if;

  select pg_get_viewdef('public.lesson_details'::regclass, true) into v_def;
  v_def := regexp_replace(v_def, ';\s*$', '');   -- pryč středník na konci

  execute format(
    'create or replace view public.lesson_details with (security_invoker = on) as
       select v.*, l.lesson_type
       from (%s) v
       left join public.lessons l on l.id = v.id', v_def);

  raise notice 'lesson_details rozšířen o lesson_type.';
end
$mig$;

-- ---------------------------------------------------------------------------
-- Kontrola po spuštění – musí projít a vrátit sloupec lesson_type:
--   select id, starts_at, kind, lesson_type from lesson_details limit 5;
--
-- Kontrola, že se nezměnil počet řádků (obě čísla musí být stejná):
--   select (select count(*) from lessons) as lekci,
--          (select count(*) from lesson_details) as v_pohledu;
--
-- A tohle vypíše, jak pohled teď doopravdy vypadá – pošli to Claudovi, ať
-- se schema.sql srovná s ostrou databází (kvůli is_lead a spol.):
--   select pg_get_viewdef('public.lesson_details'::regclass, true);
-- ---------------------------------------------------------------------------
