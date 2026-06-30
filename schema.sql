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

-- Účast (M:N žák <-> lekce). Běžná lekce = 1 řádek, skupina = více řádků.
create table if not exists attendance (
  lesson_id  uuid references lessons(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  present    boolean not null default true,
  primary key (lesson_id, student_id)
);

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
create or replace view lesson_details as
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
  coalesce(string_agg(s.name, ', ' order by s.name), '') as student_names
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
alter table rooms      enable row level security;
alter table lectors    enable row level security;
alter table students   enable row level security;
alter table lessons    enable row level security;
alter table attendance enable row level security;

drop policy if exists proto_all on rooms;
create policy proto_all on rooms      for all using (true) with check (true);
drop policy if exists proto_all on lectors;
create policy proto_all on lectors    for all using (true) with check (true);
drop policy if exists proto_all on students;
create policy proto_all on students   for all using (true) with check (true);
drop policy if exists proto_all on lessons;
create policy proto_all on lessons    for all using (true) with check (true);
drop policy if exists proto_all on attendance;
create policy proto_all on attendance for all using (true) with check (true);

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
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'lektor')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Každý smí číst svůj profil (appka z něj zjistí roli a jméno).
alter table profiles enable row level security;
drop policy if exists read_own_profile on profiles;
create policy read_own_profile on profiles for select using (auth.uid() = id);

-- Pomocná funkce: je přihlášený uživatel administrátor?
create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ➜ PO ZALOŽENÍ administrátorského účtu nastav jeho roli (doplň jeho e-mail):
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@poradys.cz');

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
