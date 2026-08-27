# Nasazení PoraDys rozvrhu do ostrého provozu

Kompletní postup od prototypu k fungující appce, kterou lektoři otevřou
z domu i z kanceláře. Vše na free tarifech – **žádnou doménu kupovat nemusíš**,
web pojede na adrese typu `https://uzivatel.github.io/romaWork/`
(vlastní doménu jde kdykoli později „přišroubovat", nic se nepředělává).

Celkový čas: ~1 hodina. Postupuj po krocích, nic nepřeskakuj.

---

## KROK 1: Založ Supabase projekt (databáze) – 10 min

1. Jdi na <https://supabase.com> → **Start your project** → registrace
   (nejjednodušší přes GitHub účet).
2. **New project**:
   - Name: `poradys`
   - Database password: **vygeneruj silné a ULOŽ SI HO** (např. do správce
     hesel) – budeš ho potřebovat na zálohy. Tohle heslo se NIKAM do kódu nedává.
   - Region: **Central EU (Frankfurt)** – nejblíž, nejrychlejší odezva.
   - Plan: **Free**.
3. Počkej ~2 minuty, než se projekt vytvoří.

## KROK 2: Vytvoř tabulky – 5 min

1. V levém menu **SQL Editor → New query**.
2. Zkopíruj **celý** obsah souboru [`schema.sql`](schema.sql), vlož, **Run**.
3. Mělo by proběhnout bez chyby („Success"). Vytvoří se tabulky, trigger na
   počítání hodin, pohledy i pár ukázkových řádků.
4. **Ověření:** spusť po blocích [`test_databaze.sql`](test_databaze.sql) –
   projde celý cyklus počítání hodin a po sobě uklidí. Když všech 9 kroků
   sedí s `OČEKÁVÁNÍ`, databáze funguje.

## KROK 3: Založ účty lektorům a šéfové – 10 min

1. **Authentication → Users → Add user → Create new user**.
2. Pro každého zadej e-mail + heslo a zaškrtni **Auto Confirm User**
   (jinak by čekali na potvrzovací e-mail).
3. Založ i účet pro šéfovou/admina (např. `admin@poradys.cz`).
4. Každému novému uživateli se automaticky vytvoří profil s rolí `lektor`.
   Adminovi roli povýšíš v **SQL Editoru** (uprav e-mail):

   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'admin@poradys.cz');
   ```

5. Vyplň lektorům hodinové sazby (kvůli sloupci „K výplatě" ve výkazu):
   **Table Editor → lectors** → u každého vyplň `hourly_rate` (např. 250).
   Lektoři, které založí až appka, se doplní stejně – kdykoli později.

> **Chyba „Database error creating new user"?** Máš v databázi starší verzi
> funkce `handle_new_user` (bez `set search_path`). Spusť v SQL Editoru znovu
> blok „PŘIHLÁŠENÍ A ROLE" z aktuálního [`schema.sql`](schema.sql) – tj. část
> od `create table if not exists profiles` po funkci `is_admin` – a založ
> uživatele znovu.

## KROK 4: Zabezpeč databázi (RLS) – 5 min

`schema.sql` nechává kvůli prototypování **otevřené** politiky – kdokoli se
znalostí klíče by mohl číst i zapisovat. Před ostrým provozem spusť v SQL
Editoru tohle (zamkne data jen pro přihlášené):

```sql
-- Čtení: jen přihlášení. Zápis: admin vše; lektor smí upravovat lekce
-- (appka ho pouští jen k popisu a potvrzení).
-- Blok je znovu-spustitelný: každou politiku nejdřív odstraní, pak založí.
drop policy if exists proto_all on rooms;
drop policy if exists read_rooms on rooms;
drop policy if exists admin_rooms on rooms;
create policy read_rooms  on rooms for select to authenticated using (true);
create policy admin_rooms on rooms for all    to authenticated using (is_admin()) with check (is_admin());

drop policy if exists proto_all on lectors;
drop policy if exists read_lectors on lectors;
drop policy if exists admin_lectors on lectors;
create policy read_lectors  on lectors for select to authenticated using (true);
create policy admin_lectors on lectors for all    to authenticated using (is_admin()) with check (is_admin());

drop policy if exists proto_all on students;
drop policy if exists read_students on students;
drop policy if exists admin_students on students;
create policy read_students  on students for select to authenticated using (true);
create policy admin_students on students for all    to authenticated using (is_admin()) with check (is_admin());

drop policy if exists proto_all on lessons;
drop policy if exists read_lessons on lessons;
drop policy if exists admin_lessons on lessons;
drop policy if exists lector_update on lessons;
create policy read_lessons   on lessons for select to authenticated using (true);
create policy admin_lessons  on lessons for all    to authenticated using (is_admin()) with check (is_admin());
create policy lector_update  on lessons for update to authenticated using (true) with check (true);

drop policy if exists proto_all on attendance;
drop policy if exists read_attendance on attendance;
drop policy if exists admin_attendance on attendance;
create policy read_attendance  on attendance for select to authenticated using (true);
create policy admin_attendance on attendance for all    to authenticated using (is_admin()) with check (is_admin());

drop policy if exists proto_all on work_log;
drop policy if exists admin_work_log on work_log;
create policy admin_work_log on work_log for select to authenticated using (is_admin());
-- (zápis do work_log dělá jen trigger, uživatelské politiky nepotřebuje)

drop policy if exists proto_all on diagnostics;
drop policy if exists read_diagnostics on diagnostics;
drop policy if exists write_diagnostics on diagnostics;
drop policy if exists delete_diagnostics on diagnostics;
create policy read_diagnostics   on diagnostics for select to authenticated using (true);
create policy write_diagnostics  on diagnostics for insert to authenticated with check (true);
create policy delete_diagnostics on diagnostics for delete to authenticated using (true);

-- Kartotéka: platby (peníze) vidí a mění jen admin; čerpání kreditu
-- zapisují výhradně triggery, číst ho smí přihlášení.
drop policy if exists proto_all on payments;
drop policy if exists admin_payments on payments;
create policy admin_payments on payments for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists proto_all on credit_log;
drop policy if exists read_credit_log on credit_log;
create policy read_credit_log on credit_log for select to authenticated using (true);

-- Pohledy musí RLS respektovat (jinak běží s právy vlastníka a obcházejí ji):
alter view lesson_details set (security_invoker = on);
alter view lector_monthly_hours set (security_invoker = on);
alter view student_credit set (security_invoker = on);
```

> ⚠️ **Celý `schema.sql` spouštěj jen JEDNOU při prvním zřízení databáze.**
> Opakované spuštění zduplikuje ukázková data (seed). Pozdější úpravy dělej
> vždy jen malými bloky.

> Poznámka: lektor teoreticky může přes API změnit u lekce i čas (appka mu to
> nedovolí, databáze ano). Pro rodinnou firmu rozumný kompromis. Kdyby to
> někdy vadilo, je na konci `schema.sql` připravený přísnější vzor s funkcí
> `lector_report` (vyžaduje malou úpravu appky).

## KROK 5: Zapni automatický roční úklid lekcí – 2 min

1. **Database → Extensions** → vyhledej `pg_cron` → **Enable**.
2. V SQL Editoru:

   ```sql
   select cron.schedule('purge-lessons', '15 3 1 * *', $$select purge_old_lessons()$$);
   ```

   Každý první den v měsíci ve 3:15 se smažou lekce starší 13 měsíců
   (hodiny ve `work_log` zůstávají – ověřeno krokem 8 testu).

## KROK 6: Propoj appku s databází – 3 min

1. V Supabase: **Project Settings → API**.
2. Zkopíruj **Project URL** a **anon public** klíč.
3. V [`config.js`](config.js) nastav:

   ```js
   SUPABASE_URL: "https://tvuj-projekt.supabase.co",
   SUPABASE_ANON_KEY: "eyJ...",
   ```

   Databáze je výchozí režim – `USE_SUPABASE` se nepřepíná. Appku jde
   proklikat na smyšlených datech přidáním `?demo=1` do adresy.

> **Co smí a nesmí do kódu:** `anon` klíč je veřejný záměrně – bezpečnost
> zajišťují politiky z kroku 4 (bez přihlášení klíč nic nepřečte). Naopak
> **`service_role` klíč a databázové heslo nikdy nikam nevkládej** ani
> necommituj.

## KROK 7: Zveřejni web (GitHub Pages, zdarma, bez domény) – 5 min

Repo už je na GitHubu (`z9h67nnypb-ux/romaWork`), takže:

1. Pushni aktuální stav: `git push`.
2. Na GitHubu otevři repo → **Settings → Pages**.
3. Source: **Deploy from a branch** → Branch: `main`, složka `/ (root)` → **Save**.
4. Za ~2 minuty web běží na `https://z9h67nnypb-ux.github.io/romaWork/`.
   Každý další `git push` web automaticky aktualizuje.

⚠️ **Pozor:** GitHub Pages funguje zdarma jen na **veřejném** repu – kód a
`anon` klíč budou viditelné (to nevadí, viz krok 6), ale nesmí tam být hesla.
Jestli chceš repo nechat privátní, použij místo toho **Netlify Drop**
(<https://app.netlify.com/drop> – přetáhneš složku myší, hotovo, adresa
`https://nazev.netlify.app`) nebo **Cloudflare Pages** – obojí zdarma
i pro privátní zdrojáky.

*(Až někdy budeš chtít vlastní doménu – ~300 Kč/rok – v nastavení Pages ji
jen připojíš, nic jiného se nemění.)*

## KROK 8: Otestuj ostrou verzi – 10 min

1. Otevři veřejnou adresu → žlutý pruh „Ukázkový režim" **nesmí** být vidět.
2. Přihlas se admin účtem → založ zkušební lekci na dnešek.
3. Přihlas se (třeba v anonymním okně) lektorem → otevři lekci → zaškrtni
   **„Lekce proběhla"** → ulož.
4. Jako admin klikni **Výkaz hodin** → u lektora přibyla délka lekce.
5. Křížová kontrola v SQL Editoru – čísla musí sedět s appkou:

   ```sql
   select * from lector_monthly_hours;
   ```

6. Zkušební lekci smaž.

## KROK 9: Provozní rutina

| Kdy | Co | Jak |
|---|---|---|
| denně | nic 🙂 | lektoři odmačkávají lekce, hodiny se počítají samy |
| konec měsíce | výplaty | admin → **Výkaz hodin** → vybrat měsíc |
| 1× měsíčně | záloha | `pg_dump` na starý počítač (příkaz v [DATABASE.md](DATABASE.md), kap. 6) |
| prázdniny | probudit projekt | free tarif se po 7 dnech nečinnosti uspí – stačí otevřít appku nebo dashboard |
| nový lektor | účet + sazba | krok 3 (Add user + `hourly_rate`) |
| lektor končí | neodmazávat! | Table Editor → lectors → vyplnit `left_at`, `active = false` |

---

## Rychlý checklist

- [ ] Supabase projekt založen (Frankfurt, free), DB heslo uloženo v bezpečí
- [ ] `schema.sql` spuštěn bez chyb
- [ ] `test_databaze.sql` prošel (9/9 kroků dle očekávání)
- [ ] Účty lektorů + admin založeny, admin role nastavena
- [ ] `hourly_rate` vyplněny
- [ ] RLS politiky z kroku 4 nasazeny (proto_all pryč)
- [ ] pg_cron úklid naplánován
- [ ] `config.js`: URL + anon klíč (databáze je výchozí, `?demo=1` = ukázkový režim)
- [ ] spuštěné migrace `migrace_*.sql` (naposledy `migrace_typ_lekce.sql`)
- [ ] Web běží na GitHub Pages / Netlify
- [ ] Test z kroku 8 prošel (appka i SQL ukazují stejné hodiny)
- [ ] První záloha stažena
