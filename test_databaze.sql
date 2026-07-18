-- ===========================================================================
-- OVĚŘENÍ DATABÁZE PoraDys – testovací scénář počítání hodin
-- ---------------------------------------------------------------------------
-- Předpoklad: v Supabase už proběhl celý schema.sql.
--
-- DŮLEŽITÉ: SQL Editor v Supabase zobrazí jen výsledek POSLEDNÍHO příkazu.
-- Proto jsou tu dvě varianty:
--   VARIANTA A – spusť celou najednou, na konci vyjde tabulka OK/CHYBA.
--   VARIANTA B – ruční krokování (označ blok myší -> Run) s vysvětlením.
-- ===========================================================================

-- ===========================================================================
-- VARIANTA A: VŠE NAJEDNOU – označ tenhle celý blok (po "select * from _vysledky")
-- a dej Run. Vyjde tabulka; ve sloupci "vysledek" musí být všude OK.
-- Test po sobě uklidí, v databázi nic nezůstane.
-- ===========================================================================
drop table if exists _vysledky;
create temp table _vysledky (krok text, ocekavani text, skutecnost text, vysledek text);

do $test$
declare
  v_lector uuid;
  v_lesson uuid;
  v_student uuid;
  n int; m int; h numeric; p numeric; b numeric;
begin
  -- úklid případných zbytků z dřívějšího testu
  delete from work_log where lector_id in (select id from lectors where name = 'TEST Lektorka');
  delete from lessons  where lector_id in (select id from lectors where name = 'TEST Lektorka');
  delete from lectors  where name = 'TEST Lektorka';
  delete from students where name = 'TEST Žák';

  -- testovací lektorka (250 Kč/h) + lekce včera 14:00–15:30, zatím nepotvrzená
  insert into lectors (name, hourly_rate) values ('TEST Lektorka', 250) returning id into v_lector;
  insert into lessons (starts_at, ends_at, subject, lector_id, mode)
  values ((current_date - 1 + time '14:00') at time zone 'Europe/Prague',
          (current_date - 1 + time '15:30') at time zone 'Europe/Prague',
          'MAT', v_lector, 'offline')
  returning id into v_lesson;

  -- 1) před potvrzením se hodiny nepočítají
  select count(*) into n from work_log where lector_id = v_lector;
  insert into _vysledky values ('1. Před potvrzením lekce', '0 záznamů', n || ' záznamů',
                                case when n = 0 then 'OK' else 'CHYBA' end);

  -- 2) "odmáčknutí" lekce připíše 90 minut
  update lessons set done = true where id = v_lesson;
  select coalesce(min(minutes), -1) into m from work_log where lector_id = v_lector;
  insert into _vysledky values ('2. Po potvrzení (lekce 90 min)', '90 minut', m || ' minut',
                                case when m = 90 then 'OK' else 'CHYBA' end);

  -- 3) měsíční výkaz: 1.5 h × 250 Kč = 375 Kč
  select hours, payout_czk into h, p from lector_monthly_hours where lector_name = 'TEST Lektorka';
  insert into _vysledky values ('3. Měsíční výkaz', '1.50 h / 375 Kč',
                                coalesce(h::text, 'nic') || ' h / ' || coalesce(p::text, 'nic') || ' Kč',
                                case when h = 1.5 and p = 375 then 'OK' else 'CHYBA' end);

  -- 4) zrušení potvrzení hodiny zase odebere
  update lessons set done = false where id = v_lesson;
  select count(*) into n from work_log where lector_id = v_lector;
  insert into _vysledky values ('4. Po zrušení potvrzení', '0 záznamů', n || ' záznamů',
                                case when n = 0 then 'OK' else 'CHYBA' end);

  -- 5) ruční smazání lekce odebere i hodiny z výkazu
  update lessons set done = true where id = v_lesson;
  delete from lessons where id = v_lesson;
  select count(*) into n from work_log where lector_id = v_lector;
  insert into _vysledky values ('5. Smazání lekce smaže i hodiny', '0 záznamů', n || ' záznamů',
                                case when n = 0 then 'OK' else 'CHYBA' end);

  -- 6) roční úklid hodiny ZACHOVÁ (purge je před mazáním lekcí odpojí)
  insert into lessons (starts_at, ends_at, subject, lector_id, mode)
  values ((current_date - 1 + time '16:00') at time zone 'Europe/Prague',
          (current_date - 1 + time '17:00') at time zone 'Europe/Prague',
          'MAT', v_lector, 'offline')
  returning id into v_lesson;
  update lessons set done = true where id = v_lesson;
  update work_log set lesson_id = null where lesson_id = v_lesson; -- přesně tohle dělá purge_old_lessons
  delete from lessons where id = v_lesson;
  select count(*) into n from work_log where lector_id = v_lector and lesson_id is null;
  insert into _vysledky values ('6. Roční úklid hodiny zachová', '1 záznam (lesson_id = NULL)', n || ' záznamů',
                                case when n = 1 then 'OK' else 'CHYBA' end);

  -- 7) kartotéka: platba přidá kredit, odučená lekce s účastí ho čerpá
  insert into students (name) values ('TEST Žák') returning id into v_student;
  insert into payments (student_id, amount_czk, hours_credit, method, note)
  values (v_student, 4200, 10, 'test', 'testovací platba');
  insert into lessons (starts_at, ends_at, subject, lector_id, mode)
  values ((current_date - 1 + time '10:00') at time zone 'Europe/Prague',
          (current_date - 1 + time '11:30') at time zone 'Europe/Prague',
          'MAT', v_lector, 'offline')
  returning id into v_lesson;
  insert into attendance (lesson_id, student_id) values (v_lesson, v_student);
  update lessons set done = true where id = v_lesson;
  select balance_hours into b from student_credit where student_id = v_student;
  insert into _vysledky values ('7. Kredit: zaplaceno 10 h, odučeno 1,5 h', '8.50 h', coalesce(b::text, 'nic') || ' h',
                                case when b = 8.5 then 'OK' else 'CHYBA' end);

  -- 8) smazání lekce kredit zase vrátí
  delete from lessons where id = v_lesson;
  select balance_hours into b from student_credit where student_id = v_student;
  insert into _vysledky values ('8. Smazání lekce kredit vrátí', '10.00 h', coalesce(b::text, 'nic') || ' h',
                                case when b = 10 then 'OK' else 'CHYBA' end);

  -- úklid po testu
  delete from students where id = v_student; -- smaže i platby a čerpání (cascade)
  delete from work_log where lector_id = v_lector;
  delete from lectors  where id = v_lector;
end $test$;

select * from _vysledky;

-- ===========================================================================
-- VARIANTA B: RUČNÍ KROKOVÁNÍ – spouštěj po JEDNOTLIVÝCH KROCÍCH
-- (označ blok myší -> Run) a porovnávej výsledek s komentářem "OČEKÁVÁNÍ".
-- Krok 9 po sobě všechno uklidí, takže si testem nic nerozbiješ.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- KROK 1: Založ testovacího pracovníka se sazbou 250 Kč/h
-- ---------------------------------------------------------------------------
insert into lectors (name, hourly_rate, hired_at)
values ('TEST Lektorka', 250, current_date);

-- OČEKÁVÁNÍ: "Success. 1 rows affected."


-- ---------------------------------------------------------------------------
-- KROK 2: Založ mu lekci (včera 14:00–15:30), zatím NEPOTVRZENOU
--         (tohle normálně dělá admin v appce přes "+ Nová lekce")
-- ---------------------------------------------------------------------------
insert into lessons (starts_at, ends_at, subject, lector_id, mode)
values (
  (current_date - 1 + time '14:00') at time zone 'Europe/Prague',
  (current_date - 1 + time '15:30') at time zone 'Europe/Prague',
  'MAT',
  (select id from lectors where name = 'TEST Lektorka'),
  'offline'
);

-- OČEKÁVÁNÍ: "Success. 1 rows affected."


-- ---------------------------------------------------------------------------
-- KROK 3: Zkontroluj, že hodiny se JEŠTĚ nepočítají (lekce není odučená)
-- ---------------------------------------------------------------------------
select * from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: 0 řádků.


-- ---------------------------------------------------------------------------
-- KROK 4: "Odmáčkni" lekci jako Odučeno
--         (přesně tohle udělá appka, když lektor zaškrtne checkbox)
-- ---------------------------------------------------------------------------
update lessons set done = true
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: "Success. 1 rows affected."


-- ---------------------------------------------------------------------------
-- KROK 5: Trigger měl hodiny automaticky připsat – zkontroluj
-- ---------------------------------------------------------------------------
select work_date, minutes, subject from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: 1 řádek, minutes = 90 (lekce 14:00–15:30), work_date = včerejšek.


-- ---------------------------------------------------------------------------
-- KROK 6: Měsíční výkaz – tohle vidí šéfová (a tlačítko "Výkaz hodin")
-- ---------------------------------------------------------------------------
select * from lector_monthly_hours where lector_name = 'TEST Lektorka';

-- OČEKÁVÁNÍ: 1 řádek: lessons = 1, hours = 1.50, payout_czk = 375
--            (1,5 h × 250 Kč).


-- ---------------------------------------------------------------------------
-- KROK 7: Když lektor potvrzení ZRUŠÍ, hodiny se zase odepíšou
-- ---------------------------------------------------------------------------
update lessons set done = false
where lector_id = (select id from lectors where name = 'TEST Lektorka');

select count(*) as zaznamu_ve_work_logu from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: zaznamu_ve_work_logu = 0.


-- ---------------------------------------------------------------------------
-- KROK 8: Ruční smazání lekce odebere i hodiny z výkazu.
--         (Roční úklid purge_old_lessons hodiny naopak zachová – před
--         smazáním lekcí je odpojí, viz kontrola č. 6 ve Variantě A.)
-- ---------------------------------------------------------------------------
update lessons set done = true
where lector_id = (select id from lectors where name = 'TEST Lektorka');

delete from lessons
where lector_id = (select id from lectors where name = 'TEST Lektorka');

select count(*) as zaznamu_ve_work_logu from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: 0 – smazaná lekce byla omyl v rozvrhu, hodiny za ni nenáleží.


-- ---------------------------------------------------------------------------
-- KROK 9: Úklid – smaž testovací data (po tomhle je databáze jako předtím)
-- ---------------------------------------------------------------------------
delete from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');
delete from lectors where name = 'TEST Lektorka';

-- OČEKÁVÁNÍ: "Success." – a je uklizeno.


-- ===========================================================================
-- BONUS: test ročního úklidu lekcí (purge_old_lessons)
-- POZOR: maže VŠECHNY lekce starší 13 měsíců – na čerstvé testovací databázi
-- je to bezpečné, na ostré to je přesně to, co jednou měsíčně chceš.
-- ===========================================================================
-- insert into lessons (starts_at, ends_at, subject)
-- values (now() - interval '2 years', now() - interval '2 years' + interval '1 hour', 'STARÁ');
-- select purge_old_lessons();   -- OČEKÁVÁNÍ: vrátí počet smazaných (aspoň 1)
-- select count(*) from lessons where subject = 'STARÁ';   -- OČEKÁVÁNÍ: 0
