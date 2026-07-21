# Rozvrh PoraDys – prototyp

Funkční prototyp denního rozvrhu doučování (učebny/stoly = sloupce, čas = řádky,
barevné bloky rezervací). Lektor klikne na lekci, vyplní **popis (co dělal)** a
zaškrtne **odučeno (done)**, případně změní stav (zrušeno apod.).

Aplikace běží ve dvou režimech:

- **Ukázkový (mock)** – výchozí, funguje hned, bez nastavení. Data jsou v `mockData.js`.
- **Supabase** – čte/zapisuje do tvojí databáze. Stačí vyplnit klíče a přepnout přepínač.

---

## 1) Jak prototyp spustit (mock režim)

Soubory jsou čisté HTML/CSS/JS, není potřeba nic instalovat. Stačí je servírovat
přes malý lokální server (kvůli načítání souborů a Supabase klienta):

```bash
cd /Users/filipniedoba/romaWork
python3 -m http.server 5050
```

Pak otevři v prohlížeči: <http://localhost:5050>

(Alternativně přes Node: `npx serve` nebo `npx http-server`.)

Nejdřív se objeví **přihlášení**. V ukázkovém režimu jsou demo účty:

- `admin@poradys.cz` / `admin123` – administrátor
- `kunkelova@poradys.cz` / `lektor123` – lektor

Po přihlášení uvidíš žlutý pruh „Ukázkový režim" – běžíš na mock datech.

---

## 2) Co umí

- **Přihlášení** – každý má vlastní účet; role (admin/lektor) určuje, co smí.
- **Denní rozvrh** – sloupce = učebny/stoly, barevné bloky = lekce.
- **Legenda nahoře** – klik na učebnu vyfiltruje jen její sloupec; „Vše" zruší filtr.
- **Mini kalendář / šipky / Dnes** – přepínání dne.
- **Kontrola kolizí** – nejde založit/přesunout lekci do místnosti, kde se čas
  překrývá s jinou lekcí (online lekce bez místnosti se nehlídají).
- **Administrátor** – „+ Nová lekce", úprava (čas, učebna, žák, lektor, předmět,
  režim, stav) a mazání. Navíc:
  - **klik** vybere lekci, **Ctrl/⌘+klik** přidá další, **tažením myši** vybereš
    víc lekcí najednou,
  - **Ctrl/⌘+C** zkopíruje výběr, přepneš den a **Ctrl/⌘+V** vloží (kolize se
    přeskočí), **Delete** smaže výběr,
  - **dvojklik** na lekci otevře úpravu.
- **Lektor** – klik na lekci → může jen **zapsat popis** a potvrdit **„Lekce
  proběhla"**. Rozvrh nemění.
- **Agenda** – seznamový pohled na daný den.
- **Dropdown „Výuka"** – přepíná zobrazení: prezenční / online (vždy jen jeden
  režim, ať se lekce nemíchají v jednom sloupci).
- **Protáhnout týden →** (admin) – zkopíruje všechny lekce aktuálního týdne do
  týdne následujícího (zrušené se vynechají, kolize přeskočí).
- **Výkaz hodin** (admin) – měsíční součet potvrzených hodin po lektorech,
  podklad pro výplaty. Smazání lekce hodiny odebere; roční úklid je zachová.
  Detail návrhu v [`DATABASE.md`](DATABASE.md).
- **📇 Kartotéka** (admin) – stránka [`kartoteka.html`](kartoteka.html):
  klienti, platby a kredit hodin (nahrazuje Excel „KARTOTÉKA"). Lekce čerpají
  kredit automaticky z rozvrhu; přehled TOTAL hlídá nízký kredit; karta
  klienta ve stylu Excelu; export CSV; hromadný import počátečních zůstatků.
  **Barevné označení klientů** (online / osobně / končí / kontaktováno /
  problémový) a **souhrny peněz podle způsobu platby** (kolik klientů a Kč
  platí hotově / účet PoraDys / účet jazykovka / účet DR).
- **🧪 Diagnostika** – stránka [`diagnostika.html`](diagnostika.html) se
  záložkami **Čeština / Matematika**: body z testu → hodnotící arch (úroveň
  *zvládá / částečně zvládá / nezvládá* po oblastech, celkové hodnocení,
  „na co se zaměřit") a plán přípravy na 8 týdnů. Čeština odpovídá
  diagnostickému testu PoraDys pro 9. třídu (Pravopisné jevy 10 b.,
  Tvarosloví 20 b., Větná stavba 10 b., Slovní zásoba 8 b., Stylistika a
  literatura 16 b.). Výsledky se ukládají k žákovi (Supabase, jinak
  prohlížeč) a je vidět **graf vývoje** mezi testy. Kategorie se upravují
  v `diagnostika.js` (konstanta `SUBJECTS`); matematika je zatím orientační.
- Přidáním `?mock=1` do adresy se appka přepne na ukázková data (testování
  bez zápisu do ostré databáze).
- V mock režimu jsou v období **13.–26. 7. 2026** vygenerovaná náhodná
  testovací data (každý den jiná).
- (Týden/Měsíc jsou zatím jen náhledové záložky – hlavní je denní rozvrh.)

---

## 3) Jak připojit Supabase

### a) Vytvoř tabulky

1. V Supabase otevři **SQL Editor → New query**.
2. Zkopíruj celý obsah souboru [`schema.sql`](schema.sql) a dej **Run**.
   - Vytvoří se tabulky (`rooms`, `lectors`, `students`, `lessons`, `attendance`,
     `notifications`), pohled `lesson_details` a pár ukázkových řádků.

### b) Vlož klíče

1. V Supabase: **Project Settings → API**.
2. Zkopíruj **Project URL** a **anon public** klíč.
3. Otevři [`config.js`](config.js) a vyplň:
   ```js
   USE_SUPABASE: true,
   SUPABASE_URL: "https://tvuj-projekt.supabase.co",
   SUPABASE_ANON_KEY: "...",
   ```
4. Obnov stránku. Žlutý pruh zmizí a data se načítají z databáze.
   Změny v detailu lekce (popis/odučeno/stav) se ukládají přímo do Supabase.

### c) Účty a role

1. V Supabase: **Authentication → Users → Add user** – zadej e-mail a heslo
   (pro každého lektora i pro administrátora).
2. `schema.sql` automaticky každému novému uživateli založí řádek v `profiles`
   s rolí `lektor`.
3. U administrátora roli povýšíš (uprav e-mail):
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'admin@poradys.cz');
   ```
4. Po přihlášení appka přečte roli z `profiles` a podle ní zobrazí možnosti.
   Demo účty z `config.js` se v Supabase režimu nepoužijí.

---

## 4) Role: administrátor vs. lektor

Po přihlášení appka zná roli uživatele:

- **Administrátor** – „+ Nová lekce", úprava a mazání lekcí, výběr tažením myši
  a kopírování Ctrl/⌘+C → Ctrl/⌘+V mezi dny.
- **Lektor** – jen **zápis popisu** a potvrzení **„Lekce proběhla"**. Rozvrh nemění.

> ⚠️ Omezení rolí na front-endu je pohodlí, ne bezpečnost – dá se obejít.
> V ostré verzi je nutné vynutit role i v databázi přes **RLS politiky**
> (připravený vzor je zakomentovaný na konci `schema.sql` – `is_admin()`,
> `admin_write`, `lector_report`). Bez toho neposílej appku mezi lidi.

## 5) Důležité poznámky

- **Bezpečnost:** `schema.sql` nastavuje dočasně **otevřené** přístupové politiky
  (kdokoli s anon klíčem může číst i zapisovat) – jen pro prototyp. Před ostrým
  provozem přidej přihlášení lektorů (Supabase Auth) a omez politiky jen na ně.
- **Uspávání:** projekt na free tieru se po 7 dnech nečinnosti pauzne; pak ho
  probudíš v dashboardu. Pro ostrý provoz se počítá s placeným tarifem.
- **Časové pásmo:** lekce se ukládají jako `timestamptz`; seed je v `Europe/Prague`.

---

## 6) Další krok (až bude rozvrh hotový): SMS o zrušení

Plán automatizace (mimo tento prototyp):

1. Když se lekci nastaví `status = 'cancelled'`, Supabase Edge Function zavolá
   SMS bránu (např. smsbrana.cz) a pošle zprávu na `students.phone`.
2. Odeslání se zapíše do tabulky `notifications` (audit + ochrana proti dvojímu poslání).
3. Připomínky předem řeší naplánovaná úloha (pg_cron) každých pár minut.

---

## Soubory

| Soubor | K čemu |
|---|---|
| `index.html` | Struktura stránky |
| `styles.css` | Vzhled |
| `config.js` | Přepínač mock/Supabase + klíče |
| `mockData.js` | Ukázková data |
| `app.js` | Logika (vykreslování, detail, ukládání, výkaz hodin) |
| `schema.sql` | Databázové schéma pro Supabase (vč. work_log a diagnostics) |
| `test_databaze.sql` | Ověřovací scénář počítání hodin (krok za krokem) |
| `diagnostika.html` + `diagnostika.js` | Diagnostický test a plán přípravy |
| `kartoteka.html` + `kartoteka.js` | Kartotéka: klienti, platby a kredit hodin |
| `DATABASE.md` | Návrh databáze: retence, hodiny lektorů, hosting a zálohy |
| `NASAZENI.md` | Krok-za-krokem postup nasazení do ostrého provozu |
