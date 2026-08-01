-- ===========================================================================
-- PoraDys – databázové schéma pro Supabase (PostgreSQL)
-- Spusť celé v Supabase: SQL Editor -> New query -> vlož -> Run.
-- ===========================================================================

-- ---------- Tabulky ----------

-- Učebny / stoly (= sloupce v rozvrhu). Barva určuje barvu bloku v kalendáři.
create table if not exists rooms (
  id    text primary key,           -- např. 'mat-1'
  name  text not null,
  color text not null default '#4569b0',
  sort  int  not null default 0
);

-- Lektoři
create table if not exists lectors (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  phone   text,
  email   text,
  active  boolean not null default true
);

-- Žáci (aktuální i bývalí – rozlišuje sloupec status)
create table if not exists students (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  phone   text,                     -- SMS chodí žákovi na toto číslo
  email   text,
  school  text,
  status  text not null default 'active',  -- 'active' | 'former'
  since   date default now(),
  until   date,
  note    text
);

-- Lekce
create table if not exists lessons (
  id          uuid primary key default gen_random_uuid(),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  subject     text,
  room_id     text references rooms(id),         -- NULL = nemá místnost (např. online)
  lector_id   uuid references lectors(id),
  mode        text not null default 'offline',   -- 'offline' | 'online'
  status      text not null default 'planned',   -- 'planned' | 'done' | 'cancelled' | 'no_show'
  done        boolean not null default false,    -- lektor potvrdil, že lekce proběhla
  description text,                              -- co se na lekci dělalo
  created_at  timestamptz not null default now()
);

create index if not exists lessons_starts_at_idx on lessons (starts_at);
create index if not exists lessons_room_idx on lessons (room_id);

-- Řádek v rozvrhu je buď LEKCE, nebo SMĚNA lektora u stolu ("kdo tu dnes je
-- a od kolika do kolika"). Směna je jen informace do hlavičky sloupce –
-- nepočítá se do odpracovaných hodin ani nečerpá kredit žáka a nekoliduje
-- s lekcemi, takže se lekce dají zakládat uvnitř směny.
alter table lessons add column if not exists kind text not null default 'lesson';  -- 'lesson' | 'shift'

-- Účast (M:N žák <-> lekce). Běžná lekce = 1 řádek, skupina = více řádků.
create table if not exists attendance (
  lesson_id  uuid references lessons(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  present    boolean not null default true,
  primary key (lesson_id, student_id)
);

-- ---------------------------------------------------------------------------
-- EVIDENCE ODPRACOVANÝCH HODIN (podklad pro výplaty)
-- ---------------------------------------------------------------------------
-- Princip: když lektor v appce "odmáčkne" lekci jako Odučeno (done = true),
-- trigger zapíše řádek do work_log. Šéfová pak na konci měsíce čte pohled
-- lector_monthly_hours – u každého lektora vidí součet hodin (a případnou
-- částku podle hodinové sazby). work_log se NIKDY nemaže (drží se 10+ let),
-- takže hodiny přežijí i úklid starých lekcí.

-- Lektoři = pracovníci; sazba a datumy nástupu/odchodu kvůli výplatám.
alter table lectors add column if not exists hourly_rate numeric(8,2);
alter table lectors add column if not exists hired_at date;
alter table lectors add column if not exists left_at date;

create table if not exists work_log (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid unique references lessons(id) on delete set null, -- lekce se po roce smaže, záznam o práci zůstane
  lector_id  uuid not null references lectors(id),
  work_date  date not null,
  minutes    int  not null check (minutes > 0),
  subject    text,
  created_at timestamptz not null default now()
);
create index if not exists work_log_lector_date_idx on work_log (lector_id, work_date);

-- Trigger: potvrzení lekce zapíše/aktualizuje práci, odškrtnutí ji odebere.
create or replace function log_lesson_work() returns trigger
language plpgsql security definer as $$
begin
  if new.kind <> 'lesson' then return new; end if;    -- směna u stolu není odučená hodina
  if new.done then
    if new.lector_id is null then return new; end if; -- bez lektora není komu hodiny připsat
    insert into work_log (lesson_id, lector_id, work_date, minutes, subject)
    values (new.id, new.lector_id,
            (new.starts_at at time zone 'Europe/Prague')::date,
            greatest(1, round(extract(epoch from (new.ends_at - new.starts_at)) / 60)::int),
            new.subject)
    on conflict (lesson_id) do update
      set lector_id = excluded.lector_id,
          work_date = excluded.work_date,
          minutes   = excluded.minutes,
          subject   = excluded.subject;
  elsif tg_op = 'UPDATE' and old.done then
    delete from work_log where lesson_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists lessons_work_log on lessons;
create trigger lessons_work_log
  after insert or update on lessons
  for each row execute function log_lesson_work();

-- Ruční smazání lekce odebere i zapsané hodiny (byl to omyl v rozvrhu).
-- Roční úklid (purge_old_lessons) hodiny naopak ZACHOVÁ – před mazáním je
-- od lekcí odpojí (lesson_id = null), takže tenhle trigger už nic nenajde.
create or replace function unlog_lesson_work() returns trigger
language plpgsql security definer as $$
begin
  delete from work_log where lesson_id = old.id;
  return old;
end $$;

drop trigger if exists lessons_work_unlog on lessons;
create trigger lessons_work_unlog
  before delete on lessons
  for each row execute function unlog_lesson_work();

-- Měsíční výkaz: tohle čte tlačítko "Výkaz hodin" v appce.
-- security_invoker: pohled respektuje RLS politiky toho, kdo se ptá
-- (jinak by běžel s právy vlastníka a RLS obcházel).
create or replace view lector_monthly_hours with (security_invoker = on) as
select
  lec.id   as lector_id,
  lec.name as lector_name,
  extract(year  from w.work_date)::int as year,
  extract(month from w.work_date)::int as month,
  count(*)                              as lessons,
  round(sum(w.minutes) / 60.0, 2)       as hours,
  round(sum(w.minutes) / 60.0 * coalesce(lec.hourly_rate, 0), 0) as payout_czk
from work_log w
join lectors lec on lec.id = w.lector_id
group by lec.id, lec.name, lec.hourly_rate, 3, 4;

-- ---------------------------------------------------------------------------
-- RETENCE: lekce ~1 rok zpět, pracovníci/žáci/hodiny se nemažou.
-- ---------------------------------------------------------------------------
-- Spouštět 1x měsíčně; hodiny ve work_log zůstávají – před smazáním lekcí
-- se od nich odpojí, takže je trigger lessons_work_unlog nesmaže.
create or replace function purge_old_lessons() returns int
language plpgsql security definer as $$
declare n int;
begin
  update work_log set lesson_id = null
    where lesson_id in (select id from lessons where starts_at < now() - interval '13 months');
  update credit_log set lesson_id = null
    where lesson_id in (select id from lessons where starts_at < now() - interval '13 months');
  delete from lessons where starts_at < now() - interval '13 months';
  get diagnostics n = row_count;
  return n;
end $$;

-- Automatické spouštění (v Supabase: Database -> Extensions -> zapni pg_cron,
-- pak odkomentuj):
-- select cron.schedule('purge-lessons', '15 3 1 * *', $$select purge_old_lessons()$$);

-- ---------------------------------------------------------------------------
-- KARTOTÉKA: kreditový systém klientů (nahrazuje Excel "KARTOTÉKA")
-- ---------------------------------------------------------------------------
-- Princip: klient předplatí hodiny (tabulka payments -> kredit hodin),
-- každá odučená lekce s jeho účastí kredit čerpá (credit_log, plní se
-- triggery stejně jako work_log). Pohled student_credit dává přehled
-- zaplaceno / vyčerpáno / zůstatek pro list TOTAL v appce.

-- Karta klienta – sloupce podle Excel kartotéky.
alter table students add column if not exists category   text;            -- ZŠ / SŠ / dospělý…
alter table students add column if not exists grade      text;            -- třída / ročník
alter table students add column if not exists subjects   text;            -- předměty doučování
alter table students add column if not exists lector_name text;           -- výchozí lektor/ka
alter table students add column if not exists price_hour numeric(8,2);    -- cena Kč/hod
alter table students add column if not exists price_hour_discount numeric(8,2); -- cena s množstevní slevou
alter table students add column if not exists payment_method text;        -- účet DR / účet PoraDys / účet jazykovka / hotově
alter table students add column if not exists flag text;                  -- barevné označení: online/inperson/ending/contacted/problem

-- Platby (kredit): 1 řádek = jedna platba klienta.
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students(id) on delete cascade,
  paid_at      date not null default current_date,
  amount_czk   numeric(10,2) not null default 0,
  hours_credit numeric(6,2) not null,        -- kolik hodin platba předplatila
  method       text,                         -- účet DR / PoraDys / jazykovka / hotově
  note         text,                         -- např. "počáteční zůstatek z Excelu"
  created_at   timestamptz not null default now()
);
create index if not exists payments_student_idx on payments (student_id, paid_at);

-- Čerpání kreditu: 1 řádek = účast žáka na odučené lekci. Plní se výhradně
-- triggery; přežije roční úklid lekcí (purge je před mazáním odpojí).
create table if not exists credit_log (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references lessons(id) on delete set null,
  student_id  uuid not null references students(id) on delete cascade,
  lesson_date date not null,
  hours       numeric(6,2) not null,
  subject     text,
  created_at  timestamptz not null default now(),
  unique (lesson_id, student_id)
);
-- Ruční korekce hodin z kartotéky (lekce se protáhla, zapsala se omylem…).
-- Označuje se příznakem, ne prázdným lesson_id – to po roce dostanou i běžné
-- zápisy, protože roční úklid je od smazaných lekcí odpojuje.
alter table credit_log add column if not exists manual boolean not null default false;
alter table credit_log add column if not exists note text;
create index if not exists credit_log_student_idx on credit_log (student_id, lesson_date);

-- Přepočítá čerpání kreditu jedné lekce podle jejího stavu a účastí.
create or replace function sync_credit_log(p_lesson uuid) returns void
language plpgsql security definer as $$
declare l record;
begin
  delete from credit_log where lesson_id = p_lesson;
  select * into l from lessons where id = p_lesson;
  if l.id is null or not l.done or l.kind <> 'lesson' then return; end if;
  insert into credit_log (lesson_id, student_id, lesson_date, hours, subject)
  select l.id, a.student_id,
         (l.starts_at at time zone 'Europe/Prague')::date,
         round((extract(epoch from (l.ends_at - l.starts_at)) / 3600.0)::numeric, 2),
         l.subject
  from attendance a where a.lesson_id = l.id;
end $$;

create or replace function trg_lessons_credit() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    delete from credit_log where lesson_id = old.id; -- ruční smazání lekce vrací kredit
    return old;
  end if;
  perform sync_credit_log(new.id);
  return new;
end $$;

drop trigger if exists lessons_credit_sync on lessons;
create trigger lessons_credit_sync
  after insert or update on lessons
  for each row execute function trg_lessons_credit();
drop trigger if exists lessons_credit_unlog on lessons;
create trigger lessons_credit_unlog
  before delete on lessons
  for each row execute function trg_lessons_credit();

-- Účast se zapisuje až po uložení lekce, proto se čerpání synchronizuje
-- i při každé změně docházky.
create or replace function trg_attendance_credit() returns trigger
language plpgsql security definer as $$
begin
  perform sync_credit_log(coalesce(new.lesson_id, old.lesson_id));
  return coalesce(new, old);
end $$;

drop trigger if exists attendance_credit_sync on attendance;
create trigger attendance_credit_sync
  after insert or update or delete on attendance
  for each row execute function trg_attendance_credit();

-- Přehled TOTAL: zaplaceno / vyčerpáno / zůstatek pro každého klienta.
-- DROP + CREATE (ne "create or replace") – přidání sloupce doprostřed by
-- jinak selhalo na "cannot change name of view column".
drop view if exists student_credit;
create view student_credit with (security_invoker = on) as
select
  s.id as student_id,
  s.name, s.phone, s.email, s.school, s.status, s.note, s.flag,
  s.category, s.grade, s.subjects, s.lector_name,
  s.price_hour, s.price_hour_discount, s.payment_method,
  coalesce(p.paid_hours, 0)  as paid_hours,
  coalesce(p.paid_czk, 0)    as paid_czk,
  coalesce(u.used_hours, 0)  as used_hours,
  coalesce(p.paid_hours, 0) - coalesce(u.used_hours, 0) as balance_hours
from students s
left join (
  select student_id, sum(hours_credit) as paid_hours, sum(amount_czk) as paid_czk
  from payments group by student_id
) p on p.student_id = s.id
left join (
  select student_id, sum(hours) as used_hours
  from credit_log group by student_id
) u on u.student_id = s.id;

-- ---------------------------------------------------------------------------
-- DIAGNOSTICKÉ TESTY (výsledky + vygenerovaný plán přípravy)
-- ---------------------------------------------------------------------------
create table if not exists diagnostics (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid references students(id),  -- vazba na žáka, pokud existuje
  student_name text not null,                 -- jméno i textem (žák nemusí být v DB)
  subject      text not null default 'matematika',  -- 'matematika' | 'cestina'
  grade        text,
  taken_at     date not null default current_date,
  scores       jsonb not null,                -- {"pocty": 12, "zlomky": 8, ...}
  strengths    text[],
  weaknesses   text[],
  plan         text,                          -- vygenerovaný plán (text/markdown)
  note         text,
  created_at   timestamptz not null default now()
);
-- (pro databáze založené starší verzí schématu)
alter table diagnostics add column if not exists subject text not null default 'matematika';
create index if not exists diagnostics_student_idx on diagnostics (student_name, taken_at);

-- Log odeslaných notifikací (audit, ochrana proti dvojímu odeslání)
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references lessons(id) on delete cascade,
  student_id  uuid references students(id),
  type        text not null,        -- 'cancellation' | 'reminder' ...
  channel     text not null default 'sms',
  status      text not null default 'sent',
  provider_id text,
  sent_at     timestamptz not null default now()
);

-- ---------- Pohled, který čte front-end ----------
-- Spojí lekci s místností a lektorem a slepí jména žáků do jednoho textu.
-- security_invoker: respektuje RLS politiky přihlášeného uživatele.
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
  -- nové sloupce se u "create or replace view" smí přidávat jen na konec
  l.kind,
  -- údaje klienta z kartotéky – rozvrh je ukazuje v buňce i v detailu lekce,
  -- takže se nikde neduplikují (zdrojem zůstává karta klienta)
  coalesce(string_agg(s.phone,    ', ' order by s.name), '') as student_phone,
  coalesce(string_agg(s.grade,    ', ' order by s.name), '') as student_grade,
  coalesce(string_agg(s.category, ', ' order by s.name), '') as student_category
from lessons l
left join rooms r    on r.id = l.room_id
left join lectors lec on lec.id = l.lector_id
left join attendance a on a.lesson_id = l.id
left join students s  on s.id = a.student_id
group by l.id, r.name, r.color, lec.name;

-- ===========================================================================
-- BEZPEČNOST (RLS)
-- ---------------------------------------------------------------------------
-- Níže jsou OTEVŘENÉ politiky jen pro rychlé prototypování – dovolí komukoli
-- s anon klíčem číst i zapisovat. PŘED OSTRÝM PROVOZEM je nahraď přihlášením
-- (auth) a politikami, které čtení/zápis povolí jen přihlášeným lektorům.
-- ===========================================================================
alter table rooms       enable row level security;
alter table lectors     enable row level security;
alter table students    enable row level security;
alter table lessons     enable row level security;
alter table attendance  enable row level security;
alter table work_log    enable row level security;
alter table diagnostics enable row level security;
alter table payments    enable row level security;
alter table credit_log  enable row level security;

drop policy if exists proto_all on rooms;
create policy proto_all on rooms       for all using (true) with check (true);
drop policy if exists proto_all on lectors;
create policy proto_all on lectors     for all using (true) with check (true);
drop policy if exists proto_all on students;
create policy proto_all on students    for all using (true) with check (true);
drop policy if exists proto_all on lessons;
create policy proto_all on lessons     for all using (true) with check (true);
drop policy if exists proto_all on attendance;
create policy proto_all on attendance  for all using (true) with check (true);
drop policy if exists proto_all on work_log;
create policy proto_all on work_log    for all using (true) with check (true);
drop policy if exists proto_all on diagnostics;
create policy proto_all on diagnostics for all using (true) with check (true);
drop policy if exists proto_all on payments;
create policy proto_all on payments    for all using (true) with check (true);
drop policy if exists proto_all on credit_log;
create policy proto_all on credit_log  for all using (true) with check (true);

-- ===========================================================================
-- UKÁZKOVÁ DATA (seed) – ať po spuštění hned něco vidíš
-- ===========================================================================
insert into rooms (id, name, color, sort) values
  ('office-1','Office učebna 1','#4d4d4d',1),
  ('sam-1','Samostatná učebna 1','#c4733a',2),
  ('sam-2','Samostatná učebna 2','#2e6b3e',3),
  ('jaz-1','Jazyková stůl 1','#cf9089',4),
  ('jaz-2','Jazyková stůl 2','#c06a61',5),
  ('jaz-3','Jazyková stůl 3','#b34d44',6),
  ('vse-1','Všeobecná stůl 1','#a7d488',7),
  ('vse-2','Všeobecná stůl 2','#84c25f',8),
  ('vse-3','Všeobecná stůl 3','#6cae45',9),
  ('vse-4','Všeobecná stůl 4','#5a9c39',10),
  ('mat-1','Matematická stůl 1','#7a97d6',11),
  ('mat-2','Matematická stůl 2','#6f8fd0',12),
  ('mat-3','Matematická stůl 3','#6385c8',13),
  ('mat-4','Matematická stůl 4','#587bc0',14),
  ('mat-5','Matematická stůl 5','#4f72b8',15),
  ('mat-6','Matematická stůl 6','#4569b0',16)
on conflict (id) do nothing;

do $$
declare
  lec_kunkelova uuid;
  lec_machalik  uuid;
  stud_sima     uuid;
  stud_opata    uuid;
  stud_flek     uuid;
  les1 uuid; les2 uuid; les3 uuid;
begin
  insert into lectors (name, phone) values ('Kunkelová','731571406') returning id into lec_kunkelova;
  insert into lectors (name, phone) values ('Machalíková','604828001') returning id into lec_machalik;

  insert into students (name, phone, school) values ('Šíma','777111222','ZŠ') returning id into stud_sima;
  insert into students (name, phone, school) values ('Opata Jiří','777333444','SŠ') returning id into stud_opata;
  insert into students (name, phone, status) values ('Flekáčová','777555666','active') returning id into stud_flek;

  -- časy = dnešek v místním pásmu (Europe/Prague)
  insert into lessons (starts_at, ends_at, subject, room_id, lector_id, mode)
    values ((current_date + time '08:00') at time zone 'Europe/Prague',
            (current_date + time '09:00') at time zone 'Europe/Prague',
            'AJ','office-1',lec_kunkelova,'offline') returning id into les1;
  insert into lessons (starts_at, ends_at, subject, room_id, lector_id, mode)
    values ((current_date + time '14:00') at time zone 'Europe/Prague',
            (current_date + time '16:00') at time zone 'Europe/Prague',
            'MAT','mat-1',lec_machalik,'offline') returning id into les2;
  insert into lessons (starts_at, ends_at, subject, room_id, lector_id, mode)
    values ((current_date + time '12:00') at time zone 'Europe/Prague',
            (current_date + time '13:30') at time zone 'Europe/Prague',
            'Přír.','vse-3',lec_machalik,'online') returning id into les3;

  insert into attendance (lesson_id, student_id) values (les1, stud_sima), (les2, stud_opata), (les3, stud_flek);
end $$;

-- ===========================================================================
-- PŘIHLÁŠENÍ A ROLE (administrátor / lektor)
-- ---------------------------------------------------------------------------
-- Účty se zakládají v Supabase: Authentication -> Users -> Add user
-- (e-mail + heslo). Každý uživatel má v tabulce profiles roli.
-- ===========================================================================

create table if not exists profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'lektor'   -- 'admin' | 'lektor'
);

-- Profil se založí automaticky po vytvoření uživatele (default role 'lektor').
-- POZOR: trigger volá Supabase Auth, který nevidí schéma public – proto musí
-- být tabulka plně kvalifikovaná a search_path přibitý, jinak založení
-- uživatele spadne na "Database error creating new user".
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'lektor')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Každý smí číst svůj profil (appka z něj zjistí roli a jméno).
alter table profiles enable row level security;
drop policy if exists read_own_profile on profiles;
create policy read_own_profile on profiles for select using (auth.uid() = id);

-- Pomocná funkce: je přihlášený uživatel administrátor?
create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ➜ PO ZALOŽENÍ administrátorského účtu nastav jeho roli (doplň jeho e-mail):
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@poradys.cz');

-- ===========================================================================
-- PRÁVA K DIAGNOSTICKÝM TESTŮM A KARTÁM ŽÁKŮ
-- ---------------------------------------------------------------------------
-- Administrátor zadává výsledky testů a zakládá žáky, lektor smí jen číst
-- (vyhledat žáka, prohlédnout výsledky, vytisknout zprávu pro rodiče).
--
-- ⚠️ NEJDŘÍV si nastav aspoň jeden účet jako 'admin' příkazem výše, jinak
--    po spuštění tohohle bloku nebude moct zapisovat nikdo.
--
-- Politiky se sčítají (OR), takže "read" pro všechny přihlášené platí i pro
-- administrátora. Zápis pouští jen is_admin() – ta čte roli z `profiles`.
-- ===========================================================================

-- Diagnostické testy
alter table diagnostics enable row level security;
drop policy if exists proto_all   on diagnostics;
drop policy if exists diag_read   on diagnostics;
drop policy if exists diag_insert on diagnostics;
drop policy if exists diag_update on diagnostics;
drop policy if exists diag_delete on diagnostics;

create policy diag_read   on diagnostics for select to authenticated using (true);
create policy diag_insert on diagnostics for insert to authenticated with check (is_admin());
create policy diag_update on diagnostics for update to authenticated using (is_admin()) with check (is_admin());
create policy diag_delete on diagnostics for delete to authenticated using (is_admin());

-- Karty žáků (kartotéka). Lektor je čte – potřebuje to rozvrh (pohled
-- lesson_details jména žáků joinuje) i vyhledávání v diagnostice.
-- Zakládat a měnit je smí jen administrátor.
alter table students enable row level security;
drop policy if exists proto_all   on students;
drop policy if exists stud_read   on students;
drop policy if exists stud_insert on students;
drop policy if exists stud_update on students;
drop policy if exists stud_delete on students;

create policy stud_read   on students for select to authenticated using (true);
create policy stud_insert on students for insert to authenticated with check (is_admin());
create policy stud_update on students for update to authenticated using (is_admin()) with check (is_admin());
create policy stud_delete on students for delete to authenticated using (is_admin());

-- Kontrola po spuštění: kdo je admin?
--   select p.role, u.email from profiles p join auth.users u on u.id = p.id;

-- ===========================================================================
-- ZPŘÍSNĚNÍ RLS (až bude appka naostro) – nahradí prototypové "proto_all".
-- Teď zakomentováno, aby prototyp fungoval i bez kompletního přihlášení.
-- ---------------------------------------------------------------------------
-- drop policy if exists proto_all on lessons;
-- create policy read_all on lessons for select to authenticated using (true);
-- create policy admin_write on lessons for all to authenticated
--   using (is_admin()) with check (is_admin());
-- -- Lektor mění JEN popis a potvrzení přes funkci (nezmění čas/učebnu):
-- create or replace function lector_report(p_lesson uuid, p_done boolean, p_desc text)
-- returns void language plpgsql security definer as $$
-- begin
--   update lessons set done = p_done,
--     status = case when p_done and status = 'planned' then 'done' else status end,
--     description = p_desc
--   where id = p_lesson;
-- end $$;
-- ===========================================================================
