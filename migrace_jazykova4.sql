-- ===========================================================================
-- MIGRACE: nový stůl „Jazyková stůl 4"
-- ---------------------------------------------------------------------------
-- Pro databázi, která už běží. Spusť CELÝ tenhle soubor v Supabase:
--   SQL Editor -> New query -> vlož -> Run.
--
-- ⚠️ NESPOUŠTĚJ znovu celý schema.sql – má na konci ukázková data.
--
-- Přidá nový stůl a přečísluje pořadí, aby v rozvrhu seděl hned za
-- Jazykovou stůl 3. `sort` určuje pořadí sloupců zleva doprava.
-- Migrace je bezpečně opakovatelná.
-- ===========================================================================

insert into rooms (id, name, color, sort)
values ('jaz-4','Jazyková stůl 4','#9c3a32',7)
on conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort;

-- Posun zbývajících stolů o jedno místo doprava
update rooms set sort =  8 where id = 'vse-1';
update rooms set sort =  9 where id = 'vse-2';
update rooms set sort = 10 where id = 'vse-3';
update rooms set sort = 11 where id = 'vse-4';
update rooms set sort = 12 where id = 'mat-1';
update rooms set sort = 13 where id = 'mat-2';
update rooms set sort = 14 where id = 'mat-3';
update rooms set sort = 15 where id = 'mat-4';
update rooms set sort = 16 where id = 'mat-5';
update rooms set sort = 17 where id = 'mat-6';

-- ---------------------------------------------------------------------------
-- Kontrola po spuštění – musí vrátit 17 stolů v pořadí zleva doprava:
--   select sort, id, name from rooms order by sort;
-- ---------------------------------------------------------------------------
