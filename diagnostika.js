// ---------------------------------------------------------------------------
// Diagnostický test – vyhodnocení a plán přípravy.
//
// Vyhodnocení je záměrně ALGORITMICKÉ (pevná pravidla), ne AI:
//  - funguje hned, zdarma a offline, bez API klíče v prohlížeči,
//  - pro stejné body dá vždy stejný výsledek (férové porovnávání žáků).
// AI dává smysl až jako nadstavba na serveru (Supabase Edge Function ->
// Claude API), která z těchto výsledků napíše slovně bohatší zprávu pro
// rodiče. Postup je popsaný v DATABASE.md.
// ---------------------------------------------------------------------------

// Oblasti testu. Klíč se ukládá do výsledků (a v ostré verzi do tabulky
// diagnostics jako JSON), max = maximum bodů v dané oblasti.
const AREAS = [
  { key: "cteni",    name: "Čtení – rychlost a porozumění", max: 20 },
  { key: "pravopis", name: "Psaní a pravopis",              max: 20 },
  { key: "pocty",    name: "Matematika – počítání",         max: 20 },
  { key: "slovni",   name: "Matematika – slovní úlohy",     max: 20 },
  { key: "pozornost",name: "Pozornost a soustředění",       max: 20 },
  { key: "pamet",    name: "Paměť a učení",                 max: 20 },
  { key: "rec",      name: "Řeč a slovní zásoba",           max: 20 },
];

// Konkrétní cvičení, která se propíšou do plánu podle slabých oblastí.
const EXERCISES = {
  cteni:    "čtení s okénkem, střídavé čtení nahlas, otázky k textu po každém odstavci",
  pravopis: "doplňovačky i/y, krátké diktáty, kartičky vyjmenovaných slov",
  pocty:    "pamětné počítání do 100, násobilka s kartičkami, práce s číselnou osou",
  slovni:   "podtrhávání klíčových údajů, zápis „co vím / co hledám“, kreslení schémat k úloze",
  pozornost:"krátké bloky práce 10–15 min s přestávkami, hledání rozdílů, práce s časovačem",
  pamet:    "opakování látky po 24 hodinách, myšlenkové mapy, mnemotechnické pomůcky",
  rec:      "převyprávění příběhu vlastními slovy, popis obrázku, hry se synonymy",
};

// Hranice pásem (podíl získaných bodů).
const WEAK_LIMIT = 0.45;   // pod 45 % = slabá stránka
const STRONG_LIMIT = 0.7;  // nad 70 % = silná stránka

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Vyhodnocení ----------
// Vrátí { results: [{key,name,points,max,pct,band}], strengths, weaknesses, mids }
function evaluate(scores) {
  const results = AREAS.map((a) => {
    const points = scores[a.key];
    const pct = points / a.max;
    const band = pct < WEAK_LIMIT ? "weak" : pct > STRONG_LIMIT ? "strong" : "mid";
    return { ...a, points, pct, band };
  });
  const byPct = (x, y) => x.pct - y.pct;
  return {
    results,
    weaknesses: results.filter((r) => r.band === "weak").sort(byPct),
    mids: results.filter((r) => r.band === "mid").sort(byPct),
    strengths: results.filter((r) => r.band === "strong").sort((x, y) => y.pct - x.pct),
  };
}

// Sestaví plán na 8 týdnů: slabé oblasti se střídají jako hlavní téma
// (nejslabší nejčastěji), oblasti „k procvičení“ jako doplněk.
function buildPlan(ev) {
  const focusPool = ev.weaknesses.length ? ev.weaknesses : ev.mids.length ? ev.mids : ev.results.slice(0, 2);
  const extraPool = ev.weaknesses.length ? ev.mids : [];
  const weeks = [];
  for (let w = 0; w < 8; w++) {
    const focus = focusPool[w % focusPool.length];
    const extra = extraPool.length ? extraPool[w % extraPool.length] : null;
    weeks.push({
      n: w + 1,
      focus,
      extra,
      exercises: EXERCISES[focus.key],
      review: w === 3 || w === 7, // ve 4. a 8. týdnu kontrolní opakování
    });
  }
  const perWeek = ev.weaknesses.length >= 3 ? 3 : ev.weaknesses.length >= 1 ? 2 : 1;
  return { weeks, perWeek };
}

function summaryText(name, ev, plan) {
  const avg = Math.round((ev.results.reduce((s, r) => s + r.pct, 0) / ev.results.length) * 100);
  let s = "<b>" + escapeHtml(name) + "</b> – celková úspěšnost <b>" + avg + " %</b>. ";
  if (ev.weaknesses.length) {
    s += "Doporučujeme <b>" + plan.perWeek + "× týdně</b> doučování se zaměřením na: " +
      ev.weaknesses.map((r) => "<b>" + escapeHtml(r.name) + "</b>").join(", ") + ". ";
  } else {
    s += "Žák nemá výrazně slabou oblast – stačí <b>1× týdně</b> udržovací lekce. ";
  }
  if (ev.strengths.length) {
    s += "Silné stránky (" + ev.strengths.map((r) => escapeHtml(r.name)).join(", ") +
      ") využijte jako motivaci a odrazový můstek.";
  }
  return s;
}

// ---------- Vykreslení výsledku ----------
function renderResult(entry) {
  const ev = evaluate(entry.scores);
  const plan = buildPlan(ev);

  $("resTitle").textContent = "Výsledek: " + entry.name + " (" + entry.grade + ")";
  $("resSummary").innerHTML = summaryText(entry.name, ev, plan) +
    (entry.note ? '<br><span style="color:#666">Poznámka: ' + escapeHtml(entry.note) + "</span>" : "");

  $("resBars").innerHTML = ev.results.map((r) => {
    const pct = Math.round(r.pct * 100);
    return '<div class="bar-row"><span>' + escapeHtml(r.name) + "</span>" +
      '<div class="bar-track"><div class="bar-fill ' + r.band + '" style="width:' + pct + '%"></div></div>' +
      '<span class="bar-pct">' + r.points + "/" + r.max + "</span></div>";
  }).join("");

  const list = (rows, empty) => rows.length
    ? "<ul>" + rows.map((r) => "<li>" + escapeHtml(r.name) + " (" + Math.round(r.pct * 100) + " %)</li>").join("") + "</ul>"
    : '<span class="diag-note">' + empty + "</span>";
  $("resSW").innerHTML =
    '<div class="sw-strong"><h3>✔ Silné stránky</h3>' + list(ev.strengths, "Žádná oblast nad 70 %.") + "</div>" +
    '<div class="sw-weak"><h3>✘ Slabé stránky</h3>' + list(ev.weaknesses, "Žádná oblast pod 45 % – super!") + "</div>";

  $("resPlan").innerHTML =
    '<table class="plan-table"><tr><th>Týden</th><th>Hlavní zaměření</th><th>Co dělat na lekcích</th></tr>' +
    plan.weeks.map((w) =>
      "<tr><td>" + w.n + ".</td><td><b>" + escapeHtml(w.focus.name) + "</b>" +
      (w.extra ? '<br><span style="color:#777">+ ' + escapeHtml(w.extra.name) + "</span>" : "") +
      "</td><td>" + escapeHtml(w.exercises) +
      (w.review ? "<br><b>Kontrolní opakování a mini-test pokroku.</b>" : "") +
      "</td></tr>"
    ).join("") + "</table>" +
    '<p class="diag-note" style="margin-top:10px;">Doporučená frekvence: <b>' + plan.perWeek +
    "× týdně</b>. Po 8 týdnech test zopakujte a plán aktualizujte.</p>";

  $("resultCard").classList.remove("hidden");
  $("saveInfo").textContent = "";
  $("resultCard").scrollIntoView({ behavior: "smooth" });
}

// ---------- Formulář ----------
function readForm() {
  const name = $("dName").value.trim();
  if (!name) return { error: "Vyplňte jméno žáka." };
  const scores = {};
  for (const a of AREAS) {
    const v = Number($("s_" + a.key).value);
    if ($("s_" + a.key).value === "" || isNaN(v) || v < 0 || v > a.max) {
      return { error: "Oblast „" + a.name + "“: zadejte 0–" + a.max + " bodů." };
    }
    scores[a.key] = v;
  }
  return {
    entry: {
      name,
      grade: $("dGrade").value,
      date: $("dDate").value || new Date().toISOString().slice(0, 10),
      note: $("dNote").value.trim(),
      scores,
      savedAt: Date.now(),
    },
  };
}

// ---------- Historie (localStorage; v ostré verzi tabulka diagnostics) ----------
const STORAGE_KEY = "poradys_diagnostics";
let lastEntry = null;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function renderHistory() {
  const items = loadHistory();
  const el = $("historyList");
  if (!items.length) { el.innerHTML = '<span class="diag-note">Zatím žádné uložené testy.</span>'; return; }
  el.innerHTML = "";
  items.slice().reverse().forEach((it) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = '<span class="h-date">' + escapeHtml(it.date) + '</span>' +
      '<span class="h-name">' + escapeHtml(it.name) + '</span>' +
      '<span class="diag-note">' + escapeHtml(it.grade) + "</span>";
    const show = document.createElement("button");
    show.textContent = "Zobrazit";
    show.onclick = () => renderResult(it);
    const del = document.createElement("button");
    del.textContent = "Smazat";
    del.onclick = () => {
      const rest = loadHistory().filter((x) => x.savedAt !== it.savedAt);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
      renderHistory();
    };
    row.appendChild(show);
    row.appendChild(del);
    el.appendChild(row);
  });
}

// ---------- Inicializace ----------
window.addEventListener("DOMContentLoaded", () => {
  $("dDate").value = new Date().toISOString().slice(0, 10);
  $("scoreRows").innerHTML = AREAS.map((a) =>
    '<div class="score-row"><label for="s_' + a.key + '">' + escapeHtml(a.name) + "</label>" +
    '<input type="number" id="s_' + a.key + '" min="0" max="' + a.max + '" placeholder="0" />' +
    '<span class="max">z ' + a.max + " b.</span></div>"
  ).join("");

  $("evalBtn").onclick = () => {
    const r = readForm();
    $("dError").textContent = r.error || "";
    if (r.error) return;
    lastEntry = r.entry;
    renderResult(r.entry);
  };
  $("printBtn").onclick = () => window.print();
  $("saveBtn").onclick = () => {
    if (!lastEntry) return;
    const items = loadHistory();
    items.push(lastEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    $("saveInfo").textContent = "Uloženo ✓";
    renderHistory();
  };
  renderHistory();
});
