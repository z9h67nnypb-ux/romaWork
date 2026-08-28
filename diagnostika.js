// ---------------------------------------------------------------------------
// Diagnostika – karta žáka místo formuláře.
//
// Průchod appkou:
//   1) vyhledám žáka v seznamu (data z kartotéky, tabulka `students`),
//   2) otevřu jeho kartu: škola, třída, historie testů, sloupcový graf,
//      vývoj v čase a doporučená příprava,
//   3) administrátor může zadat nový test nebo založit nového žáka,
//   4) tlačítko „Zpráva pro rodiče" vytiskne A4 souhrn (v dialogu tisku
//      stačí zvolit „Uložit jako PDF").
//
// Práva: role se čte z tabulky `profiles` (admin / auditor / lektor).
// Testy zadává administrátor i auditor, lektor smí jen číst a tisknout;
// zápis navíc hlídá RLS v databázi (viz schema.sql).
//
// Vyhodnocení je ALGORITMICKÉ (pevná pravidla), ne AI – funguje hned, zdarma
// a pro stejné body dá vždy stejný výsledek.
// ---------------------------------------------------------------------------

// ===========================================================================
// KATEGORIE TESTŮ – UPRAV ZDE.
// Každá oblast: key (ukládá se do databáze – po nasazení už neměnit),
// name (zobrazený text), max (maximum bodů) a focus (na co se zaměřit –
// poddovednosti z hodnotícího archu; propíšou se do plánu přípravy).
//
// ČEŠTINA odpovídá dvojici papírů „Diagnostický test český jazyk – verze 01"
// (ČJ_9_01) a „Hodnoticí arch k diagnostickému testu ČJ"
// (PoraDys – Vzdělávací centrum Kladno). Kategorie, maxima i seznamy
// „na co se zaměřit" jsou opsané z archu, součet dává 45 bodů jako test.
//
// Pořadí oblastí = pořadí políček ve formuláři a je schválně stejné jako
// na papíře, takže se výsledky opisují shora dolů bez přeskakování.
// ===========================================================================
const SUBJECTS = {
  cestina: {
    label: "Čeština",
    icon: "📖",
    grade: "8.–9. třída – příprava na přijímačky",
    areas: [
      { key: "pravopis", name: "Pravopisné jevy", short: "Pravopis", max: 10, focus: [
        "psaní i/y",
        "předpony s / z",
        "psaní velkých písmen",
        "skupiny bě/bje, vě/vje, mě/mně",
      ] },
      { key: "tvaroslovi", name: "Tvarosloví", short: "Tvarosloví", max: 10, focus: [
        "tvary přídavných jmen",
        "určování slovních druhů",
        "mluvnické kategorie podstatných jmen",
        "mluvnické kategorie sloves",
        "stavba slova",
      ] },
      { key: "vetnastavba", name: "Větná stavba", short: "Větná stavba", max: 10, focus: [
        "rozlišování věty jednoduché a souvětí",
        "větné členy",
        "druhy vět vedlejších",
        "významové poměry mezi větami",
        "interpunkce",
      ] },
      { key: "slovnizasoba", name: "Slovní zásoba", short: "Slovní zásoba", max: 5, focus: [
        "význam slov v kontextu",
        "spisovná × nespisovná čeština",
        "citové zabarvení slov",
      ] },
      // Klíč zůstává "cteni" z dřívějška – ukládá se do databáze, takže se
      // měnit nesmí, jinak by se dřív uložené testy přestaly párovat.
      // Zobrazený název i bodování se řídí hodnoticím archem.
      { key: "cteni", name: "Porozumění textu", short: "Porozumění", max: 5, focus: [
        "porozumění smyslu textu",
        "vyhledávání a ověřování informací",
        "porozumění souvislostem v textu",
      ] },
      { key: "stylistika", name: "Stylistika", short: "Stylistika", max: 5, focus: [
        "rozlišení druhů textů",
        "obrazná pojmenování",
        "základní literární pojmy",
      ] },
    ],
  },
  // MATEMATIKA odpovídá papírům „Diagnostický test matematika – verze 01"
  // (DgTest 01) a „Hodnotící arch pro lektora" k němu. Test má 15 otevřených
  // úloh a 60 bodů, arch je rozděluje do šesti oddílů – oblasti níž jsou ty
  // oddíly, včetně maxim (8 + 18 + 6 + 10 + 14 + 4 = 60) a formulací
  // „je schopen / je schopen s chybami / není schopen".
  //
  // `tasks` říká, které úlohy z archu do oddílu patří – ukazuje se u políčka
  // ve formuláři, aby lektor body opsal ze správného rámečku.
  matematika: {
    label: "Matematika",
    icon: "🧮",
    grade: "8.–9. třída – příprava na přijímačky",
    areas: [
      { key: "cisla", name: "Číselné operace", short: "Číselné operace", max: 8, tasks: "úlohy 1.1, 1.2, 2",
        can: "provádět základní početní operace napříč číselnými obory", focus: [
        "pořadí početních operací a závorky",
        "druhá mocnina a druhá odmocnina",
        "počítání s desetinnými čísly",
        "dělení a násobení zpaměti i písemně",
      ] },
      { key: "zlomky", name: "Zlomky, poměry, procenta, převody jednotek", short: "Zlomky a procenta", max: 18, tasks: "úlohy 3, 4, 5, 6",
        can: "počítat se zlomky, desetinnými čísly a převádět jednotky", focus: [
        "sčítání a odčítání zlomků s různým jmenovatelem",
        "násobení a dělení zlomků, základní tvar",
        "výpočet procentové části a postupné slevy",
        "dělení celku v daném poměru",
        "porovnání dvou částí v procentech",
        "převody jednotek hmotnosti, objemu a obsahu",
      ] },
      { key: "rovnice", name: "Algebraické výrazy a rovnice", short: "Výrazy a rovnice", max: 6, tasks: "úloha 7 (7.1, 7.2)",
        can: "pracovat s neznámou a užívat jednoduché vzorce pro algebraické úpravy", focus: [
        "roznásobení závorky a sloučení členů",
        "úprava lineární rovnice o jedné neznámé",
        "rovnice se zlomky a desetinnými čísly",
        "zkouška správnosti výsledku",
      ] },
      { key: "geometrie", name: "Geometrie v rovině a v prostoru", short: "Geometrie", max: 10, tasks: "úlohy 8, 9, 10",
        can: "užívat vzorce pro výpočetní geometrii v rovině i v prostoru, najít souvislosti v rovinných útvarech a využít znalostí rovinné geometrie při rýsování", focus: [
        "obsah a obvod obdélníku, čtverce a trojúhelníku",
        "kruh a kružnice – obsah, poloměr, průměr",
        "objem a povrch rotačního válce",
        "konstrukce trojúhelníku a zápis všech řešení",
        "rovnoramenný trojúhelník, osa úsečky, rovnoběžky",
      ] },
      { key: "slovni", name: "Slovní úlohy", short: "Slovní úlohy", max: 14, tasks: "úlohy 11, 12, 13, 14",
        can: "porozumět textu slovní úlohy, vyčíst z něj čísla a vztahy nutné pro výpočet a sestavit rovnici", focus: [
        "zápis úlohy – co vím a co hledám",
        "sestavení rovnice o jedné neznámé",
        "přímá a nepřímá úměrnost, trojčlenka",
        "úlohy o pohybu (rychlost, čas, dráha)",
        "výpočet původní ceny před slevou",
      ] },
      { key: "data", name: "Práce s daty a logické úlohy", short: "Práce s daty", max: 4, tasks: "úloha 15",
        can: "pracovat s daty zadanými ve formě tabulky", focus: [
        "čtení údajů z tabulky četností",
        "výpočet průměru z tabulky",
        "zaokrouhlování na daný počet desetinných míst",
      ] },
    ],
  },
};

// Hranice pásem podle hodnotících archů (tři stupně zvládnutí oblasti).
const MID_LIMIT = 0.45;    // pod 45 % = nejnižší stupeň
const STRONG_LIMIT = 0.75; // od 75 % = nejvyšší stupeň; mezi tím = prostřední
const BAND = {
  strong: { cls: "strong", color: "#2e7d32" },
  mid:    { cls: "mid", color: "#ef6c00" },
  weak:   { cls: "weak", color: "#c62828" },
};

// Slovní stupnice je u každého předmětu jiná – opsaná z jeho hodnotícího
// archu. Čeština: „zvládá / částečně zvládá / nezvládá".
// Matematika: „je schopen / je schopen s chybami / není schopen".
const BAND_WORDS = {
  cestina:    { strong: "zvládá",     mid: "částečně zvládá",      weak: "nezvládá" },
  matematika: { strong: "je schopen", mid: "je schopen s chybami", weak: "není schopen" },
};
function bandLabel(subjKey, band) {
  return (BAND_WORDS[subjKey] || BAND_WORDS.cestina)[band];
}

// Celkové hodnocení podle hodnotícího archu (4 stupně).
function overallAssessment(pct) {
  if (pct >= 85) return "Výborné zvládnutí učiva";
  if (pct >= 70) return "Velmi dobré zvládnutí učiva";
  if (pct >= 50) return "Dostačující zvládnutí učiva";
  return "Učivo vyžaduje systematické doplnění";
}

const ORG_NAME = "PoraDys – Vzdělávací centrum Kladno";
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDateCz(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return d + ". " + m + ". " + y;
}
function today() { return new Date().toISOString().slice(0, 10); }
// Česká shoda po číslovce: 1 test / 2–4 testy / 5+ testů
function testWord(n) { return n === 1 ? "test" : n >= 2 && n <= 4 ? "testy" : "testů"; }

// ---------------------------------------------------------------------------
// Úložiště: Supabase (tabulky students a diagnostics)
// ---------------------------------------------------------------------------
const CFG = window.APP_CONFIG || {};
const DbStore = {
  client: null,
  _c() {
    if (!this.client) this.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    return this.client;
  },
  // Vrátí { name, role } přihlášeného, nebo null když nikdo přihlášený není.
  async me() {
    const c = this._c();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    const user = data.session.user;
    const { data: p } = await c.from("profiles").select("*").eq("id", user.id).maybeSingle();
    // Účet, kterému administrátor odebral přístup (profiles.active = false),
    // se sem nesmí dostat ani se starou session z prohlížeče.
    if (p && p.active === false) { try { await c.auth.signOut(); } catch (e) { console.error(e); } return null; }
    return { name: (p && p.name) || user.email, role: (p && p.role) || "lektor" };
  },
  async listStudents() {
    const { data, error } = await this._c().from("students")
      .select("id, name, school, grade, category, subjects, lector_name, phone, status")
      .order("name");
    if (error) throw error;
    return data;
  },
  async listTests() {
    const { data, error } = await this._c().from("diagnostics")
      .select("id, student_id, student_name, subject, grade, taken_at, note, scores")
      .not("student_id", "is", null)
      .order("taken_at", { ascending: true });
    if (error) throw error;
    return data.map(fromDbRow);
  },
  async addStudent(fields) {
    const { data, error } = await this._c().from("students").insert(fields).select("*").single();
    if (error) throw error;
    return data;
  },
  async addTest(entry, ev, plan) {
    const { data, error } = await this._c().from("diagnostics").insert({
      student_id: entry.student_id,
      student_name: entry.student_name,
      subject: entry.subject,
      grade: entry.grade || null,
      taken_at: entry.date,
      note: entry.note || null,
      scores: entry.scores,
      strengths: ev.strengths.map((r) => r.name),
      weaknesses: ev.weaknesses.map((r) => r.name),
      plan: plan.weeks.map((w) => w.n + ". týden: " + w.focus.name + " – " + w.exercises).join("\n"),
    }).select("id, student_id, student_name, subject, grade, taken_at, note, scores").single();
    if (error) throw error;
    return fromDbRow(data);
  },
  async removeTest(id) {
    const { error } = await this._c().from("diagnostics").delete().eq("id", id);
    if (error) throw error;
  },
};

// Škola se do testu neukládá – bere se vždy z aktuální karty žáka
// (tabulka `students`), aby se údaje nerozcházely.
function fromDbRow(r) {
  return {
    id: r.id, student_id: r.student_id, student_name: r.student_name,
    subject: r.subject || "matematika", grade: r.grade || "",
    date: r.taken_at, note: r.note || "", scores: r.scores || {},
  };
}

const Store = DbStore;

// ---------------------------------------------------------------------------
// Vyhodnocení
// ---------------------------------------------------------------------------
// Oblasti, které daný test opravdu obsahuje. Když se do předmětu přidá nová
// kategorie (např. Porozumění textu), starší testy ji ve `scores` nemají – ty
// se pak vyhodnocují jen z oblastí, které v nich jsou, aby jim nová oblast
// nepřipadla jako 0 bodů a neshodila celkové procento.
function areasOf(subjKey, scores) {
  const all = SUBJECTS[subjKey].areas;
  const present = all.filter((a) => scores && scores[a.key] != null);
  return present.length ? present : all;
}

function evaluate(subjKey, scores) {
  const results = areasOf(subjKey, scores).map((a) => {
    const points = Number(scores[a.key]) || 0;
    const pct = points / a.max;
    const band = pct < MID_LIMIT ? "weak" : pct >= STRONG_LIMIT ? "strong" : "mid";
    return { ...a, points, pct, band };
  });
  const byPct = (x, y) => x.pct - y.pct;
  return {
    subject: subjKey,
    results,
    weaknesses: results.filter((r) => r.band === "weak").sort(byPct),
    mids: results.filter((r) => r.band === "mid").sort(byPct),
    strengths: results.filter((r) => r.band === "strong").sort((x, y) => y.pct - x.pct),
  };
}

function totals(subjKey, scores) {
  const areas = areasOf(subjKey, scores);
  const pts = areas.reduce((s, a) => s + (Number(scores[a.key]) || 0), 0);
  const max = areas.reduce((s, a) => s + a.max, 0);
  return { pts, max, pct: max ? Math.round((pts / max) * 100) : 0 };
}
function overallPct(subjKey, scores) { return totals(subjKey, scores).pct; }

// Vybere z oblasti pár konkrétních poddovedností „na co se zaměřit".
// Prostřídá je podle pořadí týdne, ať se v plánu neopakuje pořád totéž.
function focusPicks(area, week) {
  const f = area.focus || [];
  if (!f.length) return "procvičování dané oblasti";
  if (f.length <= 2) return f.join(", ");
  return f[week % f.length] + ", " + f[(week + 1) % f.length];
}

function buildPlan(ev) {
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

function summaryText(test, ev, plan) {
  const t = totals(test.subject, test.scores);
  const S = SUBJECTS[test.subject];
  let s = "<b>" + escapeHtml(test.student_name) + "</b> – " + S.label +
    ", celkem <b>" + t.pts + " / " + t.max + " b. (" + t.pct + " %)</b>. " +
    "Celkové hodnocení: <b>" + overallAssessment(t.pct) + "</b>. ";
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

// ---------------------------------------------------------------------------
// Grafy (SVG, bez knihoven)
// ---------------------------------------------------------------------------

// Úspěšnost v jednotlivých oblastech = vodorovné barevné pruhy zleva doprava.
// Dělá se HTML (ne SVG), aby se text škáloval stejně jako zbytek stránky.
// Pruh nese i body a úroveň zvládnutí, takže samostatná tabulka není potřeba.
function areaBarsHtml(ev) {
  return '<div class="bars">' + ev.results.map((r) => {
    const lvl = bandLabel(ev.subject, r.band);
    const pct = Math.round(r.pct * 100);
    return '<div class="bar-row">' +
      '<span class="bar-name">' + escapeHtml(r.name) + "</span>" +
      '<span class="bar-track" title="' + pct + ' %"><span class="bar-fill ' + r.band + '" style="width:' + pct + '%"></span></span>' +
      '<span class="bar-val">' + r.points + "/" + r.max + " b. · " + pct + " %</span>" +
      '<span class="lvl ' + BAND[r.band].cls + '">' + escapeHtml(lvl) + "</span>" +
      "</div>";
  }).join("") + "</div>";
}

// Vývoj celkové úspěšnosti žáka v čase = svislý sloupcový graf,
// jeden sloupec = jeden test. Barva sloupce podle dosaženého pásma.
function trendChartSVG(tests) {
  const n = tests.length;
  const W = 460, H = 190, L = 26, R = 8, T = 18, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const step = iw / n;
  const bw = Math.min(52, step * 0.62);
  const y = (p) => T + ih - (p / 100) * ih;

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" role="img" ' +
    'aria-label="Vývoj celkové úspěšnosti žáka v jednotlivých testech">';
  [0, 25, 50, 75, 100].forEach((g) => {
    s += '<line x1="' + L + '" y1="' + y(g) + '" x2="' + (W - R) + '" y2="' + y(g) + '" stroke="#e8e8e8"/>' +
      '<text x="' + (L - 5) + '" y="' + (y(g) + 3) + '" text-anchor="end" font-size="8.5" fill="#999">' + g + "</text>";
  });
  // hranice pásem (45 % / 75 %) jako u pruhů oblastí
  [[MID_LIMIT * 100, "#c62828"], [STRONG_LIMIT * 100, "#2e7d32"]].forEach(([p, col]) => {
    s += '<line x1="' + L + '" y1="' + y(p) + '" x2="' + (W - R) + '" y2="' + y(p) +
      '" stroke="' + col + '" stroke-width="1" stroke-dasharray="3 3" opacity=".45"/>';
  });

  tests.forEach((t, i) => {
    const pct = overallPct(t.subject, t.scores);
    const band = pct < MID_LIMIT * 100 ? "weak" : pct >= STRONG_LIMIT * 100 ? "strong" : "mid";
    const cx = L + step * i + step / 2;
    const h = Math.max(1, (pct / 100) * ih);
    s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (T + ih - h).toFixed(1) + '" width="' + bw.toFixed(1) +
      '" height="' + h.toFixed(1) + '" rx="2.5" fill="' + BAND[band].color + '" opacity=".9">' +
      "<title>" + fmtDateCz(t.date) + " – " + pct + " % (" + escapeHtml(bandLabel(t.subject, band)) + ")</title></rect>";
    s += '<text x="' + cx.toFixed(1) + '" y="' + (T + ih - h - 5).toFixed(1) +
      '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#333">' + pct + " %</text>";
    const [, mm, dd] = String(t.date).slice(0, 10).split("-").map(Number);
    s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="9" fill="#888">' + dd + ". " + mm + ".</text>";
  });
  s += "</svg>";
  return s;
}

// ---------------------------------------------------------------------------
// Stav appky
// ---------------------------------------------------------------------------
const state = {
  role: "lektor",
  userName: "",
  students: [],
  tests: [],
  openStudent: null,
  subject: "cestina",
  shownTestId: null,
  draft: null, // { test, ev, plan } – vyhodnocený, zatím neuložený test
};

// Testy zadává administrátor i auditor; lektor je jen čte a tiskne.
// Diagnostika není kartotéka, takže tady mezi těmi dvěma rozdíl není.
function isStaff() { return state.role === "admin" || state.role === "auditor"; }
function testsOf(studentId) { return state.tests.filter((t) => t.student_id === studentId); }
function subjectTests(studentId, subj) {
  return testsOf(studentId).filter((t) => t.subject === subj).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ---------------------------------------------------------------------------
// Seznam žáků
// ---------------------------------------------------------------------------
function visibleStudents() {
  const q = $("dSearch").value.trim().toLowerCase();
  const former = $("dShowFormer").checked;
  const onlyTested = $("dOnlyTested").checked;
  return state.students
    .filter((s) => former || s.status !== "former")
    .filter((s) => !onlyTested || testsOf(s.id).length)
    .filter((s) => !q || [s.name, s.school, s.grade, s.category, s.subjects]
      .some((v) => String(v || "").toLowerCase().includes(q)));
}

function renderList() {
  const vis = visibleStudents();
  const withTests = vis.filter((s) => testsOf(s.id).length).length;
  $("listSummary").innerHTML = "<b>" + vis.length + "</b> žáků · " + withTests + " s diagnostickým testem";

  const tb = $("listBody");
  tb.innerHTML = "";
  if (!vis.length) {
    tb.innerHTML = '<tr><td colspan="6" style="color:#999;padding:18px;">Žádný žák neodpovídá hledání.</td></tr>';
    return;
  }
  vis.forEach((s) => {
    const mine = testsOf(s.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = mine[mine.length - 1];
    const tr = document.createElement("tr");
    if (s.status === "former") tr.className = "former";
    tr.innerHTML =
      "<td><b>" + escapeHtml(s.name) + "</b></td>" +
      "<td>" + escapeHtml(s.school || "—") + "</td>" +
      "<td>" + escapeHtml(s.grade || "—") + "</td>" +
      "<td>" + escapeHtml(s.subjects || "—") + "</td>" +
      '<td class="num">' + (mine.length || "") + "</td>" +
      "<td>" + (last
        ? escapeHtml(SUBJECTS[last.subject] ? SUBJECTS[last.subject].label : last.subject) + " · " +
          fmtDateCz(last.date) + " · <b>" + overallPct(last.subject, last.scores) + " %</b>"
        : '<span style="color:#bbb">zatím žádný</span>') + "</td>";
    tr.onclick = () => openStudent(s.id);
    tb.appendChild(tr);
  });
}

function showList() {
  state.openStudent = null;
  state.draft = null;
  $("cardView").classList.add("hidden");
  $("batchView").classList.add("hidden");
  $("listView").classList.remove("hidden");
  renderList();
}

// ---------------------------------------------------------------------------
// Karta žáka
// ---------------------------------------------------------------------------
function openStudent(id) {
  const s = state.students.find((x) => x.id === id);
  if (!s) return;
  state.openStudent = s;
  state.draft = null;
  // otevřeme předmět, ve kterém má žák poslední test (jinak češtinu)
  const mine = testsOf(id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.subject = mine.length ? mine[mine.length - 1].subject : "cestina";
  const inSubj = subjectTests(id, state.subject);
  state.shownTestId = inSubj.length ? inSubj[inSubj.length - 1].id : null;

  $("listView").classList.add("hidden");
  $("batchView").classList.add("hidden");
  $("cardView").classList.remove("hidden");
  $("newTestCard").classList.add("hidden");
  renderCard();
  window.scrollTo({ top: 0 });
}

function metaItem(k, v) {
  return '<div><span class="k">' + k + ":</span><span class=\"v\">" + escapeHtml(v || "—") + "</span></div>";
}

function renderCard() {
  const s = state.openStudent;
  const mine = testsOf(s.id);

  $("studentHead").innerHTML =
    '<div class="stud-head">' +
      "<div>" +
        "<h2>" + escapeHtml(s.name) + (s.status === "former" ? ' <span class="diag-note">(bývalý žák)</span>' : "") + "</h2>" +
        '<div class="stud-meta">' +
          metaItem("Škola", s.school) +
          metaItem("Třída / ročník", s.grade) +
          metaItem("Kategorie", s.category) +
          metaItem("Předměty", s.subjects) +
          metaItem("Lektor/ka", s.lector_name) +
          metaItem("Telefon", s.phone) +
        "</div>" +
        '<p class="diag-note" style="margin:8px 0 0;">Škola a třída se berou z kartotéky – tam je také upravíte.</p>' +
      "</div>" +
      '<div class="stud-actions">' +
        (isStaff() ? '<button id="newTestBtn" class="btn primary">+ Nový test</button>' : "") +
        '<button id="printBtn" class="btn"' + (mine.length ? "" : " disabled") + ">🖨 Zpráva pro rodiče (PDF)</button>" +
      "</div>" +
    "</div>";

  const nb = $("newTestBtn");
  if (nb) nb.onclick = () => openNewTestForm();
  $("printBtn").onclick = printReport;

  // Záložky předmětů
  const tabs = $("subjectTabs");
  tabs.innerHTML = "";
  Object.keys(SUBJECTS).forEach((key) => {
    const cnt = subjectTests(s.id, key).length;
    const b = document.createElement("button");
    b.innerHTML = SUBJECTS[key].icon + " " + SUBJECTS[key].label +
      (cnt ? ' <span class="cnt">(' + cnt + ")</span>" : "");
    b.className = key === state.subject ? "active" : "";
    b.onclick = () => {
      state.subject = key;
      state.draft = null;
      const list = subjectTests(s.id, key);
      state.shownTestId = list.length ? list[list.length - 1].id : null;
      $("newTestCard").classList.add("hidden");
      renderCard();
    };
    tabs.appendChild(b);
  });

  renderTestStrip();
  renderTestDetail();
}

function renderTestStrip() {
  const s = state.openStudent;
  const list = subjectTests(s.id, state.subject).slice().reverse(); // nejnovější vlevo
  const el = $("testStrip");
  const S = SUBJECTS[state.subject];

  if (!list.length) {
    el.innerHTML = '<div class="diag-note">Z předmětu <b>' + S.label + "</b> zatím žádný test. " +
      (isStaff() ? "Zadejte první tlačítkem <b>+ Nový test</b>." : "Výsledky zadává administrátor.") + "</div>";
    return;
  }

  let html = '<div class="test-strip"><span class="diag-note" style="margin-right:4px;">Testy (' + S.label + "):</span>";
  list.forEach((t) => {
    const pct = overallPct(t.subject, t.scores);
    html += '<button class="test-chip' + (t.id === state.shownTestId ? " active" : "") + '" data-test="' + escapeHtml(t.id) + '">' +
      fmtDateCz(t.date) + ' <span class="pct">' + pct + " %</span></button>";
  });
  if (isStaff() && state.shownTestId) {
    html += '<button id="delTestBtn" class="btn" style="margin-left:auto;">Smazat zobrazený test</button>';
  }
  html += "</div>";
  el.innerHTML = html;

  el.querySelectorAll("[data-test]").forEach((b) => {
    b.onclick = () => { state.shownTestId = b.dataset.test; state.draft = null; renderTestStrip(); renderTestDetail(); };
  });
  const del = $("delTestBtn");
  if (del) del.onclick = async () => {
    const t = state.tests.find((x) => x.id === state.shownTestId);
    if (!t || !confirm("Smazat test z " + fmtDateCz(t.date) + "?")) return;
    try {
      await Store.removeTest(t.id);
      state.tests = state.tests.filter((x) => x.id !== t.id);
      const list2 = subjectTests(state.openStudent.id, state.subject);
      state.shownTestId = list2.length ? list2[list2.length - 1].id : null;
      renderCard();
    } catch (e) { alert("Smazání se nepovedlo: " + (e.message || e)); }
  };
}

// Blok s výsledkem jednoho testu – používá ho karta i tisková zpráva.
function resultHtml(test, ev, plan, opts) {
  const o = opts || {};
  const S = SUBJECTS[test.subject];
  const trend = o.trend || [];

  let html = '<div class="plan-summary avoid-break">' + summaryText(test, ev, plan) +
    (test.note ? '<br><span style="color:#666">Poznámka: ' + escapeHtml(test.note) + "</span>" : "") + "</div>";

  // Oblasti (vodorovné pruhy) vlevo, vývoj v čase (sloupce) vpravo.
  const barsBlock = '<div class="avoid-break"><h3>Úspěšnost podle oblastí</h3>' +
    areaBarsHtml(ev) +
    '<p class="chart-cap">Zelená = ' + escapeHtml(bandLabel(test.subject, "strong")) + ' (od 75 %), oranžová = ' +
    escapeHtml(bandLabel(test.subject, "mid")) + ', červená = ' + escapeHtml(bandLabel(test.subject, "weak")) + ' (pod 45 %).</p></div>';
  const trendBlock = trend.length >= 2
    ? '<div class="avoid-break"><h3>Vývoj v čase – ' + S.label + "</h3>" +
      '<div class="chart-box">' + trendChartSVG(trend) + "</div>" +
      '<p class="chart-cap">Celková úspěšnost v jednotlivých testech (' + trend.length + " " + testWord(trend.length) + ").</p></div>"
    : "";
  html += trendBlock
    ? '<div class="res-grid">' + barsBlock + trendBlock + "</div>"
    : barsBlock;

  const toWork = ev.weaknesses.concat(ev.mids);
  html += '<div class="avoid-break focus-wrap"><h3>Na co se zaměřit</h3>' +
    (toWork.length
      ? '<div class="focus-cols">' + toWork.map((r) => '<div class="focus-block"><h4>' + escapeHtml(r.name) +
          ' <span class="lvl ' + BAND[r.band].cls + '">' + escapeHtml(bandLabel(test.subject, r.band)) + "</span></h4>" +
          // Věta z hodnotícího archu: „Žák <je schopen s chybami> <co>."
          (r.can ? '<p class="focus-can">Žák ' + escapeHtml(bandLabel(test.subject, r.band)) + " " + escapeHtml(r.can) + ".</p>" : "") +
          "<ul>" +
          (r.focus || []).map((f) => "<li>" + escapeHtml(f) + "</li>").join("") + "</ul></div>").join("") + "</div>"
      : '<span class="diag-note">Všechny oblasti žák zvládá – žádné cílené doplnění není potřeba. 🎉</span>') +
    "</div>";

  html += '<div class="avoid-break"><h3>Doporučená příprava na 8 týdnů</h3>' +
    '<table class="plan-table"><tr><th>Týden</th><th>Hlavní zaměření</th><th>Co procvičovat na lekcích</th></tr>' +
    plan.weeks.map((w) =>
      "<tr><td>" + w.n + ".</td><td><b>" + escapeHtml(w.focus.name) + "</b> " +
      '<span class="lvl ' + BAND[w.focus.band].cls + '">' + escapeHtml(bandLabel(test.subject, w.focus.band)) + "</span></td><td>" +
      escapeHtml(w.exercises) + (w.review ? "<br><b>Kontrolní opakování a mini-test pokroku.</b>" : "") +
      "</td></tr>"
    ).join("") + "</table>" +
    '<p class="diag-note" style="margin-top:8px;">Doporučená frekvence: <b>' + plan.perWeek +
    "× týdně</b>. Po 8 týdnech test zopakujte a plán aktualizujte.</p></div>";

  return html;
}

function renderTestDetail() {
  const el = $("testDetail");
  const test = state.tests.find((x) => x.id === state.shownTestId);
  if (!test) { el.innerHTML = ""; return; }

  const ev = evaluate(test.subject, test.scores);
  const plan = buildPlan(ev);
  const S = SUBJECTS[test.subject];
  el.innerHTML = '<div class="diag-card">' +
    "<h2>" + S.icon + " " + S.label + " – test z " + fmtDateCz(test.date) + "</h2>" +
    resultHtml(test, ev, plan, { trend: subjectTests(state.openStudent.id, test.subject) }) +
    "</div>";
}

// ---------------------------------------------------------------------------
// Nový test (jen administrátor)
// ---------------------------------------------------------------------------
function openNewTestForm() {
  const s = state.openStudent;
  const S = SUBJECTS[state.subject];
  state.draft = null;

  const half = Math.ceil(S.areas.length / 2);
  const rowsHtml = (arr) => arr.map((a) =>
    '<div class="score-row"><label for="s_' + a.key + '">' + escapeHtml(a.name) +
    (a.tasks ? '<span class="score-tasks">' + escapeHtml(a.tasks) + "</span>" : "") + "</label>" +
    '<input type="number" id="s_' + a.key + '" min="0" max="' + a.max + '" step="1" />' +
    '<span class="max">z ' + a.max + " b.</span></div>").join("");

  $("newTestCard").innerHTML =
    "<h2>Nový test – " + S.icon + " " + S.label + "</h2>" +
    (S.note ? '<p class="diag-note" style="margin:-6px 0 10px;">' + escapeHtml(S.note) + "</p>" : "") +
    '<div class="form-head">' +
      '<div class="field"><label>Žák</label><input type="text" value="' + escapeHtml(s.name) + '" disabled style="width:200px;background:#f5f5f5;"></div>' +
      '<div class="field"><label>Škola / třída</label><input type="text" value="' + escapeHtml([s.school, s.grade].filter(Boolean).join(" · ") || "—") + '" disabled style="width:260px;background:#f5f5f5;"></div>' +
      '<div class="field"><label>Datum testu</label><input type="date" id="fDate" value="' + today() + '"></div>' +
      '<div class="field"><label>Poznámka (nepovinné)</label><input type="text" id="fNote" placeholder="Např. vstupní test, doporučení PPP…"></div>' +
    "</div>" +
    '<div class="score-grid"><div>' + rowsHtml(S.areas.slice(0, half)) + "</div><div>" + rowsHtml(S.areas.slice(half)) + "</div></div>" +
    '<div class="diag-actions">' +
      '<button id="evalBtn" class="btn primary">Vyhodnotit</button>' +
      '<button id="cancelTestBtn" class="btn">Zrušit</button>' +
      '<span id="fError" class="diag-error"></span><span id="fOk" class="diag-ok"></span>' +
    "</div>" +
    '<div id="draftResult"></div>';

  $("newTestCard").classList.remove("hidden");
  $("testDetail").innerHTML = "";
  $("evalBtn").onclick = evalDraft;
  $("cancelTestBtn").onclick = () => {
    state.draft = null;
    $("newTestCard").classList.add("hidden");
    renderTestDetail();
  };

  // Enter posouvá na další oblast, u poslední rovnou vyhodnotí.
  const inputs = S.areas.map((a) => $("s_" + a.key));
  inputs.forEach((el, i) => {
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (i < inputs.length - 1) inputs[i + 1].focus();
      else evalDraft();
    });
  });

  $("newTestCard").scrollIntoView({ behavior: "smooth", block: "start" });
  inputs[0].focus();
}

function readTestForm() {
  const S = SUBJECTS[state.subject];
  const s = state.openStudent;
  const scores = {};
  for (const a of S.areas) {
    const el = $("s_" + a.key);
    const v = Number(el.value);
    if (el.value === "" || isNaN(v) || v < 0 || v > a.max) {
      return { error: "Oblast „" + a.name + "“: zadejte 0–" + a.max + " bodů." };
    }
    scores[a.key] = v;
  }
  return {
    test: {
      student_id: s.id,
      student_name: s.name,
      subject: state.subject,
      grade: s.grade || "",
      school: s.school || "",
      date: $("fDate").value || today(),
      note: $("fNote").value.trim(),
      scores,
    },
  };
}

function evalDraft() {
  const r = readTestForm();
  $("fError").textContent = r.error || "";
  $("fOk").textContent = "";
  if (r.error) { $("draftResult").innerHTML = ""; state.draft = null; return; }

  const ev = evaluate(r.test.subject, r.test.scores);
  const plan = buildPlan(ev);
  state.draft = { test: r.test, ev, plan };

  const trend = subjectTests(state.openStudent.id, r.test.subject).concat([r.test]);
  $("draftResult").innerHTML =
    '<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px;">' +
    '<h2 style="font-size:15px;">Náhled vyhodnocení – zatím neuloženo</h2>' +
    resultHtml(r.test, ev, plan, { trend }) +
    '<div class="diag-actions"><button id="saveTestBtn" class="btn primary">💾 Uložit k žákovi</button>' +
    '<span class="diag-note">Body můžete nahoře opravit a znovu vyhodnotit.</span></div></div>';

  $("saveTestBtn").onclick = saveDraft;
  $("saveTestBtn").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveDraft() {
  if (!state.draft) return;
  const btn = $("saveTestBtn");
  btn.disabled = true;
  try {
    const saved = await Store.addTest(state.draft.test, state.draft.ev, state.draft.plan);
    state.tests.push(saved);
    state.shownTestId = saved.id;
    state.draft = null;
    $("newTestCard").classList.add("hidden");
    renderCard();
    $("testDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    btn.disabled = false;
    const msg = String(e.message || e);
    $("fError").textContent = /row-level security|permission/i.test(msg)
      ? "Uložení odmítla databáze – zadávat výsledky testů může jen administrátor."
      : "Uložení se nepovedlo: " + msg;
  }
}

// ---------------------------------------------------------------------------
// HROMADNÉ ZADÁVÁNÍ TESTŮ (jen administrátor)
// ---------------------------------------------------------------------------
// Smyčka: žák → body → Enter uloží a rovnou nachystá dalšího žáka.
// Předmět a datum se volí jednou pro celou dávku. Ovládá se jen klávesnicí,
// takže při přepisování stohu papírových testů se vůbec nesahá na myš.
// Bez mezikroku s náhledem – každý uložený test má v logu tlačítko Vrátit,
// takže překlep se opraví jedním klikem.
// ---------------------------------------------------------------------------
const batch = {
  subject: "cestina",
  date: today(),
  student: null,
  matches: [],
  hi: 0,
  saved: [],   // co se uložilo v téhle dávce (pro log a tlačítko Vrátit)
};

function showBatch() {
  batch.date = $("batchDate").value || today();
  $("batchDate").value = batch.date;
  $("listView").classList.add("hidden");
  $("cardView").classList.add("hidden");
  $("batchView").classList.remove("hidden");
  batchRenderTabs();
  batchRenderLog();
  batchReset();
  window.scrollTo({ top: 0 });
}

function batchRenderTabs() {
  const el = $("batchTabs");
  el.innerHTML = "";
  Object.keys(SUBJECTS).forEach((key) => {
    const b = document.createElement("button");
    b.textContent = SUBJECTS[key].icon + " " + SUBJECTS[key].label;
    b.className = key === batch.subject ? "active" : "";
    b.onclick = () => { batch.subject = key; batchRenderTabs(); batchReset(); };
    el.appendChild(b);
  });
}

// Zpátky na začátek smyčky: prázdné vyhledávání, kurzor v něm.
function batchReset() {
  batch.student = null;
  batch.matches = [];
  batch.hi = 0;
  $("batchScoreBox").classList.add("hidden");
  $("batchScoreBox").innerHTML = "";
  $("batchSug").classList.add("hidden");
  $("batchSearch").value = "";
  $("batchSearch").focus();
}

function batchFilter() {
  const q = $("batchSearch").value.trim().toLowerCase();
  batch.matches = !q ? [] : state.students
    .filter((s) => s.status !== "former")
    .filter((s) => [s.name, s.school, s.grade].some((v) => String(v || "").toLowerCase().includes(q)))
    .slice(0, 8);
  batch.hi = 0;
  batchRenderSug();
}

function batchRenderSug() {
  const el = $("batchSug");
  const q = $("batchSearch").value.trim();
  if (!q) { el.classList.add("hidden"); return; }

  el.innerHTML = batch.matches.map((s, i) =>
    '<div class="' + (i === batch.hi ? "hi" : "") + '" data-i="' + i + '">' +
    "<span>" + escapeHtml(s.name) + "</span>" +
    '<span class="sub">' + escapeHtml([s.school, s.grade].filter(Boolean).join(" · ")) + "</span></div>"
  ).join("") +
    '<div class="new' + (batch.hi === batch.matches.length ? " hi" : "") + '" data-i="' + batch.matches.length + '">' +
    "+ Založit žáka „" + escapeHtml(q) + "“</div>";

  el.classList.remove("hidden");
  el.querySelectorAll("[data-i]").forEach((d) => {
    d.onclick = () => { batch.hi = Number(d.dataset.i); batchChoose(); };
  });
}

// Potvrzení zvýrazněné položky: buď existující žák, nebo založení nového.
function batchChoose() {
  if (batch.hi === batch.matches.length) {
    openNewStudent($("batchSearch").value.trim(), (s) => {
      state.students.push(s);
      state.students.sort((a, b) => a.name.localeCompare(b.name, "cs"));
      batchPick(s);
    });
    return;
  }
  const s = batch.matches[batch.hi];
  if (s) batchPick(s);
}

function batchPick(s) {
  batch.student = s;
  $("batchSug").classList.add("hidden");
  $("batchSearch").value = s.name;
  batchRenderScores();
  const first = $("b_" + SUBJECTS[batch.subject].areas[0].key);
  if (first) first.focus();
}

function batchRenderScores() {
  const S = SUBJECTS[batch.subject];
  const s = batch.student;
  const done = subjectTests(s.id, batch.subject).length;

  $("batchScoreBox").innerHTML =
    '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">' +
      '<div class="batch-step">2 · Body – ' + escapeHtml(S.label) + "</div>" +
      '<div class="batch-chosen"><b>' + escapeHtml(s.name) + "</b>" +
        '<span class="sub">' + escapeHtml([s.school, s.grade].filter(Boolean).join(" · ") || "škola/třída nevyplněna") + "</span>" +
        (done ? '<span class="sub">už má ' + done + " " + testWord(done) + " z tohoto předmětu</span>" : "") +
      "</div>" +
      '<div class="batch-scores">' +
        S.areas.map((a) =>
          '<div class="sc"><label for="b_' + a.key + '"' + (a.tasks ? ' title="' + escapeHtml(a.tasks) + '"' : "") + ">" +
          escapeHtml(a.short || a.name) + "</label>" +
          // bez placeholderu "0" – prázdné pole se nesmí plést se zadanou nulou
          '<input type="number" id="b_' + a.key + '" min="0" max="' + a.max + '" step="1" inputmode="numeric">' +
          '<span class="mx">z ' + a.max + " b.</span></div>"
        ).join("") +
        '<div class="batch-total" id="batchTotal"></div>' +
      "</div>" +
      '<div class="diag-actions">' +
        '<button id="batchSaveBtn" class="btn primary">Uložit a další <kbd>Enter</kbd></button>' +
        '<button id="batchSkipBtn" class="btn">Jiný žák <kbd>Esc</kbd></button>' +
        '<span id="batchError" class="diag-error"></span>' +
      "</div>" +
    "</div>";
  $("batchScoreBox").classList.remove("hidden");

  const inputs = S.areas.map((a) => $("b_" + a.key));
  inputs.forEach((el, i) => {
    el.addEventListener("input", () => { el.classList.remove("bad"); batchTotal(); });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (i < inputs.length - 1) inputs[i + 1].focus();
        else batchSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        batchReset();
      }
    });
  });
  $("batchSaveBtn").onclick = batchSave;
  $("batchSkipBtn").onclick = batchReset;
  batchTotal();
}

// Živý součet, ať je hned vidět nesmyslně vysoké/nízké číslo.
function batchTotal() {
  const S = SUBJECTS[batch.subject];
  let pts = 0, filled = 0;
  const max = S.areas.reduce((s, a) => s + a.max, 0);
  S.areas.forEach((a) => {
    const el = $("b_" + a.key);
    if (el && el.value !== "") { pts += Number(el.value) || 0; filled++; }
  });
  const pct = max ? Math.round((pts / max) * 100) : 0;
  $("batchTotal").innerHTML = filled
    ? "celkem <b>" + pts + " / " + max + "</b> b. · <b>" + pct + " %</b>" +
      (filled < S.areas.length ? ' <span class="diag-note">(' + (S.areas.length - filled) + " nevyplněno)</span>" : "")
    : '<span class="diag-note">celkem z ' + max + " b.</span>";
}

async function batchSave() {
  const S = SUBJECTS[batch.subject];
  const s = batch.student;
  if (!s) return;

  const scores = {};
  for (const a of S.areas) {
    const el = $("b_" + a.key);
    const v = Number(el.value);
    if (el.value === "" || isNaN(v) || v < 0 || v > a.max) {
      el.classList.add("bad");
      el.focus();
      $("batchError").textContent = "„" + (a.short || a.name) + "“: zadejte 0–" + a.max + " b.";
      return;
    }
    scores[a.key] = v;
  }
  $("batchError").textContent = "";

  const test = {
    student_id: s.id, student_name: s.name, subject: batch.subject,
    grade: s.grade || "", school: s.school || "",
    date: $("batchDate").value || today(), note: "", scores,
  };
  const ev = evaluate(test.subject, test.scores);
  const plan = buildPlan(ev);

  const btn = $("batchSaveBtn");
  btn.disabled = true;
  try {
    const saved = await Store.addTest(test, ev, plan);
    state.tests.push(saved);
    const t = totals(test.subject, test.scores);
    batch.saved.unshift({ id: saved.id, studentId: s.id, name: s.name, pts: t.pts, max: t.max, pct: t.pct });
    batchRenderLog();
    batchReset();
  } catch (e) {
    btn.disabled = false;
    const msg = String(e.message || e);
    $("batchError").textContent = /row-level security|permission/i.test(msg)
      ? "Uložení odmítla databáze – testy může zadávat jen administrátor."
      : "Uložení se nepovedlo: " + msg;
  }
}

function batchRenderLog() {
  $("batchCount").innerHTML = batch.saved.length
    ? "v této dávce uloženo <b>" + batch.saved.length + "</b> " + testWord(batch.saved.length)
    : "";
  const el = $("batchLog");
  if (!batch.saved.length) {
    el.innerHTML = '<span class="diag-note">Zatím nic. Uložené testy se budou objevovat tady – kdyby se překlepl, jde je hned vrátit.</span>';
    return;
  }
  el.innerHTML = batch.saved.map((r, i) =>
    '<div class="row"><span class="ok">✓</span>' +
    '<span class="nm">' + escapeHtml(r.name) + "</span>" +
    '<span class="pc">' + r.pts + " / " + r.max + " b. · <b>" + r.pct + " %</b></span>" +
    '<button data-open="' + i + '">Karta</button>' +
    '<button data-undo="' + i + '">Vrátit</button></div>'
  ).join("");

  el.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = () => openStudent(batch.saved[Number(b.dataset.open)].studentId);
  });
  el.querySelectorAll("[data-undo]").forEach((b) => {
    b.onclick = async () => {
      const r = batch.saved[Number(b.dataset.undo)];
      if (!confirm("Vrátit (smazat) uložený test – " + r.name + ", " + r.pct + " %?")) return;
      try {
        await Store.removeTest(r.id);
        state.tests = state.tests.filter((x) => x.id !== r.id);
        batch.saved = batch.saved.filter((x) => x.id !== r.id);
        batchRenderLog();
        $("batchSearch").focus();
      } catch (e) { alert("Vrácení se nepovedlo: " + (e.message || e)); }
    };
  });
}

// ---------------------------------------------------------------------------
// Nový žák (jen administrátor)
// ---------------------------------------------------------------------------
let afterStudentCreated = null; // callback, když se žák zakládá z hromadného zadávání

function openNewStudent(prefillName, onDone) {
  ["nsName", "nsSchool", "nsGrade", "nsCategory", "nsPhone", "nsSubjects"].forEach((id) => { $(id).value = ""; });
  $("nsName").value = prefillName || "";
  afterStudentCreated = onDone || null;
  $("nsError").textContent = "";
  $("newStudentModal").classList.remove("hidden");
  ($("nsName").value ? $("nsSchool") : $("nsName")).focus();
}

async function saveNewStudent() {
  const name = $("nsName").value.trim();
  if (!name) { $("nsError").textContent = "Jméno je povinné."; return; }
  const btn = $("nsSave");
  btn.disabled = true;
  try {
    const s = await Store.addStudent({
      name,
      school: $("nsSchool").value.trim() || null,
      grade: $("nsGrade").value.trim() || null,
      category: $("nsCategory").value.trim() || null,
      phone: $("nsPhone").value.trim() || null,
      subjects: $("nsSubjects").value.trim() || null,
      status: "active",
    });
    $("newStudentModal").classList.add("hidden");
    if (afterStudentCreated) {
      const cb = afterStudentCreated;
      afterStudentCreated = null;
      cb(s); // hromadné zadávání si žáka rovnou vybere a jede dál
    } else {
      state.students.push(s);
      state.students.sort((a, b) => a.name.localeCompare(b.name, "cs"));
      openStudent(s.id);
    }
  } catch (e) {
    const msg = String(e.message || e);
    $("nsError").textContent = /row-level security|permission/i.test(msg)
      ? "Zakládat žáky může jen administrátor."
      : "Uložení se nepovedlo: " + msg;
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Tisková zpráva pro rodiče (v dialogu tisku → „Uložit jako PDF")
// ---------------------------------------------------------------------------
function printReport() {
  const s = state.openStudent;
  const test = state.tests.find((x) => x.id === state.shownTestId);
  if (!test) { alert("Vyberte test, který se má vytisknout."); return; }

  const ev = evaluate(test.subject, test.scores);
  const plan = buildPlan(ev);
  const S = SUBJECTS[test.subject];
  const trend = subjectTests(s.id, test.subject);
  const t = totals(test.subject, test.scores);

  $("printArea").innerHTML =
    '<div class="p-head">' +
      '<div class="p-org">' + escapeHtml(ORG_NAME) + "</div>" +
      '<div class="p-title">Diagnostický test – ' + escapeHtml(S.label) + ": souhrn a doporučená příprava</div>" +
    "</div>" +
    '<div class="p-ident">' +
      "<div><span class=\"k\">Žák:</span> <b>" + escapeHtml(s.name) + "</b></div>" +
      "<div><span class=\"k\">Datum testu:</span> " + fmtDateCz(test.date) + "</div>" +
      "<div><span class=\"k\">Škola:</span> " + escapeHtml(s.school || test.school || "—") + "</div>" +
      "<div><span class=\"k\">Výsledek:</span> <b>" + t.pts + " / " + t.max + " b. (" + t.pct + " %)</b></div>" +
      "<div><span class=\"k\">Třída / ročník:</span> " + escapeHtml(s.grade || test.grade || "—") + "</div>" +
      "<div><span class=\"k\">Hodnocení:</span> " + escapeHtml(overallAssessment(t.pct)) + "</div>" +
      (s.lector_name ? "<div><span class=\"k\">Lektor/ka:</span> " + escapeHtml(s.lector_name) + "</div>" : "") +
    "</div>" +
    resultHtml(test, ev, plan, { trend }) +
    '<div class="p-foot">' +
      "Vyhodnocení vychází z bodového zisku v jednotlivých oblastech testu (pásma: pod 45 % nezvládá, " +
      "45–75 % zvládá částečně, nad 75 % zvládá). Zprávu vystavil " + escapeHtml(ORG_NAME) +
      ", " + fmtDateCz(today()) + "." +
    "</div>";

  window.print();
}

// ---------------------------------------------------------------------------
// Odhlášení
// ---------------------------------------------------------------------------
// Odhlášení. Session je společná pro rozvrh, kartotéku i diagnostiku, takže
// se ruší stejně jako v rozvrhu; pak se jde na rozvrh, kde naskočí přihlášení.
// signOut() jde po síti a umí se při výpadku zaseknout, ne spadnout – proto
// se na něj čeká jen omezeně a session se tak jako tak smaže z prohlížeče.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Vypršel čas čekání na server.")), ms)),
  ]);
}

function clearLocalAuth() {
  try { sessionStorage.removeItem("poradys_user"); } catch (e) { /* privátní režim */ }
  try {
    Object.keys(localStorage)
      .filter((k) => /^sb-.*-auth-token/.test(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* privátní režim */ }
}

async function pageLogout(btn, client) {
  if (btn) btn.disabled = true;
  // Ze stránky stejně odcházíme, tak se na server čeká jen chvilku – když
  // neodpoví, odhlásí se to lokálně a jde se dál. Zaseknout se to nesmí.
  if (client) {
    try {
      const { error } = await withTimeout(client.auth.signOut(), 2500);
      if (error) throw error;
    } catch (e) {
      console.error(e);
    }
  }
  clearLocalAuth();
  location.href = "index.html" + location.search;
}

// ---------------------------------------------------------------------------
// Inicializace
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  $("backLink").href = "index.html" + location.search;
  $("lockedLink").href = "index.html" + location.search;

  let me = null;
  try { me = await Store.me(); } catch (e) { console.error(e); }
  if (!me) {
    $("lockedBox").classList.remove("hidden");
    return;
  }
  state.role = ["admin", "auditor"].includes(me.role) ? me.role : "lektor";
  state.userName = me.name || "";
  $("mainBox").classList.remove("hidden");
  $("diagLogout").onclick = () => pageLogout($("diagLogout"), DbStore._c());

  const badge = $("storeBadge");
  badge.textContent = "databáze";
  badge.classList.add("db");

  const rb = $("roleBadge");
  const ROLE_CZ = { admin: "administrátor", auditor: "auditor", lektor: "lektor" };
  rb.textContent = state.userName + " · " + ROLE_CZ[state.role] +
    (isStaff() ? " (zadává testy)" : " (jen čtení)");
  rb.classList.add("admin");

  $("newStudentBtn").classList.toggle("hidden", !isStaff());
  $("batchBtn").classList.toggle("hidden", !isStaff());
  $("dSearch").addEventListener("input", renderList);
  $("dShowFormer").addEventListener("change", renderList);
  $("dOnlyTested").addEventListener("change", renderList);
  $("newStudentBtn").onclick = () => openNewStudent();
  $("nsSave").onclick = saveNewStudent;
  const closeNs = () => { afterStudentCreated = null; $("newStudentModal").classList.add("hidden"); };
  $("nsCancel").onclick = closeNs;
  $("newStudentModal").onclick = (e) => { if (e.target.id === "newStudentModal") closeNs(); };
  $("backToList").onclick = showList;

  // ---- hromadné zadávání ----
  $("batchDate").value = today();
  $("batchBtn").onclick = showBatch;
  $("batchBack").onclick = showList;
  $("batchDate").onchange = () => { batch.date = $("batchDate").value || today(); };
  $("batchSearch").addEventListener("input", batchFilter);
  $("batchSearch").addEventListener("keydown", (e) => {
    const n = batch.matches.length + 1; // + položka „založit nového žáka"
    if (e.key === "ArrowDown") { e.preventDefault(); batch.hi = (batch.hi + 1) % n; batchRenderSug(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); batch.hi = (batch.hi - 1 + n) % n; batchRenderSug(); }
    else if (e.key === "Enter") { e.preventDefault(); batchChoose(); }
    else if (e.key === "Escape") { $("batchSug").classList.add("hidden"); }
  });
  // Modal nového žáka se zavře Escapem a uloží Enterem – i tady bez myši.
  $("newStudentModal").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveNewStudent(); }
    else if (e.key === "Escape") { e.preventDefault(); closeNs(); $("batchSearch").focus(); }
  });

  try {
    const [students, tests] = await Promise.all([Store.listStudents(), Store.listTests()]);
    state.students = students;
    state.tests = tests;
  } catch (e) {
    console.error(e);
    alert("Načtení dat selhalo: " + (e.message || e));
  }
  renderList();
});
