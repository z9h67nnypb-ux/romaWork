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
  { id: "vse-1",    name: "Všeobecná stůl 1",    color: "#a7d488", sort: 7 },
  { id: "vse-2",    name: "Všeobecná stůl 2",    color: "#84c25f", sort: 8 },
  { id: "vse-3",    name: "Všeobecná stůl 3",    color: "#6cae45", sort: 9 },
  { id: "vse-4",    name: "Všeobecná stůl 4",    color: "#5a9c39", sort: 10 },
  { id: "mat-1",    name: "Matematická stůl 1",  color: "#7a97d6", sort: 11 },
  { id: "mat-2",    name: "Matematická stůl 2",  color: "#6f8fd0", sort: 12 },
  { id: "mat-3",    name: "Matematická stůl 3",  color: "#6385c8", sort: 13 },
  { id: "mat-4",    name: "Matematická stůl 4",  color: "#587bc0", sort: 14 },
  { id: "mat-5",    name: "Matematická stůl 5",  color: "#4f72b8", sort: 15 },
  { id: "mat-6",    name: "Matematická stůl 6",  color: "#4569b0", sort: 16 },
];

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

const MOCK_STUDENTS = [
  "Novák Petr", "Svobodová Anna", "Dvořák Jakub", "Černá Eliška", "Procházka Tomáš",
  "Kučerová Tereza", "Veselý Martin", "Horáková Lucie", "Němec Filip", "Pokorná Karolína",
  "Marek Vojtěch", "Pospíšilová Natálie", "Hájek Ondřej", "Králová Adéla", "Beneš Šimon",
  "Fialová Viktorie", "Sedláček Matyáš", "Doležalová Ema", "Zeman Daniel", "Kolářová Sofie",
];
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
  const busy = {}; // room_id -> [{s,e}] – ať se lekce v jedné místnosti nepřekrývají
  for (let n = 0; n < count * 3 && lessons.length < count; n++) {
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
    lessons.push({
      id: "rnd-" + lessons.length,
      room_id: room.id,
      starts_at: _at(d, Math.floor(s / 60), s % 60),
      ends_at: _at(d, Math.floor(e / 60), e % 60),
      student_names: pick(MOCK_STUDENTS),
      subject: pick(MOCK_SUBJECTS),
      lector_name: pick(MOCK_LECTORS),
      mode: rnd() < 0.18 ? "online" : "offline",
      status: status,
      done: done,
      description: done ? pick(MOCK_DESCRIPTIONS) : "",
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
        room_id: room,
        starts_at: _at(d, sh, sm),
        ends_at: _at(d, eh, em),
        student_names: student,
        subject: subject,
        lector_name: lector,
        mode: "offline",
        status: "planned",
        done: false,
        description: "",
      },
      extra || {}
    );

  return [
    L("office-1", 8, 0, 9, 0, "Šíma", "AJ", "Kunkelová"),
    L("office-1", 9, 0, 11, 0, "Vedoucí lektor dne", "—", "Kunkelová", { status: "done", done: true }),
    L("office-1", 13, 0, 14, 0, "Milka Stanislav", "AJ", "Šíma"),
    L("office-1", 14, 0, 15, 0, "Barášková Kristýna", "AJ", "Šíma", { status: "planned" }),

    L("sam-1", 8, 0, 9, 0, "Kunkelová", "—", "Mužíková"),
    L("sam-1", 14, 0, 15, 0, "Hamouz Ondřej", "ČJ", "Mužíková"),
    L("sam-1", 15, 0, 16, 0, "Petřík Sebastián a Daniel", "ČJ", "Mužíková"),
    L("sam-1", 16, 0, 17, 0, "Nedvěd Oliver", "ČJ", "Mužíková"),

    L("sam-2", 8, 0, 9, 0, "Mužíková", "—", "Kunkelová"),
    L("sam-2", 13, 0, 15, 0, "Tůmová Adéla", "AJ", "Mužíková"),
    L("sam-2", 16, 0, 17, 0, "Hromadníková Iva", "AJ", "Mužíková"),

    L("jaz-1", 8, 0, 12, 0, "Snížková (k dispozici od 14:00)", "—", "Snížková", { status: "cancelled", description: "JARNÍ PRÁZDNINY" }),
    L("jaz-1", 16, 0, 17, 0, "Pajskr David", "MAT", "Snížková"),

    L("jaz-2", 8, 0, 9, 0, "Bečková", "ČJ", "Bečková"),
    L("jaz-2", 14, 0, 15, 0, "Lukaškin Žena", "ČJ", "Bečková"),
    L("jaz-2", 15, 0, 16, 0, "Mládek Martin", "ČJ", "Bečková"),

    L("vse-2", 8, 0, 9, 0, "Selicharová", "—", "Selicharová"),

    L("vse-3", 12, 0, 13, 30, "Flekáčová", "Přír.", "Machalíková", { mode: "online" }),
    L("vse-3", 14, 0, 16, 0, "Kimlová Nela", "MAT", "Machalíková"),

    L("mat-1", 8, 0, 9, 0, "Machalíková", "MAT", "Machalíková"),
    L("mat-1", 14, 0, 16, 0, "Opata Jiří", "MAT", "Jenčíková"),
    L("mat-1", 16, 0, 18, 0, "Příbyl", "MAT", "Jenčíková"),

    L("mat-2", 8, 0, 9, 0, "Jenčíková", "MAT", "Jenčíková"),
    L("mat-2", 14, 0, 15, 0, "Petřík Sebastián a Daniel", "MAT", "Feireislová"),
    L("mat-2", 15, 0, 16, 0, "Lacko", "MAT", "Feireislová"),

    L("mat-6", 13, 0, 15, 0, "Filipenský Matěj", "MAT", "Koncelíková", { mode: "online" }),
  ];
};
