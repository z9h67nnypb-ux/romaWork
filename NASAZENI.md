# Nasazení PoraDys rozvrhu do ostrého provozu

Kompletní postup k fungující appce, kterou lektoři otevřou
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
3. Mělo by proběhnout bez chyby („Success"). Vytvoří se tabulky, triggery na
   počítání hodin a kreditu, pohledy, přístupová pravidla (RLS) a číselník
   učeben. **Žádná ukázková data se nevkládají** – databáze začne prázdná.
4. **Ověření:** v SQL Editoru zkontroluj, že jsou pravidla na místě:

   ```sql
   select tablename, policyname, cmd from pg_policies
   where schemaname = 'public' order by tablename, policyname;
   ```

   U žádné tabulky nesmí zůstat politika `proto_all`.
5. **Když už databáze běžela dřív**, `schema.sql` znovu nespouštěj. Místo
   toho pusť migrace v tomhle pořadí:
   [`migrace_ucty_lektoru.sql`](migrace_ucty_lektoru.sql) →
   [`migrace_prava_ostry_provoz.sql`](migrace_prava_ostry_provoz.sql).
   Zkušební data pak smaže
   [`reset_ostry_provoz.sql`](reset_ostry_provoz.sql). Je nevratný, čti
   komentáře v souboru – nejdřív jen vypíše, kolik řádků by smazal.

## KROK 3: Účet šéfové a účty lektorů – 10 min

Ručně se zakládá **jen ten úplně první administrátor**. Všechny ostatní účty
si pak šéfová vytvoří sama v appce.

1. **Authentication → Sign In / Providers → Email** → vypni **„Confirm email"**
   a ulož. Bez toho by se lektor založený z appky nepřihlásil, dokud
   neklikne na potvrzovací odkaz v mailu.
2. **Authentication → Users → Add user → Create new user** – e-mail a heslo
   šéfové, zaškrtni **Auto Confirm User**.
3. Povyš ji na administrátora v **SQL Editoru** (uprav e-mail):

   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'sem@dopln.cz');
   ```

4. **Od teď dál už jen v appce:** Rozvrh → tlačítko **Lektoři** → jméno,
   e-mail, heslo, role → *Založit účet*. Účet vznikne v `auth.users`, profil
   se doplní triggerem a appka rovnou založí i kartu lektora v `lectors`.
   Heslo se nikde neukládá – předej ho lektorovi.
   Odchod lektora se řeší tlačítkem **Zrušit přístup** (účet se jen zamkne,
   hodiny a historie zůstanou).
5. Vyplň lektorům hodinové sazby (kvůli sloupci „K výplatě" ve výkazu):
   **Table Editor → lectors** → u každého vyplň `hourly_rate` (např. 250).

> **Chyba „Database error creating new user"?** Máš v databázi starší verzi
> funkce `handle_new_user` (bez `set search_path`). Spusť v SQL Editoru znovu
> blok „PŘIHLÁŠENÍ A ROLE" z aktuálního [`schema.sql`](schema.sql) – tj. část
> od `create table if not exists profiles` po funkci `is_admin` – a založ
> uživatele znovu.

## KROK 4: Zkontroluj zabezpečení (RLS) – 3 min

Pravidla nastavuje rovnou [`schema.sql`](schema.sql) (blok „BEZPEČNOST (RLS) –
OSTRÝ PROVOZ"), takže se tu už nic ručně spouštět nemusí. Jen si ověř, že sedí:

```sql
select tablename, policyname, cmd, qual
from pg_policies where schemaname = 'public'
order by tablename, policyname;
```

Co má platit:

| Tabulka | Čte | Zapisuje |
|---|---|---|
| `rooms`, `lectors`, `students`, `attendance`, `diagnostics` | každý přihlášený | administrátor |
| `lessons` | každý přihlášený | zakládá a maže administrátor; lektor smí u lekce změnit jen `done`, `status` a `description` (hlídá trigger `guard_lesson_update`) |
| `payments`, `credit_log`, `work_log`, `notifications` | administrátor | administrátor (kredit a hodiny plní triggery mimo RLS) |
| `profiles` | svůj profil každý, všechny administrátor | administrátor |

Nepřihlášený uživatel **nevidí nic** – anon klíč sám o sobě nic neotevře.

Pohledy musí RLS respektovat (jinak by běžely s právy vlastníka a obcházely ji);
`schema.sql` je tak vytváří, ale po ruční úpravě to jde vynutit znovu:

```sql
alter view lesson_details       set (security_invoker = on);
alter view lector_monthly_hours set (security_invoker = on);
alter view student_credit       set (security_invoker = on);
```

> ⚠️ **Celý `schema.sql` spouštěj jen JEDNOU při prvním zřízení
> databáze.** Pozdější úpravy dělej migracemi `migrace_*.sql` nebo malými bloky.

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

1. Otevři veřejnou adresu → musí přijít **přihlášení**, nic jiného.
2. Přihlas se účtem šéfové → **Lektoři** → založ zkušební účet lektora.
3. Založ zkušební lekci na dnešek a přiřaď ji tomu lektorovi.
4. Přihlas se (v anonymním okně) tím lektorem → v liště **nesmí** být
   „+ Lekce", „Kartotéka", „Výkaz" ani „Lektoři" → otevři lekci → zaškrtni
   **„Lekce proběhla"** → ulož.
5. Jako admin klikni **Výkaz hodin** → u lektora přibyla délka lekce.
6. Křížová kontrola v SQL Editoru – čísla musí sedět s appkou:

   ```sql
   select * from lector_monthly_hours;
   ```

7. Jako admin dej u zkušebního lektora **Zrušit přístup** → v anonymním okně
   se už nesmí přihlásit („Tento účet už nemá přístup.").
8. Zkušební lekci smaž a testovacího uživatele odstraň v Supabase
   (**Authentication → Users → Delete user**).

## KROK 9: Provozní rutina

| Kdy | Co | Jak |
|---|---|---|
| denně | nic 🙂 | lektoři odmačkávají lekce, hodiny se počítají samy |
| konec měsíce | výplaty | admin → **Výkaz hodin** → vybrat měsíc |
| 1× měsíčně | záloha | `pg_dump` na starý počítač (příkaz v [DATABASE.md](DATABASE.md), kap. 6) |
| prázdniny | probudit projekt | free tarif se po 7 dnech nečinnosti uspí – stačí otevřít appku nebo dashboard |
| nový lektor | účet + sazba | appka → **Lektoři** → Založit účet; sazbu doplnit v Table Editor → lectors → `hourly_rate` |
| lektor končí | neodmazávat! | appka → **Lektoři** → *Zrušit přístup*; v Table Editor → lectors doplnit `left_at`, `active = false` |

---

## Rychlý checklist

- [ ] Supabase projekt založen (Frankfurt, free), DB heslo uloženo v bezpečí
- [ ] `schema.sql` spuštěn bez chyb
- [ ] „Confirm email" v Supabase vypnuté (jinak nejdou zakládat účty z appky)
- [ ] účet šéfové založen a povýšen na `admin`
- [ ] účty lektorů založené v appce (Rozvrh → **Lektoři**)
- [ ] `hourly_rate` vyplněny
- [ ] RLS zkontrolována (`pg_policies` – nikde žádná `proto_all`)
- [ ] zkušební data smazána (`reset_ostry_provoz.sql`), databáze prázdná
- [ ] pg_cron úklid naplánován
- [ ] `config.js`: URL + anon klíč
- [ ] spuštěné migrace `migrace_*.sql` (naposledy `migrace_ucty_lektoru.sql`,
      pak `migrace_prava_ostry_provoz.sql`)
- [ ] Web běží na GitHub Pages / Netlify
- [ ] Test z kroku 8 prošel (appka i SQL ukazují stejné hodiny)
- [ ] První záloha stažena
