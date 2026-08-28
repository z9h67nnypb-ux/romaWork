# Rozvrh PoraDys

Denní rozvrh doučování (učebny/stoly = sloupce, čas = řádky, barevné bloky
rezervací), kartotéka klientů s kreditem hodin a diagnostické testy.
Lektor klikne na lekci, vyplní **popis (co dělal)** a zaškrtne **odučeno**,
případně změní stav (zrušeno apod.).

Appka běží **naostro proti databázi** (Supabase). Ukázkový režim s vymyšlenými
daty už neexistuje – všechno, co je v appce vidět, je skutečný provoz.

---

## 1) Jak appku spustit lokálně

Soubory jsou čisté HTML/CSS/JS, není potřeba nic instalovat. Stačí je servírovat
přes malý lokální server (kvůli načítání souborů a Supabase klienta):

```bash
python -m http.server 5050
```

Pak otevři v prohlížeči: <http://localhost:5050/index.html>

(Alternativně přes Node: `npx serve` nebo `npx http-server`.)

Objeví se **přihlášení** – účtem ze Supabase Auth. Účty zakládá administrátor
v appce (Rozvrh → **Lektoři**), viz kapitola 3c.

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
- **Druh lekce** – u každé lekce se vybírá **klasická (opakovaná)** nebo
  **mimořádná (jednorázová)**. U klasické jde rovnou naplánovat několik
  dalších termínů dopředu – stejný den v týdnu i čas, obsazené termíny se
  přeskočí. U už založené lekce to udělá tlačítko **„Naplánovat další
  termíny"** v jejím detailu. Mimořádná lekce má v rozvrhu zlatý proužek
  vlevo a do dalšího týdne se nekopíruje.
- **Pravidelná lekce z karty klienta** – při zakládání klienta v kartotéce jde
  rovnou zadat den, čas, stůl a počet lekcí; série se založí do rozvrhu.
- **Protáhnout týden →** (admin) – zkopíruje pravidelné lekce aktuálního týdne
  do týdne následujícího (mimořádné a zrušené se vynechají, kolize přeskočí).
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
- **👤 Lektoři** (admin i auditor) – zakládání přihlašovacích účtů. Vyplní se
  jméno, e-mail, heslo a role, účet vznikne v Supabase Auth a člověk se rovnou
  přihlásí. **Zrušit přístup** účet jen zamkne, **Smazat** ho odstraní nadobro;
  odpracované hodiny a historie lekcí zůstanou v obou případech – karta lektora
  se jen odloží z nabídky. Podrobnosti v kapitole 3c.
- **🧪 Diagnostika** – stránka [`diagnostika.html`](diagnostika.html) se
  záložkami **Čeština / Matematika**: body z testu → hodnotící arch (úroveň
  po oblastech, celkové hodnocení, „na co se zaměřit") a plán přípravy
  na 8 týdnů. Výsledky se ukládají k žákovi a je vidět **graf vývoje**
  mezi testy. Kategorie i maxima se upravují v `diagnostika.js`
  (konstanta `SUBJECTS`).

  Obě sady odpovídají papírovým hodnotícím archům PoraDys:

  | Předmět | Oblasti (max. body) | Celkem | Slovní stupnice |
  |---|---|---|---|
  | **Čeština** (verze 01) | Pravopisné jevy 10 · Tvarosloví 10 · Větná stavba 10 · Slovní zásoba 5 · Porozumění textu 5 · Stylistika 5 | 45 b. | zvládá / částečně zvládá / nezvládá |
  | **Matematika** (DgTest 01) | Číselné operace 8 · Zlomky, poměry, procenta, převody jednotek 18 · Algebraické výrazy a rovnice 6 · Geometrie v rovině a v prostoru 10 · Slovní úlohy 14 · Práce s daty a logické úlohy 4 | 60 b. | je schopen / je schopen s chybami / není schopen |

  U matematiky je navíc u každého políčka napsané, **ze kterých úloh** se body
  sčítají (1.1–2 / 3–6 / 7 / 8–10 / 11–14 / 15), aby se opisovaly ze správného
  rámečku archu.
- **📚 Materiály na procvičování** – u každé oblasti, kterou žák nezvládá, je
  ve výsledku tlačítko s pracovními listy a odkazy k té oblasti. Materiál visí
  na **oblasti testu, ne na žákovi ani na testu**: administrátor (nebo auditor)
  nahraje list ke „Zlomkům" jednou a od té chvíle ho u sebe vidí každý žák,
  kterému zlomky podle testu nejdou. Lektor si ho na hodině otevře, nahrávat
  a mazat nemůže. Do zprávy pro rodiče se tlačítka netisknou.
- (Týden/Měsíc jsou zatím jen náhledové záložky – hlavní je denní rozvrh.)

---

## 3) Jak připojit Supabase

### a) Vytvoř tabulky

1. V Supabase otevři **SQL Editor → New query**.
2. Zkopíruj celý obsah souboru [`schema.sql`](schema.sql) a dej **Run**.
   - Vytvoří se tabulky (`rooms`, `lectors`, `students`, `lessons`, `attendance`,
     `payments`, `credit_log`, `work_log`, `diagnostics`, `notifications`,
     `profiles`), pohledy (`lesson_details`, `student_credit`,
     `lector_monthly_hours`), přístupová pravidla (RLS) a číselník učeben.
   - **Žádná ukázková data se nevkládají** – databáze začne prázdná.
3. Na databázi, která už běží, se `schema.sql` **nespouští znovu** – místo toho
   se pustí migrace `migrace_*.sql`. Poslední tři, a v tomhle pořadí:
   [`migrace_ucty_lektoru.sql`](migrace_ucty_lektoru.sql) (zakládání účtů
   z appky), [`migrace_prava_ostry_provoz.sql`](migrace_prava_ostry_provoz.sql)
   (ostrá přístupová práva místo prototypových `proto_all`) a
   [`migrace_role_auditor.sql`](migrace_role_auditor.sql) (role auditor
   a mazání účtů z appky) a [`migrace_materialy.sql`](migrace_materialy.sql)
   (materiály na procvičování + úložiště souborů).
4. Kdyby v databázi zůstala testovací data z prototypu, smaže je
   [`reset_ostry_provoz.sql`](reset_ostry_provoz.sql) (nevratné, čti
   komentáře v souboru).

### b) Vlož klíče

1. V Supabase: **Project Settings → API**.
2. Zkopíruj **Project URL** a **anon public** klíč.
3. Otevři [`config.js`](config.js) a vyplň:
   ```js
   SUPABASE_URL: "https://tvuj-projekt.supabase.co",
   SUPABASE_ANON_KEY: "...",
   ```
4. Obnov stránku a přihlas se. Změny v detailu lekce (popis/odučeno/stav)
   se ukládají přímo do Supabase.

### c) Účty a role

**Nejdřív jednorázově v Supabase:** *Authentication → Sign In / Providers →
Email* → vypni **„Confirm email"**. Bez toho by se nově založený lektor
nepřihlásil, dokud neklikne na potvrzovací odkaz v mailu.

**Úplně první administrátor** (jen jednou):

1. **Authentication → Users → Add user** – e-mail a heslo šéfové.
2. **SQL Editor** – povyš ji na administrátora (uprav e-mail):
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'sem@dopln.cz');
   ```

**Všechny další účty už zakládá administrátor v appce:** Rozvrh →
tlačítko **Lektoři** → jméno, e-mail, heslo, role → *Založit účet*.

- Účet vznikne v `auth.users`, trigger k němu doplní řádek v `profiles`
  a appka rovnou založí i kartu lektora v tabulce `lectors` (bez ní by
  neměl kam počítat odpracované hodiny).
- **Heslo se nikde neukládá** – po založení ho předej lektorovi. Zapomenuté
  heslo se mění v Supabase (*Authentication → Users*).
- **Zrušit přístup** účet nemaže, jen nastaví `profiles.active = false`.
  Zamčený uživatel se nepřihlásí (a vyhodí ho to i ze staré relace), ale
  jeho odpracované hodiny a historie lekcí zůstanou.
- **Smazat** účet odstraní nadobro, i řádek v `auth.users`. Dělá to funkce
  `delete_user_account()` v databázi – z prohlížeče to jinak nejde, veřejný
  klíč na `auth.users` právo nemá a `service_role` klíč do webu nepatří.
  Karta lektora v `lectors` přitom **zůstane** a jen se deaktivuje, protože
  na ní visí odpracované hodiny.
- Sám sobě přístup vzít ani se smazat nejde a **poslední administrátor musí
  zůstat** – jinak by appka zůstala bez správce a role by se dala nastavit
  už jen ze SQL editoru. Hlídá to databáze, ne jen tlačítka.

---

## 4) Role: administrátor, auditor, lektor

Po přihlášení appka zná roli uživatele. Role se nastavuje při zakládání účtu
(Rozvrh → **Lektoři**) a dá se kdykoli změnit.

| Co | lektor | auditor | administrátor |
|---|:---:|:---:|:---:|
| Denní rozvrh – čtení | ✅ | ✅ | ✅ |
| U lekce zapsat popis a „proběhla" | ✅ | ✅ | ✅ |
| Zakládat, měnit a mazat lekce | – | ✅ | ✅ |
| Diagnostické testy – zadávání | – | ✅ | ✅ |
| Materiály na procvičování – otevřít | ✅ | ✅ | ✅ |
| Materiály na procvičování – nahrát a smazat | – | ✅ | ✅ |
| Výkaz hodin | – | ✅ | ✅ |
| Účty (zakládat, zamykat, mazat) | – | ✅¹ | ✅ |
| **Kartotéka – klienti, platby, kredit** | – | **–** | ✅ |

¹ Auditor nesmí vyrobit ani povýšit administrátora a na administrátorský účet
vůbec nesmí sáhnout – jinak by si obešel to jediné, co mu je zapovězeno.

Prakticky: **auditor je administrátor bez přístupu k penězům klientů.** Dělá
rozvrh, zadává testy, kontroluje odpracované hodiny a spravuje účty, ale
kartotéka (kdo kolik zaplatil a kolik mu zbývá hodin) je pro něj zavřená –
tlačítko v liště nevidí a přímé otevření `kartoteka.html` ho odmítne.

Jedna výjimka, která vypadá jako díra, ale není: tabulku `students` (jména,
třída, telefon) auditor číst i zapisovat **musí** – rozvrh z ní bere jména
žáků k lekcím a při založení lekce s novým jménem zakládá kartu. Zavřené jsou
platby a kredit (`payments`, `credit_log`), ne jména.

Role neplatí jen v prohlížeči – vynucuje je i databáze přes **RLS politiky**
na konci [`schema.sql`](schema.sql):

- nepřihlášený uživatel nevidí **nic**;
- lektor čte rozvrh, karty žáků a diagnostiku, ale zakládat a mazat lekce
  nemůže – a u své lekce mu trigger `guard_lesson_update` propustí jen
  `done`, `status` a `description`, ostatní sloupce vrátí na původní hodnotu;
- kartotéka, platby, kredit, výkaz hodin a účty jsou jen pro administrátora
  (funkce `is_admin()` čte roli z `profiles`).

## 5) Důležité poznámky

- **Bezpečnost:** anon klíč v `config.js` je veřejný záměrně – sám o sobě
  nic neotevře, protože všechna pravidla stojí na RLS a přihlášení.
  Po každé změně schématu si projeď `select tablename, policyname, cmd from
  pg_policies where schemaname = 'public'` a zkontroluj, že nikde nezůstalo
  `using (true)` na zápis.
- **Uspávání:** projekt na free tieru se po 7 dnech nečinnosti pauzne; pak ho
  probudíš v dashboardu. Pro ostrý provoz se počítá s placeným tarifem.
- **Časové pásmo:** lekce se ukládají jako `timestamptz`, počítá se
  `Europe/Prague` (výkaz hodin i čerpání kreditu podle něj určují datum).

---

## 6) Další krok (až bude rozvrh hotový): SMS o zrušení

Plán automatizace (zatím nenaprogramováno):

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
| `config.js` | Adresa a veřejný klíč Supabase + rozsah dne |
| `app.js` | Logika rozvrhu (vykreslování, detail, ukládání, výkaz hodin, účty lektorů) |
| `opakovani.js` | Výpočet termínů pravidelných (opakovaných) lekcí |
| `schema.sql` | Databázové schéma pro Supabase včetně RLS pravidel |
| `migrace_*.sql` | Postupné úpravy schématu pro už běžící databázi |
| `migrace_prava_ostry_provoz.sql` | Ostrá přístupová práva (RLS) pro starší databázi |
| `migrace_role_auditor.sql` | Role auditor + mazání účtů z appky |
| `migrace_materialy.sql` | Materiály na procvičování (tabulka + úložiště souborů) |
| `reset_ostry_provoz.sql` | Jednorázové smazání všech provozních dat |
| `diagnostika.html` + `diagnostika.js` | Diagnostický test a plán přípravy |
| `kartoteka.html` + `kartoteka.js` | Kartotéka: klienti, platby a kredit hodin |
| `DATABASE.md` | Návrh databáze: retence, hodiny lektorů, hosting a zálohy |
| `NASAZENI.md` | Krok-za-krokem postup nasazení do ostrého provozu |
