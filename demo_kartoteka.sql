-- ===========================================================================
-- DEMO DATA pro KARTOTÉKU (na ukázku šéfové)
-- ---------------------------------------------------------------------------
-- Vloží 10 ukázkových klientů s platbami a čerpáním kreditu tak, aby byly
-- vidět všechny funkce: barevná označení, souhrny peněz podle způsobu platby,
-- nízký/záporný kredit, bývalý klient.
--
-- Skript je znovu-spustitelný: nejdřív smaže demo klienty podle jmen (a jejich
-- platby/čerpání kaskádou), pak je vloží znovu. AŽ BUDETE CHTÍT DEMO ODSTRANIT,
-- spusťte jen blok „ÚKLID" na konci.
-- ===========================================================================

-- ÚKLID případných dřívějších demo klientů (ať jde skript pustit opakovaně)
delete from students where name in (
  'Nováková Tereza (demo)','Dvořák Jakub (demo)','Svobodová Anna (demo)',
  'Marek Vojtěch (demo)','Horáková Lucie (demo)','Beneš Šimon (demo)',
  'Kolářová Sofie (demo)','Zeman Daniel (demo)','Pokorná Karolína (demo)',
  'Urban Matěj (demo)'
);

-- KLIENTI
insert into students (name, phone, category, grade, subjects, lector_name, price_hour, payment_method, flag, status) values
  ('Nováková Tereza (demo)','777201001','ZŠ','7. třída','MAT','Kunkelová',440,'účet PoraDys','inperson','active'),
  ('Dvořák Jakub (demo)','777201002','ZŠ','9. tř. – přijímačky','ČJ, MAT','Šíma',430,'účet DR','contacted','active'),
  ('Svobodová Anna (demo)','777201003','SŠ','2. ročník','AJ','Štruncová',450,'hotově','online','active'),
  ('Marek Vojtěch (demo)','777201004','ZŠ','5. třída','ČJ','Mužíková',420,'účet jazykovka','inperson','active'),
  ('Horáková Lucie (demo)','777201005','SŠ','3. ročník','MAT, FYZ','Machalíková',450,'účet PoraDys','problem','active'),
  ('Beneš Šimon (demo)','777201006','ZŠ','8. třída','MAT','Jenčíková',430,'hotově',null,'active'),
  ('Kolářová Sofie (demo)','777201007','ZŠ','6. třída','ČJ','Bečková',420,'účet PoraDys','inperson','active'),
  ('Zeman Daniel (demo)','777201008','SŠ','1. ročník','AJ','Štruncová',450,'účet jazykovka','online','active'),
  ('Pokorná Karolína (demo)','777201009','ZŠ','9. tř. – přijímačky','ČJ, MAT','Šíma',430,'účet DR','contacted','active'),
  ('Urban Matěj (demo)','777201010','ZŠ','7. třída','MAT','Kunkelová',440,'hotově','ending','former');

-- PLATBY (kredit hodin) – u některých více plateb, ať je vidět historie
insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-05-06', 4400, 10, 'účet PoraDys' from students where name = 'Nováková Tereza (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-04-02', 4300, 10, 'účet DR' from students where name = 'Dvořák Jakub (demo)';
insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-10', 4300, 10, 'účet DR' from students where name = 'Dvořák Jakub (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-01', 4500, 10, 'hotově' from students where name = 'Svobodová Anna (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-15', 4200, 10, 'účet jazykovka' from students where name = 'Marek Vojtěch (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-05-20', 4500, 10, 'účet PoraDys' from students where name = 'Horáková Lucie (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-03', 6450, 15, 'hotově' from students where name = 'Beneš Šimon (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-22', 4200, 10, 'účet PoraDys' from students where name = 'Kolářová Sofie (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-03-11', 4500, 10, 'účet jazykovka' from students where name = 'Zeman Daniel (demo)';
insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-05-30', 4500, 10, 'účet jazykovka' from students where name = 'Zeman Daniel (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-06-18', 4300, 10, 'účet DR' from students where name = 'Pokorná Karolína (demo)';

insert into payments (student_id, paid_at, amount_czk, hours_credit, method)
select id, '2026-02-14', 4400, 10, 'hotově' from students where name = 'Urban Matěj (demo)';

-- ČERPÁNÍ KREDITU (simulace odučených hodin – normálně plní trigger z rozvrhu).
-- Balance = zaplaceno − vyčerpáno; schválně tak, ať jsou vidět i nízké/záporné.
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-20', 3, 'MAT' from students where name = 'Nováková Tereza (demo)';   -- 10-3 = 7
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-25', 18, 'ČJ' from students where name = 'Dvořák Jakub (demo)';        -- 20-18 = 2 (dochází)
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-28', 10, 'AJ' from students where name = 'Svobodová Anna (demo)';       -- 10-10 = 0 (NÍZKÝ)
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-26', 4, 'ČJ' from students where name = 'Marek Vojtěch (demo)';         -- 10-4 = 6
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-27', 11, 'MAT' from students where name = 'Horáková Lucie (demo)';      -- 10-11 = -1 (NÍZKÝ)
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-24', 6, 'MAT' from students where name = 'Beneš Šimon (demo)';          -- 15-6 = 9
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-23', 2, 'ČJ' from students where name = 'Kolářová Sofie (demo)';        -- 10-2 = 8
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-29', 5, 'AJ' from students where name = 'Zeman Daniel (demo)';          -- 20-5 = 15
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-30', 9, 'MAT' from students where name = 'Pokorná Karolína (demo)';     -- 10-9 = 1 (dochází)
insert into credit_log (student_id, lesson_date, hours, subject)
select id, '2026-06-19', 10, 'MAT' from students where name = 'Urban Matěj (demo)';         -- 10-10 = 0 (bývalý)

-- Kontrola: přehled TOTAL pro demo klienty
select name, payment_method, flag, paid_hours, used_hours, balance_hours
from student_credit where name like '%(demo)%' order by name;

-- ===========================================================================
-- ÚKLID – smazání demo dat (spusť, až demo nebude potřeba):
-- delete from students where name like '%(demo)%';
-- ===========================================================================
