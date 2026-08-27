# PoraDys – návrh databáze (lekce, klienti, pracovníci, hodiny)

Tenhle dokument odpovídá na zadání: *„databáze lekcí rok zpátky, databáze klientů,
databáze pracovníků (držet 10+ let), hodiny se pracovníkům připočítávají podle
toho, co odmáčknou v appce, a na konci měsíce šéfová vidí u pracovníka 15 h
a podle toho zaplatí – ideálně zdarma."*

Vše, co je tu popsané, je už připravené v [`schema.sql`](schema.sql) – stačí ho
spustit v Supabase SQL editoru.

---

## 1) Jaké tabulky a proč

| Tabulka | Co drží | Jak dlouho |
|---|---|---|
| `lessons` | lekce v rozvrhu (čas, učebna, lektor, stav); `kind = 'shift'` = záznam „kdo je u stolu od–do" | **~13 měsíců**, starší maže `purge_old_lessons()` |
| `students` | klienti/žáci – aktuální i bývalí (`status: active/former`) | **nemaže se** – bývalý klient se jen označí `former` |
| `lectors` | pracovníci (jméno, kontakt, **hodinová sazba**, nástup/odchod) | **nemaže se** (požadavek 10+ let) – odchod = `left_at` + `active=false` |
| `work_log` | **odpracované hodiny** – 1 řádek za každou potvrzenou lekci | **nemaže se** (10+ let); je maličký |
| `attendance` | kdo byl na které lekci (žák ↔ lekce) | maže se spolu s lekcí |
| `payments` | platby klientů (částka + kredit hodin) – kartotéka | **nemaže se** (finanční podklad) |
| `credit_log` | čerpání kreditu (1 řádek = účast na odučené lekci) | **nemaže se**, plní se triggery |
| `diagnostics` | výsledky diagnostických testů + vygenerovaný plán | nemaže se |
| `profiles` | přihlašovací role (admin / lektor) | – |

**Odučené hodiny v kartotéce.** V kartě klienta je sekce *Odučené hodiny*:
kolik jich přišlo z rozvrhu, jaké byly ruční korekce a kolik je celkem
vyčerpáno. Korekce (`credit_log` s `manual = true`) se zadává v hodinách –
kladně přidá (lekce se protáhla, doučovalo se mimo rozvrh), záporně odečte
(zapsáno omylem). Zápisy z rozvrhu zůstávají nedotčené, takže je vždy poznat,
co spočítala appka a co do toho někdo sáhl rukou.

**Kartotéka (kreditový systém):** klient předplatí hodiny (řádek v `payments`),
každá odučená lekce s jeho účastí kredit čerpá (`credit_log`, plní se triggery
stejně jako `work_log`). Pohled `student_credit` počítá zaplaceno / vyčerpáno /
zůstatek – to čte stránka **kartoteka.html** (přehled TOTAL, karta klienta,
hlídání nízkého kreditu, export CSV, hromadný import z Excelu).

## 2) Jak se počítají hodiny (klíčová část)

Celý řetězec od kliknutí v appce po výplatu vypadá takhle:

```
lektor klikne „Odučeno“        databázový trigger              šéfová na konci měsíce
        │                             │                                │
        ▼                             ▼                                ▼
UPDATE lessons SET done=true → log_lesson_work() zapíše  →  pohled lector_monthly_hours
                               do work_log: kdo, den,        sečte minuty po měsících:
                               kolik minut                   „Kunkelová: 15 h → 3 750 Kč“
```

Krok za krokem:

1. **Lektor v appce otevře svou lekci a zaškrtne „Lekce proběhla"** (sloupec
   `done` v tabulce `lessons` se přepne na `true`). To je jediné, co lektor
   dělá – žádné vykazování bokem.
2. Na tabulce `lessons` visí **trigger `lessons_work_log`**. Spustí se při
   každém INSERTu/UPDATE lekce a volá funkci `log_lesson_work()`, která:
   - když je lekce **potvrzená** (`done = true`): spočítá minuty z délky
     lekce (`ends_at - starts_at`, např. 14:00–15:30 = 90 minut) a **zapíše
     řádek do `work_log`**: který lektor, který den, kolik minut, jaký předmět;
   - když admin u potvrzené lekce **změní čas nebo lektora**: řádek ve
     `work_log` se automaticky **přepočítá** (upsert přes `lesson_id`);
   - když lektor potvrzení **zruší** (`done` zpět na `false`): řádek se
     z `work_log` **smaže** – hodiny nikdy nesedí „navíc";
   - když admin lekci **smaže z rozvrhu**, smažou se i její hodiny
     (smazaná lekce = omyl, práce za ni nenáleží);
   - **roční úklid** starých lekcí hodiny naopak **zachová** – funkce
     `purge_old_lessons()` je před mazáním od lekcí odpojí;
   - lekce **bez lektora** se ignoruje (není komu hodiny připsat).
3. `work_log` je tedy **účetní kniha odpracované práce**: jeden řádek = jedna
   potvrzená lekce. Nikdo do ní nezapisuje ručně, plní se výhradně triggerem –
   proto sedí s tím, co lektoři reálně odmáčkli.
4. **Pohled `lector_monthly_hours`** (pohled = uložený dotaz, nezabírá místo)
   seskupí `work_log` po lektorech a měsících:

   | lector_name | year | month | lessons | hours | payout_czk |
   |---|---|---|---|---|---|
   | Kunkelová | 2026 | 7 | 14 | 15.00 | 3 750 |

   `hours` = součet minut / 60, `payout_czk` = hodiny × `lectors.hourly_rate`
   (sazbu stačí jednou vyplnit u každého lektora). Tlačítko **„Výkaz hodin"**
   v appce čte přesně tenhle pohled.

**Proč zvláštní tabulka `work_log` a ne jen součet lekcí?** Dva důvody:

- **Retence:** lekce se po 13 měsících mažou, ale podklad pro výplaty musí
  vydržet 10+ let. `work_log` má na lekci jen „měkkou" vazbu
  (`on delete set null`) – smazání staré lekce záznam o odpracované práci
  nezasáhne.
- **Auditovatelnost:** i kdyby někdo lekci dodatečně přepsal nebo smazal,
  ve `work_log` je vidět, co bylo v době potvrzení odpracováno.

## 3) Jak si ověřím, že to funguje

### a) Hned teď v prototypu (mock režim, nic nepotřebuješ)

1. Přihlas se jako lektor (`kunkelova@poradys.cz` / `lektor123`), klikni na
   nějakou lekci, zaškrtni **„Lekce proběhla (potvrzuji)"** a ulož.
2. Odhlas se, přihlas jako admin (`admin@poradys.cz` / `admin123`) a klikni na
   **„Výkaz hodin"** – v aktuálním měsíci uvidíš, že danému lektorovi přibyly
   hodiny odpovídající délce lekce. Když potvrzení zase odškrtneš, hodiny zmizí.

   (V mocku se počítá přímo z lekcí v paměti; v ostré verzi to samé dělá
   `work_log` + pohled – viz b.)

### b) V Supabase (ostrá verze) – připravený skript

V repu je [`test_databaze.sql`](test_databaze.sql). Pozor: SQL Editor
v Supabase zobrazuje jen výsledek **posledního** příkazu, proto má skript
dvě varianty:

- **Varianta A (doporučená):** označ celý blok „VARIANTA A" → Run. Vyjde
  tabulka s 8 kontrolami (hodiny lektorů i kredit klientů) a sloupcem
  `vysledek` – všude musí být **OK**. Test po sobě uklidí.
- **Varianta B:** ruční krokování po blocích (označ blok → Run) s komentáři
  `OČEKÁVÁNÍ` – vhodné, když chceš vidět, co se děje uvnitř.

Testuje se celý životní cyklus:

| Krok | Co dělá | Co má vyjít |
|---|---|---|
| 1–2 | založí testovací lektorku (250 Kč/h) a lekci 14:00–15:30 | – |
| 3 | kontrola před potvrzením | `work_log` prázdný |
| 4–5 | „odmáčknutí" lekce (`done = true`) | ve `work_log` řádek s **90 minutami** |
| 6 | pohled `lector_monthly_hours` | **1.50 h, 375 Kč** |
| 7 | zrušení potvrzení | řádek z `work_log` zmizel |
| 8 | potvrdit a **smazat lekci** | hodiny se smazaly také (omyl v rozvrhu) |
| 9 | úklid testovacích dat | databáze jako předtím |

Roční úklid (`purge_old_lessons`) hodiny naopak **zachovává** – před mazáním
starých lekcí je odpojí. Ověřuje to kontrola č. 6 ve Variantě A.

### c) Ověření z appky proti Supabase

V ostrém režimu (appka bez `?demo=1` v adrese): admin založí lekci, lektor ji
potvrdí a tlačítko **„Výkaz hodin"** musí ukázat stejná čísla jako dotaz
`select * from lector_monthly_hours;` v SQL editoru. Když sedí, celý řetězec
appka → trigger → výkaz funguje.

## 4) Vejdeme se do 500 MB zdarma? Ano, s obrovskou rezervou

Hrubý výpočet (schválně nadsazený):

- 1 lekce ≈ 0,5 kB včetně indexů. Při **150 lekcích týdně** je to ~7 800 lekcí
  ročně ≈ **4 MB/rok**.
- `work_log` řádek je ještě menší – 10 let provozu ≈ **20–30 MB**.
- Žáci + lektoři + diagnostiky: tisíce řádků ≈ jednotky MB.

**Celkem i po 10 letech provozu odhadem pod 50 MB** – free limit 500 MB je
10× víc, než kdy budete potřebovat. Databáze rozvrhu je prostě malá; 500 MB
zaplní až fotky/přílohy, které neukládáme.

Na co si u Supabase free tarifu dát pozor:

- **Pauza po 7 dnech neaktivity** – v běžném provozu se nestane (appka se
  používá denně). O letních prázdninách stačí jednou týdně appku otevřít,
  nebo projekt probudit jedním klikem v dashboardu.
- **Žádné automatické zálohy** na free tarifu → jednou měsíčně udělat zálohu
  ručně (viz bod 5). Kdyby to začalo vadit, tarif Pro ($25/měs.) má denní
  zálohy – ale začít se dá klidně zdarma.

## 5) Supabase vs. starý počítač v kanceláři

| | **Supabase (doporučuji)** | Starý PC v kanceláři |
|---|---|---|
| Cena | **0 Kč** (free tarif stačí) | 0 Kč + elektřina (~200–400 Kč/měs. při 24/7) |
| Přístup odkudkoli | ✅ automaticky (i z domu, z mobilu) | ❌ jen z kanceláře; zpřístupnění ven = veřejná IP / VPN / Cloudflare Tunnel – jde to, ale je to práce a odpovědnost navíc |
| Zálohy | ruční export 1× měsíčně (Pro tarif: denní automaticky) | musíte si vyřešit sami |
| Údržba | žádná (spravovaný Postgres) | aktualizace, výpadky proudu, umírající disk – vše na vás |
| Zabezpečení | HTTPS, přihlašování, RLS hotové | musíte si nastavit sami |

**Doporučení: Supabase free tarif.** Lektoři i šéfová potřebují rozvrh otevřít
i z domu (hlavně u online výuky) – a přesně to by domácí server bez další práce
neuměl. Starý počítač ale nemusí do šrotu – použijte ho jako **úložiště záloh**:
jednou měsíčně na něj stáhnout export databáze (bod 5).

## 6) Záloha jednou měsíčně (na ten starý počítač)

Nejjednodušší cesta bez instalace čehokoli: v Supabase **Database → Backups**
nejde na free tarifu, ale **SQL Editor → spustit `select * from ...` → Export CSV**
funguje. Pohodlnější je `pg_dump` (Supabase → Project Settings → Database →
Connection string):

```bash
pg_dump "postgresql://postgres:HESLO@db.tvuj-projekt.supabase.co:5432/postgres" \
  --no-owner -f zaloha-2026-07.sql
```

Soubor uložit na starý počítač / flash disk. Hotovo – i kdyby se cokoli stalo,
data máte doma.

## 7) Úklid starých lekcí

`schema.sql` obsahuje funkci `purge_old_lessons()` – smaže lekce starší 13
měsíců (hodiny ve `work_log` zůstávají). Spouštění:

- ručně: 1× za čas v SQL editoru `select purge_old_lessons();`
- automaticky: zapnout rozšíření **pg_cron** (Database → Extensions) a
  odkomentovat řádek `cron.schedule(...)` ve schématu – pak se úklid dělá
  sám první den v měsíci.

## 7b) Rozvrh – lektoři u stolů a hromadné potvrzení dne

**Kdo je u kterého stolu.** Řádek v `lessons` se sloupcem `kind = 'shift'`
není lekce, ale poznámka „u tohohle stolu je dnes Kunkelová 8–13". V rozvrhu
se ukáže jako proužek pod názvem stolu; zakládá se tlačítkem
**+ Lektor u stolu** (nebo přepínačem *Typ zápisu* v detailu). Směny:

- se **nepočítají** do odpracovaných hodin (`work_log`) ani nečerpají kredit
  žáka (`credit_log`) – hlídají to triggery,
- **nekolidují** s lekcemi, takže lekce mají uvnitř směny normálně vznikat,
- **kopírují se** tlačítkem *Protáhnout týden →*, takže stálé rozpisy stačí
  nastavit jednou.

Řádek se směnami je ve všech sloupcích stejně vysoký (podle stolu s nejvíc
lektory) – jinak by se sloupce svisle rozjely proti časové ose.

**Konec dne.** Tlačítko **✓ Vše odučeno (N)** označí naráz všechny naplánované
lekce zobrazeného dne. Vynechá zrušené, nedostavené i směny a bere lekce obou
režimů (prezenční i online), takže večer stačí jedno kliknutí místo obcházení
celého rozvrhu. Vidí ho jen administrátor; lektoři si dál odklikávají své
lekce jednotlivě.

**Poznámka v buňce.** Popis lekce se ukazuje přímo v bloku rozvrhu (kurzívou);
co se do bloku nevejde, je celé v tooltipu.

**Co je v buňce vidět.** Čas, žák, jeho třída a kategorie, předmět, lektor,
telefon a poznámka – tedy i to, *o jaké doučování jde*, ne jen předmět.
Telefon, třídu a kategorii bere pohled `lesson_details` z karty klienta,
takže se nikde neduplikují.

**Zakládání lekcí.** *+ Nová lekce* startuje nejbližší celou hodinou a konec
se dopočítá na +1 hodinu (a drží si délku, když se posune začátek).
**Dvojklikem do prázdna** v rozvrhu vznikne lekce přímo na tom čase a stole –
tím jde doplnit i hodina, která už proběhla. *Opakovat* založí kopie
**jen na následující týden** (denně / týdně / ob týden); dál dopředu se rozvrh
protahuje tlačítkem *Protáhnout týden →*.

**Nový klient rovnou z rozvrhu.** Když je v poli *Žák* jméno, které kartotéka
nezná, formulář nabídne kategorii (ZŠ/SŠ/pracující…), třídu, telefon a způsob
platby – uloží se s lekcí do `students`, takže se karta nemusí zakládat zvlášť.
U známého jména se místo toho ukáže, co už kartotéka ví.

**Export do Excelu.** Tlačítko *⬇ Excel* stáhne den, týden nebo měsíc jako
`.csv` s BOM a středníkem – Excel ho otevře dvojklikem včetně diakritiky.

**Vzhled.** Původní vysoká hlavička (název, dlaždice učeben, kalendář) je
pryč: filtr učeben je rozbalovací seznam v liště a kalendář se otevře
kliknutím na datum. Uvolněných ~180 px dostala mřížka, takže bloky jsou
zhruba dvakrát vyšší a čitelné. Den končí ve 20:00 (`DAY_END_HOUR`
v [`config.js`](config.js)).

## 8) Diagnostické testy – karta žáka, práva, algoritmus vs. AI

Stránka [`diagnostika.html`](diagnostika.html) nezačíná formulářem, ale
**vyhledáním žáka**. Seznam se čte z tabulky `students` (stejná data jako
kartotéka), takže u žáka rovnou vidíte **školu a třídu**. Po otevření karty
jsou tam všechny jeho testy, sloupcový graf oblastí, vývoj v čase a tlačítko
**Zpráva pro rodiče (PDF)** – to otevře tiskový dialog, kde stačí zvolit
„Uložit jako PDF" (A4 souhrn s grafy a doporučenou přípravou na 8 týdnů).

**Zadávání testů:** kromě tlačítka „+ Nový test" na kartě žáka je v seznamu
tlačítko **📝 Zadávat testy** – režim na přepisování celého stohu papírových
testů. Předmět a datum se zvolí jednou pro celou dávku, pak už jen dokola:
napsat pár písmen ze jména → <kbd>Enter</kbd> → body, mezi poli
<kbd>Enter</kbd>, u posledního pole <kbd>Enter</kbd> uloží a nachystá dalšího
žáka. Myš není potřeba. Uložené testy se sypou do seznamu „Uložené v této
dávce", kde má každý tlačítko **Vrátit** (překlep se smaže jedním klikem).
Když žák v systému ještě není, poslední položka v našeptávači ho rovnou založí.

**Práva:** roli bere stránka z tabulky `profiles`.

| | administrátor | lektor |
|---|---|---|
| vyhledat žáka, číst výsledky, tisknout zprávu | ✅ | ✅ |
| zadat výsledky nového testu, smazat test | ✅ | ❌ |
| založit nového žáka | ✅ | ❌ |

V appce se lektorovi tlačítka pro zápis nezobrazí; navíc to hlídají **RLS
politiky** `diag_*` a `stud_*` na konci [`schema.sql`](schema.sql) (čtení pro
všechny přihlášené, zápis jen `is_admin()`). Ten blok spusťte až poté, co má
aspoň jeden účet roli `admin` – jinak nebude moct zapisovat nikdo.

Vyhodnocení testu je **pevný algoritmus** přímo v prohlížeči (pásma: pod 45 %
nezvládá, 45–75 % zvládá částečně, nad 75 % zvládá; plán na 8 týdnů střídá
slabé oblasti). Proč ne rovnou AI:

- AI klíč **nesmí** být ve veřejném webu (kdokoli by ho vytáhl a utrácel váš kredit),
- algoritmus je zdarma, okamžitý a pro stejné body dá vždy stejný výsledek.

**AI jako nadstavba později (doporučený postup):** až pojede Supabase, přidat
Edge Function (běží na serveru, klíč zůstane tajný), která vezme uložené
výsledky z tabulky `diagnostics` a přes Claude API vygeneruje slovně bohatou
zprávu pro rodiče. Tlačítko „Vygenerovat zprávu (AI)" se pak jen přidá na
stránku diagnostiky. Základní vyhodnocení ale zůstane algoritmické – je
spolehlivé a zadarmo.

## 9) Co udělat, až se bude přecházet z prototypu na ostrý provoz

1. Založit projekt na [supabase.com](https://supabase.com) (free).
2. Spustit celý [`schema.sql`](schema.sql) v SQL editoru.
3. Založit účty lektorů (Authentication → Users), adminovi zvednout roli.
4. Vyplnit `lectors.hourly_rate` u každého lektora.
5. V [`config.js`](config.js) vyplnit URL + anon klíč (databáze je výchozí;
   ukázkový režim se zapíná `?demo=1` v adrese) a spustit migrace
   `migrace_*.sql`.
6. **Zpřísnit RLS** – spustit blok „PRÁVA K DIAGNOSTICKÝM TESTŮM A KARTÁM
   ŽÁKŮ" na konci `schema.sql` (zápis testů a žáků jen admin) a nahradit
   zbylé prototypové `proto_all` politiky vzorem úplně na konci souboru
   (lektor smí měnit jen popis/odučeno, rozvrh jen admin).
7. Web samotný (HTML/JS soubory) hostovat zdarma na GitHub Pages / Netlify /
   Cloudflare Pages – je to statická stránka, server nepotřebuje.
