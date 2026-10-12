-- ===========================================================================
-- MIGRACE: vlastní stoly pro online výuku („Online 1, Online 2…")
-- Spusť v Supabase: SQL Editor -> New query -> vlož -> Run.
-- Migrace je bezpečně opakovatelná.
-- ---------------------------------------------------------------------------
-- Online rozvrh dřív kreslil stejné sloupce jako osobní výuka („Matematická
-- stůl 1"…). Lektoři pak nevěděli, jestli jsou zapsaní online, nebo na
-- pobočce, a online lekce navíc kolidovala s osobní lekcí ve stejném stole.
--
-- Číselník stolů teď nese režim (rooms.mode). Online rozvrh ukazuje jen online
-- stoly, osobní jen fyzické. Online stolů je stejně jako fyzických a stojí ve
-- stejném pořadí, takže se rozvrh online výuky nijak nepřeskládá – jen se
-- sloupce jinak jmenují.
--
-- Existující online lekce a zápisy lektorů se přesunou do online stolu se
-- stejným pořadím (1. fyzický stůl -> Online 1, 2. -> Online 2 …).
-- Odpracované hodiny ani kredit se tím nemění – ty na stole nezávisí.
--
-- Spouštěj až po migrace_smlouva_a_mazani.sql.
-- ===========================================================================

alter table rooms add column if not exists mode text not null default 'offline';  -- 'offline' | 'online'
alter table rooms drop constraint if exists rooms_mode_chk;
alter table rooms add constraint rooms_mode_chk check (mode in ('offline', 'online'));

-- Jeden online stůl za každý fyzický. Barvy se střídají (dvě tmavší
-- petrolejové), ať se sousední sloupce dají rozeznat a bílé písmo v bloku
-- lekce zůstane čitelné.
insert into rooms (id, name, color, sort, mode)
select 'online-' || rn,
       'Online ' || rn,
       case when rn % 2 = 1 then '#1f7a8c' else '#287271' end,
       100 + rn,
       'online'
from (
  select row_number() over (order by sort, id) as rn
  from rooms where mode = 'offline'
) x
on conflict (id) do nothing;

-- Online lekce a zápisy lektorů, které dosud stály ve fyzickém stole, se
-- přestěhují do odpovídajícího online stolu.
update lessons l
set room_id = 'online-' || r.rn
from (
  select id, row_number() over (order by sort, id) as rn
  from rooms where mode = 'offline'
) r
where l.room_id = r.id
  and l.mode = 'online';

-- Kontrola po spuštění:
--   select id, name, mode from rooms order by mode, sort;
--   select count(*) from lessons l join rooms r on r.id = l.room_id
--     where l.mode <> r.mode;          -- má vyjít 0
