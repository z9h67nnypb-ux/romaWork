-- ===========================================================================
-- OVĚŘENÍ DATABÁZE PoraDys – testovací scénář počítání hodin
-- ---------------------------------------------------------------------------
-- Předpoklad: v Supabase už proběhl celý schema.sql.
-- Spouštěj po JEDNOTLIVÝCH KROCÍCH (označ blok myší -> Run) a porovnávej
-- výsledek s komentářem "OČEKÁVÁNÍ". Krok 9 po sobě všechno uklidí,
-- takže si testem nic nerozbiješ.
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
-- KROK 8: Hodiny přežijí smazání lekce (tohle je celý smysl work_logu:
--         lekce se po roce mažou, podklad pro výplaty zůstává 10+ let)
-- ---------------------------------------------------------------------------
update lessons set done = true
where lector_id = (select id from lectors where name = 'TEST Lektorka');

delete from lessons
where lector_id = (select id from lectors where name = 'TEST Lektorka');

select work_date, minutes, lesson_id from work_log
where lector_id = (select id from lectors where name = 'TEST Lektorka');

-- OČEKÁVÁNÍ: řádek s minutes = 90 POŘÁD EXISTUJE, jen lesson_id je NULL
--            (lekce už není, odpracovaná práce ano).


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
