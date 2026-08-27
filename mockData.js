// ---------------------------------------------------------------------------
// Ukázková data (mock) – aby appka fungovala bez Supabase.
// Struktura odpovídá tomu, co později vrátí Supabase pohled "lesson_details".
// ---------------------------------------------------------------------------

// Učebny / stoly = sloupce v denním rozvrhu. Barva bloku = barva místnosti.
window.ROOMS = [
  { id: "office-1", name: "Office učebna 1",     color: "#4d4d4d", sort: 1 },
  { id: "sam-1",    name: "Samostatná učebna 1", color: "#c4733a", sort: 2 },
  { id: "sam-2",    name: "Samostatná učebna 2", color: "#2e6b3e", sort: 3 },
  { id: "jaz-1",    name: "Jazyková stůl 1",     color: "#cf9089", sort: 4 },
  { id: "jaz-2",    name: "Jazyková stůl 2",     color: "#c06a61", sort: 5 },
  { id: "jaz-3",    name: "Jazyková stůl 3",     color: "#b34d44", sort: 6 },
  { id: "jaz-4",    name: "Jazyková stůl 4",     color: "#9c3a32", sort: 7 },
  { id: "vse-1",    name: "Všeobecná stůl 1",    color: "#a7d488", sort: 8 },
  { id: "vse-2",    name: "Všeobecná stůl 2",    color: "#84c25f", sort: 9 },
  { id: "vse-3",    name: "Všeobecná stůl 3",    color: "#6cae45", sort: 10 },
  { id: "vse-4",    name: "Všeobecná stůl 4",    color: "#5a9c39", sort: 11 },
  { id: "mat-1",    name: "Matematická stůl 1",  color: "#7a97d6", sort: 12 },
  { id: "mat-2",    name: "Matematická stůl 2",  color: "#6f8fd0", sort: 13 },
  { id: "mat-3",    name: "Matematická stůl 3",  color: "#6385c8", sort: 14 },
  { id: "mat-4",    name: "Matematická stůl 4",  color: "#587bc0", sort: 15 },
  { id: "mat-5",    name: "Matematická stůl 5",  color: "#4f72b8", sort: 16 },
  { id: "mat-6",    name: "Matematická stůl 6",  color: "#4569b0", sort: 17 },
];

// Klienti – JEDEN seznam pro rozvrh i kartotéku. Dřív měla každá stránka svůj
// vlastní a čísla se nemohla potkat (kartotéka pak neuměla odečíst vyčerpané
// hodiny z lekcí zapsaných v rozvrhu). V ostré verzi je nahradí tabulka
// `students`, která má stejné sloupce.
window.MOCK_CLIENTS = [
  { id: "k1",  name: "Aftanas Lukáš",       phone: "777050743", category: "ZŠ", grade: "5. třída",            school: "ZŠ Norská, Kladno",     subjects: "AJ",       lector_name: "Štruncová",   price_hour: 420, price_hour_discount: 410, payment_method: "hotově",         status: "active", note: "",                  flag: "inperson" },
  { id: "k2",  name: "Balík Petr",          phone: "723111222", category: "ZŠ", grade: "7. třída",            school: "ZŠ Moskevská, Kladno",  subjects: "MAT",      lector_name: "Kunkelová",   price_hour: 440, price_hour_discount: 420, payment_method: "účet PoraDys",   status: "active", note: "",                  flag: "online" },
  { id: "k3",  name: "Berchak Anna",        phone: "605333444", category: "SŠ", grade: "2. ročník",           school: "Gymnázium Kladno",      subjects: "ČJ, MAT",  lector_name: "Mužíková",    price_hour: 450, price_hour_discount: 430, payment_method: "účet DR",        status: "active", note: "přijímačky na VŠ",  flag: "contacted" },
  { id: "k4",  name: "Bezdičková Ela",      phone: "776555666", category: "ZŠ", grade: "9. tř. – přijímačky", school: "ZŠ Zákostelní, Kladno", subjects: "ČJ, MAT",  lector_name: "Šíma",        price_hour: 430, price_hour_discount: 420, payment_method: "účet jazykovka", status: "active", note: "",                  flag: "problem" },
  { id: "k5",  name: "Vondrušková Melissa", phone: "731777888", category: "ZŠ", grade: "8. třída",            school: "ZŠ Amálská, Kladno",    subjects: "MAT",      lector_name: "Machalíková", price_hour: 420, price_hour_discount: 410, payment_method: "hotově",         status: "active", note: "",                  flag: "" },
  { id: "k6",  name: "Zvonař František",    phone: "702999000", category: "SŠ", grade: "3. roč.",             school: "SPŠ Kladno",            subjects: "ČJ, MAT",  lector_name: "Tampír",      price_hour: 420, price_hour_discount: 410, payment_method: "účet PoraDys",   status: "former", note: "ukončeno 6/2026",   flag: "ending" },
  { id: "k7",  name: "Novák Petr",          phone: "777111222", category: "ZŠ", grade: "7. třída",            school: "ZŠ Norská, Kladno",     subjects: "MAT",      lector_name: "Kunkelová",   price_hour: 430, price_hour_discount: 420, payment_method: "hotově",         status: "active", note: "",                  flag: "" },
  { id: "k8",  name: "Svobodová Anna",      phone: "605222333", category: "ZŠ", grade: "9. tř. – přijímačky", school: "ZŠ Moskevská, Kladno",  subjects: "ČJ, MAT",  lector_name: "Mužíková",    price_hour: 440, price_hour_discount: 420, payment_method: "účet PoraDys",   status: "active", note: "",                  flag: "inperson" },
  { id: "k9",  name: "Dvořák Jakub",        phone: "731333444", category: "SŠ", grade: "2. ročník",           school: "Gymnázium Kladno",      subjects: "MAT, FYZ", lector_name: "Snížková",    price_hour: 450, price_hour_discount: 430, payment_method: "účet DR",        status: "active", note: "",                  flag: "" },
  { id: "k10", name: "Černá Eliška",        phone: "776444555", category: "ZŠ", grade: "5. třída",            school: "ZŠ Amálská, Kladno",    subjects: "ČJ",       lector_name: "Bečková",     price_hour: 420, price_hour_discount: 410, payment_method: "hotově",         status: "active", note: "",                  flag: "online" },
  { id: "k11", name: "Procházka Tomáš",     phone: "702555666", category: "SŠ", grade: "3. ročník",           school: "SPŠ Kladno",            subjects: "AJ",       lector_name: "Snížková",    price_hour: 440, price_hour_discount: 420, payment_method: "účet jazykovka", status: "active", note: "",                  flag: "" },
  { id: "k12", name: "Kučerová Tereza",     phone: "608666777", category: "ZŠ", grade: "8. třída",            school: "ZŠ Zákostelní, Kladno", subjects: "AJ, NJ",   lector_name: "Bečková",     price_hour: 430, price_hour_discount: 420, payment_method: "účet PoraDys",   status: "active", note: "",                  flag: "" },
  { id: "k13", name: "Opata Jiří",          phone: "777333444", category: "SŠ", grade: "1. ročník",           school: "SPŠ Kladno",            subjects: "MAT",      lector_name: "Jenčíková",   price_hour: 440, price_hour_discount: 430, payment_method: "účet DR",        status: "active", note: "",                  flag: "contacted" },
  { id: "k14", name: "Milka Stanislav",     phone: "605777888", category: "ZŠ", grade: "6. třída",            school: "ZŠ Norská, Kladno",     subjects: "AJ",       lector_name: "Šíma",        price_hour: 420, price_hour_discount: 410, payment_method: "hotově",         status: "active", note: "",                  flag: "" },
  { id: "k15", name: "Kimlová Nela",        phone: "739888999", category: "SŠ", grade: "4. ročník",           school: "Gymnázium Kladno",      subjects: "MAT",      lector_name: "Machalíková", price_hour: 450, price_hour_discount: 430, payment_method: "účet PoraDys",   status: "active", note: "",                  flag: "" },
];

// Zaplacené kredity hodin (v ostré verzi tabulka `payments`).
window.MOCK_PAYMENTS = [
  { id: "p1",  student_id: "k1",  paid_at: "2026-05-02", amount_czk: 4200, hours_credit: 10, method: "hotově",         note: "" },
  { id: "p2",  student_id: "k1",  paid_at: "2026-07-14", amount_czk: 4200, hours_credit: 10, method: "hotově",         note: "" },
  { id: "p3",  student_id: "k2",  paid_at: "2026-06-20", amount_czk: 4400, hours_credit: 10, method: "účet PoraDys",   note: "" },
  { id: "p4",  student_id: "k3",  paid_at: "2026-04-11", amount_czk: 4500, hours_credit: 10, method: "účet DR",        note: "" },
  { id: "p5",  student_id: "k4",  paid_at: "2026-07-01", amount_czk: 8600, hours_credit: 20, method: "účet jazykovka", note: "" },
  { id: "p6",  student_id: "k5",  paid_at: "2026-03-05", amount_czk: 4200, hours_credit: 10, method: "hotově",         note: "počáteční zůstatek z Excelu" },
  { id: "p7",  student_id: "k6",  paid_at: "2026-02-10", amount_czk: 4200, hours_credit: 10, method: "účet PoraDys",   note: "" },
  { id: "p8",  student_id: "k7",  paid_at: "2026-06-02", amount_czk: 4300, hours_credit: 10, method: "hotově",         note: "" },
  { id: "p9",  student_id: "k8",  paid_at: "2026-06-30", amount_czk: 8800, hours_credit: 20, method: "účet PoraDys",   note: "" },
  { id: "p10", student_id: "k9",  paid_at: "2026-05-18", amount_czk: 4500, hours_credit: 10, method: "účet DR",        note: "" },
  { id: "p11", student_id: "k10", paid_at: "2026-07-06", amount_czk: 4200, hours_credit: 10, method: "hotově",         note: "" },
  { id: "p12", student_id: "k11", paid_at: "2026-05-25", amount_czk: 4400, hours_credit: 10, method: "účet jazykovka", note: "" },
  { id: "p13", student_id: "k12", paid_at: "2026-06-08", amount_czk: 4300, hours_credit: 10, method: "účet PoraDys",   note: "" },
  { id: "p14", student_id: "k13", paid_at: "2026-07-02", amount_czk: 8800, hours_credit: 20, method: "účet DR",        note: "" },
  { id: "p15", student_id: "k14", paid_at: "2026-04-20", amount_czk: 4200, hours_credit: 10, method: "hotově",         note: "" },
  { id: "p16", student_id: "k15", paid_at: "2026-07-09", amount_czk: 4500, hours_credit: 10, method: "účet PoraDys",   note: "" },
];

function _client(name) { return window.MOCK_CLIENTS.find((c) => c.name === name) || null; }

// Pomůcka: vyrobí Date pro dnešní den (resp. zadané datum) v daný čas.
function _at(baseDate, h, m) {
  const d = new Date(baseDate);
  d.setHours(h, m || 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Náhodná testovací data pro 13.–26. 7. 2026.
// Generátor je deterministický (seed = datum), takže stejný den vypadá při
// každém načtení stejně, ale každý den v tomto rozsahu je jiný.
// ---------------------------------------------------------------------------
const RANDOM_FROM = "2026-07-13";
const RANDOM_TO = "2026-07-26";

function _localKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// Malý seedovaný generátor pseudonáhodných čísel (mulberry32).
function _mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Žáci v náhodných lekcích jsou přímo klienti z kartotéky – jen tak je vidět,
// že potvrzená lekce ubere kredit na jejich kartě.
const MOCK_STUDENTS = window.MOCK_CLIENTS.filter((c) => c.status === "active").map((c) => c.name);

const MOCK_LECTORS = [
  "Kunkelová", "Mužíková", "Snížková", "Bečková", "Machalíková",
  "Jenčíková", "Feireislová", "Koncelíková", "Šíma", "Selicharová",
];
const MOCK_SUBJECTS = ["MAT", "ČJ", "AJ", "NJ", "Přír.", "FYZ", "CHE"];
const MOCK_DESCRIPTIONS = [
  "Procvičování na písemku, zadán domácí úkol.",
  "Opakování látky z minulé hodiny, šlo to dobře.",
  "Nová látka + společné počítání příkladů.",
  "Četba s porozuměním, otázky k textu.",
  "Příprava na přijímačky – testové úlohy.",
];

function _buildRandomLessons(d) {
  const rnd = _mulberry32(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const dow = d.getDay(); // 0 = neděle, 6 = sobota
  const count = dow === 0 ? Math.floor(rnd() * 3) : dow === 6 ? 3 + Math.floor(rnd() * 4) : 9 + Math.floor(rnd() * 8);

  const lessons = [];

  // Směny lektorů u stolů – co si šéfová ráno zapisuje ke každému stolu.
  if (dow !== 0) {
    const shiftRooms = window.ROOMS.slice(0, 4 + Math.floor(rnd() * 4));
    shiftRooms.forEach((room, i) => {
      const from = 8 + Math.floor(rnd() * 3);          // 8–10
      const to = from + 4 + Math.floor(rnd() * 5);     // 4–8 hodin
      lessons.push({
        id: "rndshift-" + i,
        kind: "shift",
        room_id: room.id,
        starts_at: _at(d, from, 0),
        ends_at: _at(d, Math.min(to, 21), 0),
        student_names: "",
        subject: "",
        lector_name: pick(MOCK_LECTORS),
        mode: "offline",
        status: "planned",
        done: false,
        description: "",
      });
      // občas se u stolu vystřídají dva lektoři
      if (rnd() < 0.35 && to < 18) {
        lessons.push({
          id: "rndshift-b-" + i,
          kind: "shift",
          room_id: room.id,
          starts_at: _at(d, Math.min(to, 20), 0),
          ends_at: _at(d, Math.min(to + 4, 21), 0),
          student_names: "",
          subject: "",
          lector_name: pick(MOCK_LECTORS),
          mode: "offline",
          status: "planned",
          done: false,
          description: "",
        });
      }
    });
  }

  const busy = {}; // room_id -> [{s,e}] – ať se lekce v jedné místnosti nepřekrývají
  const wanted = lessons.length + count; // v lessons už jsou směny, ty se nepočítají
  for (let n = 0; n < count * 3 && lessons.length < wanted; n++) {
    const room = pick(window.ROOMS);
    const startH = 8 + Math.floor(rnd() * 10); // 8–17
    const startM = rnd() < 0.75 ? 0 : 30;
    const durMin = pick([60, 60, 60, 90, 120]);
    const s = startH * 60 + startM, e = s + durMin;
    if (e > 21 * 60) continue;
    const slots = busy[room.id] || (busy[room.id] = []);
    if (slots.some((x) => s < x.e && x.s < e)) continue; // kolize -> nový pokus
    slots.push({ s, e });

    const r = rnd();
    const status = r < 0.25 ? "done" : r < 0.32 ? "cancelled" : r < 0.36 ? "no_show" : "planned";
    const done = status === "done";
    const who = pick(MOCK_STUDENTS);
    const cl = _client(who);
    lessons.push({
      id: "rnd-" + lessons.length,
      kind: "lesson",
      room_id: room.id,
      starts_at: _at(d, Math.floor(s / 60), s % 60),
      ends_at: _at(d, Math.floor(e / 60), e % 60),
      student_names: who,
      student_phone: (cl && cl.phone) || "",
      student_grade: (cl && cl.grade) || "",
      student_category: (cl && cl.category) || "",
      subject: pick(MOCK_SUBJECTS),
      lector_name: pick(MOCK_LECTORS),
      mode: rnd() < 0.18 ? "online" : "offline",
      // většina lekcí je klasická opakovaná, občas se přihodí mimořádná
      lesson_type: rnd() < 0.15 ? "extra" : "regular",
      status: status,
      done: done,
      // poznámka i u naplánovaných lekcí – ukazuje se rovnou v buňce rozvrhu
      description: done || rnd() < 0.4 ? pick(MOCK_DESCRIPTIONS) : "",
    });
  }
  return lessons;
}

// Vrátí ukázkové lekce pro zadané datum (aby den nebyl nikdy prázdný).
window.buildMockLessons = function (date) {
  const d = date || new Date();
  const key = _localKey(d);
  if (key >= RANDOM_FROM && key <= RANDOM_TO) return _buildRandomLessons(d);
  let i = 1;
  const L = (room, sh, sm, eh, em, student, subject, lector, extra) =>
    Object.assign(
      {
        id: "mock-" + i++,
        kind: "lesson",
        room_id: room,
        starts_at: _at(d, sh, sm),
        ends_at: _at(d, eh, em),
        student_names: student,
        student_phone: (_client(student) || {}).phone || "",
        student_grade: (_client(student) || {}).grade || "",
        student_category: (_client(student) || {}).category || "",
        subject: subject,
        lector_name: lector,
        mode: "offline",
        lesson_type: "regular",
        status: "planned",
        done: false,
        description: "",
      },
      extra || {}
    );

  // Směna: kdo je u kterého stolu a od kolika do kolika. Ukáže se jako řádek
  // pod názvem stolu – přesně to, co si šéfová dřív psala jako "lekci" v 8:00.
  const S = (room, sh, eh, lector, note) => ({
    id: "mock-" + i++,
    kind: "shift",
    room_id: room,
    starts_at: _at(d, sh, 0),
    ends_at: _at(d, eh, 0),
    student_names: "",
    subject: "",
    lector_name: lector,
    mode: "offline",
    status: "planned",
    done: false,
    description: note || "",
  });

  return [
    S("office-1", 8, 13, "Kunkelová"),
    S("office-1", 13, 17, "Šíma"),
    S("sam-1", 8, 17, "Mužíková"),
    S("sam-2", 13, 17, "Kunkelová", "zaskakuje za Mužíkovou"),
    S("jaz-1", 14, 17, "Snížková", "dopoledne nemůže"),
    S("jaz-2", 8, 16, "Bečková"),
    S("vse-2", 8, 12, "Selicharová"),
    S("vse-3", 12, 16, "Machalíková"),
    S("mat-1", 8, 14, "Machalíková"),
    S("mat-1", 14, 18, "Jenčíková"),
    S("mat-2", 8, 14, "Jenčíková"),
    S("mat-2", 14, 16, "Feireislová"),

    L("office-1", 9, 0, 11, 0, "Šíma", "AJ", "Kunkelová", { status: "done", done: true, description: "Opakování minulého času, poslech." }),
    L("office-1", 13, 0, 14, 0, "Milka Stanislav", "AJ", "Šíma", { description: "Nepravidelná slovesa – přinést sešit." }),
    L("office-1", 14, 0, 15, 0, "Barášková Kristýna", "AJ", "Šíma"),

    L("sam-1", 14, 0, 15, 0, "Hamouz Ondřej", "ČJ", "Mužíková", { description: "Shoda přísudku s podmětem." }),
    L("sam-1", 15, 0, 16, 0, "Petřík Sebastián a Daniel", "ČJ", "Mužíková"),
    L("sam-1", 16, 0, 17, 0, "Nedvěd Oliver", "ČJ", "Mužíková"),

    L("sam-2", 13, 0, 15, 0, "Tůmová Adéla", "AJ", "Mužíková"),
    L("sam-2", 16, 0, 17, 0, "Hromadníková Iva", "AJ", "Mužíková"),

    L("jaz-1", 16, 0, 17, 0, "Pajskr David", "MAT", "Snížková", { description: "Zlomky – převody." }),

    L("jaz-2", 14, 0, 15, 0, "Lukaškin Žena", "ČJ", "Bečková"),
    L("jaz-2", 15, 0, 16, 0, "Mládek Martin", "ČJ", "Bečková", { description: "Čtení s porozuměním, diagnostika." }),

    L("vse-3", 12, 0, 13, 30, "Flekáčová", "Přír.", "Machalíková", { mode: "online" }),
    L("vse-3", 14, 0, 16, 0, "Kimlová Nela", "MAT", "Machalíková"),

    L("mat-1", 14, 0, 16, 0, "Opata Jiří", "MAT", "Jenčíková", { description: "Příprava na přijímačky – testové úlohy." }),
    L("mat-1", 16, 0, 18, 0, "Příbyl", "MAT", "Jenčíková"),

    L("mat-2", 14, 0, 15, 0, "Petřík Sebastián a Daniel", "MAT", "Feireislová"),
    L("mat-2", 15, 0, 16, 0, "Lacko", "MAT", "Feireislová"),

    L("mat-6", 13, 0, 15, 0, "Filipenský Matěj", "MAT", "Koncelíková", { mode: "online" }),
  ];
};

// ---------------------------------------------------------------------------
// DEMO ÚLOŽIŠTĚ – jediná zásoba dat pro celý ukázkový režim (?demo=1).
// ---------------------------------------------------------------------------
// Rozvrh (index.html) i kartotéka (kartoteka.html) jsou samostatné stránky,
// takže si data v paměti předat nedokážou. Bez společného úložiště kartotéka
// neviděla lekce zapsané v rozvrhu a nemohla z nich odečíst vyčerpané hodiny –
// zůstatky se prostě nehýbaly. Tady leží klienti, platby i lekce pohromadě
// v localStorage prohlížeče; v ostré verzi tuhle roli hraje Supabase.
//
// Data jsou jen v prohlížeči toho, kdo si appku prohlíží. Vyčistit je jde
// zavoláním DemoStore.reset() v konzoli (nebo smazáním dat stránky).
// ---------------------------------------------------------------------------
const _DEMO_KEY = "poradys_demo_v1";

window.DemoStore = {
  _d: null,
  _seq: 1,

  _fresh() {
    return {
      clients: window.MOCK_CLIENTS.map((c) => ({ ...c })),
      payments: window.MOCK_PAYMENTS.map((p) => ({ ...p })),
      lessons: [],
      seeded: [],
    };
  },

  _data() {
    if (this._d) return this._d;
    let raw = null;
    try { raw = localStorage.getItem(_DEMO_KEY); } catch (e) { /* privátní režim */ }
    if (raw) {
      try {
        const d = JSON.parse(raw);
        d.lessons = (d.lessons || []).map((l) => ({
          ...l, starts_at: new Date(l.starts_at), ends_at: new Date(l.ends_at),
        }));
        d.clients = d.clients || [];
        d.payments = d.payments || [];
        d.seeded = d.seeded || [];
        this._d = d;
        return d;
      } catch (e) { /* poškozená data – začneme načisto */ }
    }
    this._d = this._fresh();
    // Kus historie, ať kartotéka hned ukazuje smysluplně vyčerpané hodiny.
    for (const day of _demoHistoryDays()) this.ensureDay(day);
    this.save();
    return this._d;
  },

  save() {
    const d = this._d;
    if (!d) return;
    try {
      localStorage.setItem(_DEMO_KEY, JSON.stringify({
        clients: d.clients,
        payments: d.payments,
        seeded: d.seeded,
        lessons: d.lessons.map((l) => ({
          ...l, starts_at: l.starts_at.toISOString(), ends_at: l.ends_at.toISOString(),
        })),
      }));
    } catch (e) { /* plné úložiště – demo pojede aspoň do zavření stránky */ }
  },

  reset() {
    try { localStorage.removeItem(_DEMO_KEY); } catch (e) {}
    this._d = null;
  },

  // Den se ukázkovými lekcemi se vygeneruje jednou a pak se drží (aby se
  // úpravy neztrácely a obě stránky viděly totéž).
  // Vrací true, když se den teď doopravdy doplnil – volající pak ví, že se
  // vyplatí uložit (jinak by se při každém překreslení serializovalo všechno).
  ensureDay(date) {
    const store = this._d || this._data();
    const key = _localKey(date);
    if (store.seeded.includes(key)) return false;
    store.seeded.push(key);
    window.buildMockLessons(date).forEach((l, i) => {
      store.lessons.push({ ...l, id: "mock-" + key + "-" + i });
    });
    return true;
  },

  lessons() { return this._data().lessons; },
  clients() { return this._data().clients; },
  payments() { return this._data().payments; },

  newId(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + this._seq++; },
};

// Dny, které se do dema předgenerují jako "historie" (rozsah náhodných dat).
function _demoHistoryDays() {
  const out = [];
  const [fy, fm, fd] = RANDOM_FROM.split("-").map(Number);
  const [ty, tm, td] = RANDOM_TO.split("-").map(Number);
  const to = new Date(ty, tm - 1, td);
  for (let d = new Date(fy, fm - 1, fd); d <= to; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}
