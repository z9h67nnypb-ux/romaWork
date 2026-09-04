-- ===========================================================================
-- MIGRACE: kartotéka lektorů
-- ---------------------------------------------------------------------------
-- Doplní ke kartě lektora (tabulka `lectors`) údaje, které se do téhle chvíle
-- vedly mimo appku: adresu, co učí, do kdy má smlouvu, jaké má klíče, jestli
-- podepsal daňové prohlášení a poznámku.
--
-- Odučené hodiny se NEUKLÁDAJÍ – počítají se pořád z `work_log` přes pohled
-- `lector_monthly_hours` (viz schema.sql), který stránka čte za vybraný měsíc.
-- Zrušené tlačítko „Výkaz hodin" tedy o nic nepřišlo, jen se čísla ukazují
-- v kartotéce vedle zbytku údajů o lektorovi.
--
-- Spusť celé v Supabase: SQL Editor -> New query -> vlož -> Run.
-- Migrace je bezpečně opakovatelná (add column if not exists).
-- ===========================================================================

alter table lectors add column if not exists address        text;   -- bydliště
alter table lectors add column if not exists subjects       text;   -- co učí (ČJ, MAT…)
alter table lectors add column if not exists contract_until date;   -- do kdy má smlouvu
alter table lectors add column if not exists note           text;   -- volná poznámka

-- Klíče od pobočky. Jedna hodnota ze tří (víc naráz nikdo nemá):
--   'chip'       = 1. čip
--   'chip_attic' = 2. čip + podkroví
--   'full'       = 3. celý svazek
-- NULL / prázdno = klíče nemá.
alter table lectors add column if not exists key_set text;

alter table lectors drop constraint if exists lectors_key_set_chk;
alter table lectors add constraint lectors_key_set_chk
  check (key_set is null or key_set in ('chip', 'chip_attic', 'full'));

-- Podepsal daňové prohlášení? Prosté ano/ne.
alter table lectors add column if not exists tax_signed boolean not null default false;

-- Karta lektora se v appce zakládá sama: jakmile se do rozvrhu napíše jméno
-- lektora (u lekce i u zápisu „lektor u stolu"), appka na něj řádek v téhle
-- tabulce založí. Kartotéka pak jen doplňuje zbytek údajů.
--
-- Práva se nemění: `lectors` čte každý přihlášený a zapisuje administrátor
-- i auditor (politiky lectors_read / lectors_write ze schema.sql). Kartotéka
-- lektorů je mzdová a provozní agenda, ne platby klientů – proto do ní na
-- rozdíl od kartotéky klientů vidí i auditor.
