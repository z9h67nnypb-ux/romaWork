// ---------------------------------------------------------------------------
// Diagnostický test – dva předměty (záložky), vyhodnocení, plán přípravy
// a historie testů žáka s grafem vývoje.
//
// Ukládání:
//  - když je zapnuté Supabase a uživatel je přihlášený (přes rozvrh),
//    výsledky se ukládají do tabulky `diagnostics` v databázi,
//  - jinak spadne na localStorage (jen tento prohlížeč) – appka funguje dál.
//
// Vyhodnocení je záměrně ALGORITMICKÉ (pevná pravidla), ne AI – funguje hned,
// zdarma, offline a pro stejné body dá vždy stejný výsledek. AI dává smysl až
// jako serverová nadstavba (viz DATABASE.md).
// ---------------------------------------------------------------------------

// ===========================================================================
// KATEGORIE TESTŮ – UPRAV ZDE.
// Každá oblast: key (ukládá se do databáze – po nasazení už neměnit),
// name (zobrazený text), max (maximum bodů) a focus (na co se zaměřit –
// poddovednosti z hodnotícího archu; propíšou se do plánu přípravy).
//
// ČEŠTINA odpovídá „1. diagnostickému testu z ČJ pro žáky 9. tříd" a
// „Hodnotícímu archu k průběžnému testu" (PoraDys – Vzdělávací centrum Kladno).
// ===========================================================================
const SUBJECTS = {
  cestina: {
    label: "Čeština",
    icon: "📖",
    grade: "9. třída (průběžný test)",
    maxTotal: 64,
    areas: [
      { key: "pravopis", name: "Pravopisné jevy", max: 10, focus: [
        "psaní i/y v koncovkách",
        "předpony s / z",
        "psaní velkých písmen",
        "významově rozlišená slova",
      ] },
      { key: "tvaroslovi", name: "Tvarosloví", max: 20, focus: [
        "tvary přídavných jmen",
        "určování slovních druhů",
        "mluvnické kategorie podstatných jmen",
        "mluvnické kategorie sloves",
        "kořen a předpony",
      ] },
      { key: "vetnastavba", name: "Větná stavba", max: 10, focus: [
        "rozlišování věty jednoduché a souvětí",
        "větné členy",
        "druhy vět vedlejších",
        "významové poměry mezi větami",
        "interpunkce",
      ] },
      { key: "slovnizasoba", name: "Slovní zásoba", max: 8, focus: [
        "význam slov v kontextu",
        "spisovná × nespisovná čeština",
        "citové zabarvení slov",
      ] },
      { key: "stylistika", name: "Stylistika a literatura", max: 16, focus: [
        "rozlišení druhů textů",
        "obrazná pojmenování",
        "základní literární pojmy",
      ] },
    ],
  },
  matematika: {
    label: "Matematika",
    icon: "🧮",
    grade: "",
    note: "Kategorie a bodování doplníme podle vašeho testu z matematiky (zatím orientační).",
    areas: [
      { key: "pocty",     name: "Počítání (základní operace)", max: 20, focus: ["pamětné počítání", "násobilka", "písemné algoritmy"] },
      { key: "zlomky",    name: "Zlomky a desetinná čísla",    max: 20, focus: ["krácení a rozšiřování zlomků", "převody na desetinná čísla"] },
      { key: "slovni",    name: "Slovní úlohy",                max: 20, focus: ["zápis úlohy (co vím / co hledám)", "úměra a trojčlenka"] },
      { key: "geometrie", name: "Geometrie",                   max: 20, focus: ["obvody a obsahy", "konstrukce", "tělesa"] },
      { key: "rovnice",   name: "Rovnice a výrazy",            max: 20, focus: ["úpravy výrazů", "řešení rovnic"] },
    ],
  },
};

// Hranice pásem podle hodnotícího archu (zvládá / částečně zvládá / nezvládá).
const MID_LIMIT = 0.45;    // pod 45 % = nezvládá
const STRONG_LIMIT = 0.75; // od 75 % = zvládá; mezi tím = částečně zvládá
const BAND = {
  strong: { label: "zvládá", cls: "strong" },
  mid:    { label: "částečně zvládá", cls: "mid" },
  weak:   { label: "nezvládá", cls: "weak" },
};

// Celkové hodnocení podle hodnotícího archu (4 stupně).
function overallAssessment(pct) {
  if (pct >= 85) return "Výborné zvládnutí učiva";
  if (pct >= 70) return "Velmi dobré zvládnutí učiva";
  if (pct >= 50) return "Dostačující zvládnutí učiva";
  return "Učivo vyžaduje systematické doplnění";
}

const STORAGE_KEY = "poradys_diagnostics";
const $ = (id) => document.getElementById(id);

let activeSubject = "cestina";
let lastResult = null;   // { entry, ev, plan } – poslední vyhodnocený test
let allEntries = [];     // cache uložených testů (DB nebo localStorage)

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDateCz(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return d + ". " + m + ". " + y;
}

// ---------- Úložiště (Supabase / localStorage) ----------
const CFG = window.APP_CONFIG || {};
const supa = (CFG.USE_SUPABASE && window.supabase)
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

function loadLocal() {
  let items;
  try { items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { items = []; }
  // starší záznamy (před záložkami) neměly subject ani id
  return items.map((x) => ({
    id: x.id || "local-" + (x.savedAt || Math.random()),
    subject: x.subject || "matematika",
    name: x.name, grade: x.grade || "", date: x.date, note: x.note || "",
    scores: x.scores,
  }));
}

// Najde žáka podle jména, případně ho založí. Když to RLS nedovolí
// (lektor nesmí zakládat žáky), vrátí null a test se uloží jen se jménem.
async function resolveStudentId(name) {
  const { data } = await supa.from("students").select("id").eq("name", name).limit(1);
  if (data && data.length) return data[0].id;
  const { data: ins, error } = await supa.from("students").insert({ name }).select("id").single();
  if (error) throw error;
  return ins.id;
}

const Store = {
  db: false,
  async init() {
    if (!supa) return;
    try {
      const { data } = await supa.auth.getSession();
      this.db = !!(data && data.session);
    } catch (e) { console.error(e); }
  },
  async list() {
    if (this.db) {
      const { data, error } = await supa.from("diagnostics").select("*")
        .order("taken_at", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((r) => ({
        id: r.id, subject: r.subject || "matematika", name: r.student_name,
        grade: r.grade || "", date: r.taken_at, note: r.note || "", scores: r.scores,
      }));
    }
    return loadLocal();
  },
  async save(entry, ev, plan) {
    if (this.db) {
      let student_id = null;
      try { student_id = await resolveStudentId(entry.name); } catch (e) { console.warn("Žáka nešlo založit:", e.message); }
      const { error } = await supa.from("diagnostics").insert({
        student_id,
        student_name: entry.name,
        subject: entry.subject,
        grade: entry.grade,
        taken_at: entry.date,
        note: entry.note || null,
        scores: entry.scores,
        strengths: ev.strengths.map((r) => r.name),
        weaknesses: ev.weaknesses.map((r) => r.name),
        plan: plan.weeks.map((w) => w.n + ". týden: " + w.focus.name + " – " + w.exercises).join("\n"),
      });
      if (error) throw error;
    } else {
      const items = loadLocal();
      items.push({ ...entry, id: "local-" + Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  },
  async remove(id) {
    if (this.db) {
      const { error } = await supa.from("diagnostics").delete().eq("id", id);
      if (error) throw error;
    } else {
      const keep = loadLocal().filter((x) => x.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
    }
  },
};

// ---------- Vyhodnocení ----------
function evaluate(subjKey, scores) {
  const results = SUBJECTS[subjKey].areas.map((a) => {
    const points = scores[a.key];
    const pct = points / a.max;
    const band = pct < MID_LIMIT ? "weak" : pct >= STRONG_LIMIT ? "strong" : "mid";
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

function overallPct(subjKey, scores) {
  const areas = SUBJECTS[subjKey].areas;
  const pts = areas.reduce((s, a) => s + (Number(scores[a.key]) || 0), 0);
  const max = areas.reduce((s, a) => s + a.max, 0);
  return Math.round((pts / max) * 100);
}

// Vybere z oblasti pár konkrétních poddovedností „na co se zaměřit".
// Prostřídá je podle pořadí týdne, ať se v plánu neopakuje pořád totéž.
function focusPicks(area, week) {
  const f = area.focus || [];
  if (!f.length) return "procvičování dané oblasti";
  if (f.length <= 2) return f.join(", ");
  const a = f[week % f.length];
  const b = f[(week + 1) % f.length];
  return a + ", " + b;
}

function buildPlan(subjKey, ev) {
  // Nejdřív oblasti „nezvládá", pak „částečně zvládá"; když je vše zvládnuté,
  // vezmeme nejslabší z toho, co je, na udržovací procvičování.
  const focusPool = ev.weaknesses.length
    ? ev.weaknesses.concat(ev.mids)
    : ev.mids.length ? ev.mids : ev.results.slice().sort((a, b) => a.pct - b.pct).slice(0, 2);
  const weeks = [];
  for (let w = 0; w < 8; w++) {
    const focus = focusPool[w % focusPool.length];
    weeks.push({
      n: w + 1, focus,
      exercises: focusPicks(focus, w),
      review: w === 3 || w === 7, // ve 4. a 8. týdnu kontrolní opakování
    });
  }
  const perWeek = ev.weaknesses.length >= 3 ? 3 : ev.weaknesses.length >= 1 ? 2 : 1;
  return { weeks, perWeek };
}

function summaryText(entry, ev, plan) {
  const avg = overallPct(entry.subject, entry.scores);
  const S = SUBJECTS[entry.subject];
  const pts = S.areas.reduce((s, a) => s + (Number(entry.scores[a.key]) || 0), 0);
  const max = S.areas.reduce((s, a) => s + a.max, 0);
  let s = "<b>" + escapeHtml(entry.name) + "</b> – " + S.label +
    ", celkem <b>" + pts + " / " + max + " b. (" + avg + " %)</b>. " +
    'Celkové hodnocení: <b>' + overallAssessment(avg) + "</b>. ";
  if (ev.weaknesses.length) {
    s += "Doporučujeme <b>" + plan.perWeek + "× týdně</b> doučování se zaměřením na: " +
      ev.weaknesses.map((r) => "<b>" + escapeHtml(r.name) + "</b>").join(", ") + ". ";
  } else if (ev.mids.length) {
    s += "Doporučujeme <b>" + plan.perWeek + "× týdně</b> upevnit oblasti, které žák zvládá jen částečně. ";
  } else {
    s += "Žák nemá slabou oblast – stačí <b>1× týdně</b> udržovací lekce. ";
  }
  if (ev.strengths.length) {
    s += "Bez problémů zvládá: " + ev.strengths.map((r) => escapeHtml(r.name)).join(", ") + ".";
  }
  return s;
}

// ---------- Vykreslení výsledku ----------
function renderResult(entry) {
  const ev = evaluate(entry.subject, entry.scores);
  const plan = buildPlan(entry.subject, ev);
  lastResult = { entry, ev, plan };

  const S = SUBJECTS[entry.subject];
  $("resTitle").textContent = "Hodnotící arch: " + entry.name + " – " + S.label + " (" + entry.grade + ", " + fmtDateCz(entry.date) + ")";
  $("resSummary").innerHTML = summaryText(entry, ev, plan) +
    (entry.note ? '<br><span style="color:#666">Poznámka: ' + escapeHtml(entry.note) + "</span>" : "");

  // Přehled oblastí s úrovní (zvládá / částečně zvládá / nezvládá) – jako v archu.
  $("resBars").innerHTML = ev.results.map((r) => {
    const pct = Math.round(r.pct * 100);
    return '<div class="bar-row"><span>' + escapeHtml(r.name) + "</span>" +
      '<div class="bar-track"><div class="bar-fill ' + r.band + '" style="width:' + pct + '%"></div></div>' +
      '<span class="bar-pct">' + r.points + "/" + r.max + ' b. · <span class="lvl ' + BAND[r.band].cls + '">' + BAND[r.band].label + "</span></span></div>";
  }).join("");

  // „Na co se zaměřit" – konkrétní poddovednosti u oblastí, které nejsou zvládnuté.
  const toWork = ev.weaknesses.concat(ev.mids);
  const focusHtml = toWork.length
    ? toWork.map((r) => '<div class="focus-block"><h4>' + escapeHtml(r.name) +
        ' <span class="lvl ' + BAND[r.band].cls + '">' + BAND[r.band].label + "</span></h4><ul>" +
        (r.focus || []).map((f) => "<li>" + escapeHtml(f) + "</li>").join("") + "</ul></div>").join("")
    : '<span class="diag-note">Všechny oblasti žák zvládá – žádné cílené doplnění není potřeba. 🎉</span>';
  $("resSW").innerHTML = '<div class="focus-wrap"><h3>Na co se zaměřit</h3>' + focusHtml + "</div>";

  $("resPlan").innerHTML =
    '<table class="plan-table"><tr><th>Týden</th><th>Hlavní zaměření</th><th>Co procvičovat na lekcích</th></tr>' +
    plan.weeks.map((w) =>
      "<tr><td>" + w.n + ".</td><td><b>" + escapeHtml(w.focus.name) + "</b>" +
      ' <span class="lvl ' + BAND[w.focus.band].cls + '">' + BAND[w.focus.band].label + "</span>" +
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

// ---------- Graf vývoje (SVG, bez knihoven) ----------
// Jedna řada = úspěšnost žáka v čase pro aktivní předmět. Body mají nativní
// tooltip (title), popisek nese jen poslední bod, mřížka je nenápadná.
function chartSVG(entries) {
  const W = 640, H = 230, L = 38, R = 18, T = 16, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const pts = entries.map((e) => ({ date: e.date, pct: overallPct(e.subject, e.scores) }));
  const x = (i) => pts.length === 1 ? L + iw / 2 : L + (i * iw) / (pts.length - 1);
  const y = (p) => T + ih - (p / 100) * ih;

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vývoj úspěšnosti žáka v čase">';
  // mřížka + popisky osy Y
  [0, 25, 50, 75, 100].forEach((g) => {
    s += '<line x1="' + L + '" y1="' + y(g) + '" x2="' + (W - R) + '" y2="' + y(g) + '" stroke="#e8e8e8" stroke-width="1"/>';
    s += '<text x="' + (L - 6) + '" y="' + (y(g) + 3.5) + '" text-anchor="end" font-size="10" fill="#777">' + g + "</text>";
  });
  // spojnice
  if (pts.length > 1) {
    const path = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.pct).toFixed(1)).join(" ");
    s += '<path d="' + path + '" fill="none" stroke="#2f5fbf" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  // body s tooltipem, popisky osy X
  pts.forEach((p, i) => {
    const showLabel = pts.length <= 8 || i % 2 === 0 || i === pts.length - 1;
    s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.pct).toFixed(1) + '" r="4.5" fill="#2f5fbf" stroke="#fff" stroke-width="2">' +
      "<title>" + fmtDateCz(p.date) + " – " + p.pct + " %</title></circle>";
    if (showLabel) {
      const [yy, mm, dd] = String(p.date).slice(0, 10).split("-").map(Number);
      s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#777">' + dd + "." + mm + ".</text>";
    }
  });
  // hodnota jen u posledního bodu (ostatní přes tooltip)
  const last = pts[pts.length - 1];
  s += '<text x="' + (x(pts.length - 1) + (pts.length === 1 ? 10 : 0)).toFixed(1) + '" y="' + (y(last.pct) - 9) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#222">' + last.pct + " %</text>";
  s += "</svg>";
  return s;
}

// ---------- Historie ----------
function renderHistory() {
  const S = SUBJECTS[activeSubject];
  const name = $("dName").value.trim().toLowerCase();
  const subjEntries = allEntries.filter((e) => e.subject === activeSubject);
  const mine = name ? subjEntries.filter((e) => e.name.trim().toLowerCase() === name) : [];

  $("histTitle").textContent = "Historie testů – " + S.label;
  $("histSub").textContent = name
    ? (mine.length ? "Žák: " + $("dName").value.trim() + " · " + mine.length + " test(ů)" : "Pro tohoto žáka zatím žádný test z předmětu " + S.label + ".")
    : "Zadejte nahoře jméno žáka a uvidíte jeho vývoj v grafu. Níže jsou všechny uložené testy.";

  // graf jen pro konkrétního žáka
  const chartEl = $("histChart");
  if (mine.length >= 2) chartEl.innerHTML = chartSVG(mine);
  else if (mine.length === 1) chartEl.innerHTML = chartSVG(mine) + '<p class="diag-note">První test – vývoj bude vidět od druhého testu.</p>';
  else chartEl.innerHTML = "";

  // seznam: žákovy testy, jinak všechny testy předmětu (nejnovější nahoře)
  const rows = (name ? mine : subjEntries).slice().reverse();
  const listEl = $("historyList");
  if (!rows.length) {
    listEl.innerHTML = '<span class="diag-note">Zatím žádné uložené testy.</span>';
    return;
  }
  listEl.innerHTML = "";
  rows.forEach((it) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML =
      '<span class="h-date">' + escapeHtml(fmtDateCz(it.date)) + "</span>" +
      '<span class="h-name">' + escapeHtml(it.name) + '</span>' +
      '<span class="diag-note">' + escapeHtml(it.grade) + "</span>" +
      '<span class="h-pct"><b>' + overallPct(it.subject, it.scores) + " %</b></span>";
    const show = document.createElement("button");
    show.textContent = "Zobrazit";
    show.onclick = () => renderResult(it);
    const del = document.createElement("button");
    del.textContent = "Smazat";
    del.onclick = async () => {
      if (!confirm("Smazat test " + it.name + " z " + fmtDateCz(it.date) + "?")) return;
      try {
        await Store.remove(it.id);
        await refreshHistory();
      } catch (e) { alert("Smazání se nepovedlo: " + (e.message || e)); }
    };
    row.appendChild(show);
    row.appendChild(del);
    listEl.appendChild(row);
  });
}

async function refreshHistory() {
  try { allEntries = await Store.list(); }
  catch (e) { console.error(e); allEntries = []; }
  // našeptávač jmen ze všech uložených testů
  const names = [...new Set(allEntries.map((e) => e.name))].sort();
  $("studentsDatalist").innerHTML = names.map((n) => '<option value="' + escapeHtml(n) + '">').join("");
  renderHistory();
}

// ---------- Záložky a formulář ----------
function renderTabs() {
  const el = $("subjectTabs");
  el.innerHTML = "";
  Object.keys(SUBJECTS).forEach((key) => {
    const b = document.createElement("button");
    b.textContent = SUBJECTS[key].icon + " " + SUBJECTS[key].label;
    b.className = key === activeSubject ? "active" : "";
    b.onclick = () => {
      activeSubject = key;
      renderTabs();
      renderScoreRows();
      renderHistory();
      $("resultCard").classList.add("hidden");
    };
    el.appendChild(b);
  });
}

function renderScoreRows() {
  const S = SUBJECTS[activeSubject];
  $("scoreTitle").textContent = "Body z testu – " + S.label;
  $("scoreRows").innerHTML = S.areas.map((a) =>
    '<div class="score-row"><label for="s_' + a.key + '">' + escapeHtml(a.name) + "</label>" +
    '<input type="number" id="s_' + a.key + '" min="0" max="' + a.max + '" placeholder="0" />' +
    '<span class="max">z ' + a.max + " b.</span></div>"
  ).join("");
}

function readForm() {
  const name = $("dName").value.trim();
  if (!name) return { error: "Vyplňte jméno žáka." };
  const scores = {};
  for (const a of SUBJECTS[activeSubject].areas) {
    const el = $("s_" + a.key);
    const v = Number(el.value);
    if (el.value === "" || isNaN(v) || v < 0 || v > a.max) {
      return { error: "Oblast „" + a.name + "“: zadejte 0–" + a.max + " bodů." };
    }
    scores[a.key] = v;
  }
  return {
    entry: {
      subject: activeSubject,
      name,
      grade: $("dGrade").value,
      date: $("dDate").value || new Date().toISOString().slice(0, 10),
      note: $("dNote").value.trim(),
      scores,
    },
  };
}

// ---------- Inicializace ----------
window.addEventListener("DOMContentLoaded", async () => {
  $("dDate").value = new Date().toISOString().slice(0, 10);
  renderTabs();
  renderScoreRows();

  await Store.init();
  const badge = $("storeBadge");
  if (Store.db) {
    badge.textContent = "Ukládání: databáze (přihlášený uživatel)";
    badge.classList.add("db");
  } else {
    badge.textContent = supa
      ? "Ukládání: jen tento prohlížeč – přihlaste se přes rozvrh, ať se testy ukládají do databáze"
      : "Ukládání: jen tento prohlížeč (ukázkový režim)";
  }

  $("evalBtn").onclick = () => {
    const r = readForm();
    $("dError").textContent = r.error || "";
    if (r.error) return;
    renderResult(r.entry);
  };
  $("printBtn").onclick = () => window.print();
  $("saveBtn").onclick = async () => {
    if (!lastResult) return;
    const btn = $("saveBtn");
    btn.disabled = true;
    try {
      await Store.save(lastResult.entry, lastResult.ev, lastResult.plan);
      $("saveInfo").textContent = "Uloženo ✓";
      await refreshHistory();
    } catch (e) {
      $("saveInfo").textContent = "";
      alert("Uložení se nepovedlo: " + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  };
  $("dName").addEventListener("input", renderHistory);

  await refreshHistory();
});
