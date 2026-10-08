// ---------------------------------------------------------------------------
// Kartotéka lektorů – kontakt, smlouva, klíče, daně a odučené hodiny.
//
// Sourozenec kartoteka.js (klienti). Ovládá se stejně, jen tu stojí lektoři.
//
// Odkud se berou data:
//   • karta lektora   = tabulka `lectors` (jméno, telefon, adresa, smlouva…)
//   • odučené hodiny  = pohled `lector_monthly_hours` nad `work_log`, který
//                       plní databázový trigger při potvrzení lekce
//
// Lektoři se do kartotéky doplňují SAMI: jakmile se v rozvrhu napíše jméno
// lektora (k lekci nebo k zápisu „lektor u stolu"), appka na něj v `lectors`
// založí řádek. Tady se pak jen dovyplní zbytek údajů.
//
// Tahle stránka nahradila zrušené tlačítko „Výkaz hodin" v rozvrhu – čísla
// jsou pořád stejná, jen stojí vedle zbytku údajů o lektorovi.
// ---------------------------------------------------------------------------

const CFG = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDateCz(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return d + ". " + m + ". " + y;
}
// Hodiny bez zbytečných nul: 12 / 12,5
function fmtH(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(".", ","));
}
const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

function lectorWord(n) { return n === 1 ? "lektor" : n >= 2 && n <= 4 ? "lektoři" : "lektorů"; }
function dayWord(n) { return n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní"; }

// Klíče od pobočky – jedna hodnota ze tří (viz migrace_kartoteka_lektoru.sql).
const KEY_SETS = [
  { key: "", label: "— nemá klíče —", short: "—" },
  { key: "chip", label: "1. čip", short: "1. čip" },
  { key: "chip_attic", label: "2. čip + podkroví", short: "2. čip + podkroví" },
  { key: "full", label: "3. celý svazek", short: "3. celý svazek" },
];
function keyLabel(k) {
  const f = KEY_SETS.find((x) => x.key === (k || ""));
  return f ? f.short : String(k);
}
function keyOptions(sel) {
  return KEY_SETS.map((k) =>
    '<option value="' + k.key + '"' + (k.key === (sel || "") ? " selected" : "") + ">" + escapeHtml(k.label) + "</option>"
  ).join("");
}

// Jak lektor učí. Jedna hodnota ze tří (viz migrace_smlouva_a_mazani.sql),
// prázdno = neuvedeno.
const TEACH_MODES = [
  { key: "", label: "— neuvedeno —", short: "" },
  { key: "inperson", label: "osobně", short: "osobně" },
  { key: "online", label: "online", short: "online" },
  { key: "both", label: "osobně i online", short: "osobně i online" },
];
function teachLabel(k) {
  const f = TEACH_MODES.find((x) => x.key === (k || ""));
  return f ? f.short : String(k);
}
function teachOptions(sel) {
  return TEACH_MODES.map((t) =>
    '<option value="' + t.key + '"' + (t.key === (sel || "") ? " selected" : "") + ">" + escapeHtml(t.label) + "</option>"
  ).join("");
}

function isoToDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Stav smlouvy podle začátku i konce. Prošlá smlouva je provozní průšvih,
// tak ať je vidět z dálky – řádek se tónuje a v buňce svítí chip. Do 30 dní
// varuje předem. Smlouva bez konce platí na dobu neurčitou.
function contractState(r) {
  const od = r && r.contract_from, doKdy = r && r.contract_until;
  if (!od && !doKdy) return { cls: "none", label: "neuvedeno" };
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  if (od && isoToDate(od) > dnes) return { cls: "future", label: "ještě nezačala" };
  if (!doKdy) return { cls: "ok", label: "na neurčito" };
  const dni = Math.round((isoToDate(doKdy) - dnes) / 86400000);
  if (dni < 0) return { cls: "over", label: "PROŠLÁ" };
  if (dni === 0) return { cls: "soon", label: "končí dnes" };
  if (dni <= 30) return { cls: "soon", label: "končí za " + dni + " " + dayWord(dni) };
  return { cls: "ok", label: "platí" };
}

// Rozsah smlouvy do jednoho textu: „1. 9. 2026 – 31. 8. 2027", „od 1. 9. 2026",
// „do 31. 8. 2027".
function contractRange(r) {
  const od = r && r.contract_from, doKdy = r && r.contract_until;
  if (od && doKdy) return fmtDateCz(od) + " – " + fmtDateCz(doKdy);
  if (od) return "od " + fmtDateCz(od);
  if (doKdy) return "do " + fmtDateCz(doKdy);
  return "";
}

// ---------- Provider: SUPABASE ----------
const DbLek = {
  client: null,
  _c() {
    if (!this.client) this.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    return this.client;
  },
  // Vrátí { name, role } přihlášeného, nebo null. Roli je nutné ověřit tady,
  // ne jen schováním tlačítka v rozvrhu – na stránku se dá jít i adresou.
  async session() {
    const c = this._c();
    const { data } = await c.auth.getSession();
    if (!data || !data.session) return null;
    const { data: p } = await c.from("profiles")
      .select("*").eq("id", data.session.user.id).maybeSingle();
    // Odebraný přístup (profiles.active = false) session rovnou zneplatní.
    if (p && p.active === false) { try { await c.auth.signOut(); } catch (e) { console.error(e); } return null; }
    return { name: (p && p.name) || data.session.user.email, role: (p && p.role) || "lektor" };
  },
  async list() {
    const { data, error } = await this._c().from("lectors").select("*").order("name");
    if (error) throw error;
    return data || [];
  },
  // Odučené hodiny všech lektorů za jeden měsíc (od prvního do posledního dne
  // – tak je počítá pohled, který sčítá work_log podle work_date).
  // `month` je 0-based jako v JS Date, pohled má 1-based.
  async monthHours(year, month) {
    const { data, error } = await this._c().from("lector_monthly_hours")
      .select("lector_id, lessons, hours, payout_czk")
      .eq("year", year).eq("month", month + 1);
    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => { map[r.lector_id] = r; });
    return map;
  },
  // Historie po měsících pro jednoho lektora (do karty).
  async lectorHours(id) {
    const { data, error } = await this._c().from("lector_monthly_hours")
      .select("year, month, lessons, hours, payout_czk")
      .eq("lector_id", id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(24);
    if (error) throw error;
    return data || [];
  },
  // Začátek smlouvy a způsob výuky přidává migrace_smlouva_a_mazani.sql.
  // Na databázi bez ní by uložení karty spadlo celé – tak se ty dva sloupce
  // vynechají, zbytek se uloží a saveCard na to upozorní (missingCols).
  missingCols: false,
  async saveLector(fields, id) {
    try {
      return await this._saveLector(fields, id);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (!/contract_from|teaching_mode/.test(m)) throw e;
      this.missingCols = true;
      const rest = Object.assign({}, fields);
      delete rest.contract_from;
      delete rest.teaching_mode;
      return await this._saveLector(rest, id);
    }
  },
  async _saveLector(fields, id) {
    const c = this._c();
    if (id) {
      const { error } = await c.from("lectors").update(fields).eq("id", id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await c.from("lectors").insert(fields).select("id").single();
    if (error) throw error;
    return data.id;
  },
  // Smaže lektora i s hodinami a zápisy u stolu (funkce delete_lector).
  // dryRun = jen spočítá, co by zmizelo – do potvrzovacího okna.
  async deleteLector(id, dryRun) {
    const { data, error } = await this._c().rpc("delete_lector", { p_lector: id, p_dry_run: !!dryRun });
    if (error) throw new Error(rpcErrorCz(error));
    return data || {};
  },
};

// Funkce v databázi si hlášky píšou česky samy. Tohle chytá jen případ, kdy
// funkce ještě neexistuje (nespuštěná migrace).
function rpcErrorCz(error) {
  const m = String((error && error.message) || error || "");
  if (/Could not find the function|does not exist|schema cache/i.test(m)) {
    return "Mazání zatím není v databázi zapnuté – spusťte migrace_smlouva_a_mazani.sql.";
  }
  return m;
}

const lek = DbLek;

// ---------- Stav ----------
let rows = [];            // karty lektorů (tabulka lectors)
let hours = {};           // lector_id -> { lessons, hours, payout_czk } za vybraný měsíc
let month = new Date();   // vybraný měsíc (vždy 1. den)
month = new Date(month.getFullYear(), month.getMonth(), 1);
let openId = null;        // id otevřené karty (null = nový lektor)
let openLector = null;    // načtená karta
let openHistory = [];     // historie hodin otevřené karty

function visibleRows() {
  const q = $("ktSearch").value.trim().toLowerCase();
  const former = $("ktShowFormer").checked;
  return rows
    .filter((r) => former || r.active !== false)
    .filter((r) => !q ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.phone || "").includes(q) ||
      (r.subjects || "").toLowerCase().includes(q));
}

function monthLabel() { return MONTHS[month.getMonth()] + " " + month.getFullYear(); }

// ---------- Přehled ----------
function renderTable() {
  $("mName").textContent = monthLabel();
  $("thHours").innerHTML = "Hodin<br><span style=\"font-weight:400\">" + escapeHtml(monthLabel()) + "</span>";

  const vis = visibleRows();
  const sumH = vis.reduce((s, r) => s + Number((hours[r.id] && hours[r.id].hours) || 0), 0);
  // Prošlá smlouva se hlídá jen u aktivních – u bývalého lektora je to v pořádku.
  const prosle = vis.filter((r) => r.active !== false && contractState(r).cls === "over").length;
  const brzy = vis.filter((r) => r.active !== false && contractState(r).cls === "soon").length;

  $("ktSummary").innerHTML =
    "<b>" + vis.length + "</b> " + lectorWord(vis.length) +
    " · za " + escapeHtml(monthLabel().toLowerCase()) + " odučeno <b>" + fmtH(sumH) + " h</b>" +
    (prosle ? ' · <span style="color:#c62828;font-weight:600;">' + prosle + "× prošlá smlouva</span>" : "") +
    (brzy ? ' · <span style="color:#b45309;font-weight:600;">' + brzy + "× smlouva brzy končí</span>" : "");

  const tb = $("ktBody");
  tb.innerHTML = "";
  if (!vis.length) {
    tb.innerHTML = '<tr><td colspan="10" style="color:#999;padding:18px;">' +
      "Žádní lektoři. Přibudou sem sami, jakmile se jejich jméno objeví v rozvrhu – " +
      "nebo je můžete založit tlačítkem „+ Nový lektor\".</td></tr>";
    return;
  }

  vis.forEach((r) => {
    const tr = document.createElement("tr");
    const sml = contractState(r);
    const rozsah = contractRange(r);
    const classes = [];
    if (r.active === false) classes.push("former");
    else if (sml.cls === "over" || sml.cls === "soon") classes.push("row-" + sml.cls);
    tr.className = classes.join(" ");

    const h = hours[r.id];
    tr.innerHTML =
      "<td><b>" + escapeHtml(r.name) + "</b>" +
        (r.active === false
          ? ' <button class="reactivate" data-reactivate="' + r.id + '" title="Vrátit lektora mezi aktivní">↩ aktivovat</button>'
          : "") + "</td>" +
      "<td>" + escapeHtml(r.phone) + "</td>" +
      '<td title="' + escapeHtml(r.address) + '">' + escapeHtml(r.address) + "</td>" +
      "<td>" + escapeHtml(r.subjects) + "</td>" +
      "<td>" + escapeHtml(teachLabel(r.teaching_mode)) + "</td>" +
      '<td title="' + escapeHtml(rozsah ? rozsah + " · " + sml.label : "") + '">' + (rozsah
        ? escapeHtml(rozsah) + ' <span class="chip ' + sml.cls + '">' + escapeHtml(sml.label) + "</span>"
        : '<span class="chip none">neuvedeno</span>') + "</td>" +
      "<td>" + escapeHtml(keyLabel(r.key_set)) + "</td>" +
      '<td class="' + (r.tax_signed ? "yes" : "no") + '">' + (r.tax_signed ? "✓ ano" : "ne") + "</td>" +
      '<td class="num">' + (h ? "<b>" + fmtH(h.hours) + " h</b>" : '<span style="color:#bbb">0</span>') + "</td>" +
      '<td title="' + escapeHtml(r.note) + '">' + escapeHtml(r.note) + "</td>";

    tr.onclick = (e) => {
      if (e.target.closest(".reactivate")) return;
      openCardPanel(r.id);
    };
    const reBtn = tr.querySelector(".reactivate");
    if (reBtn) reBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("Vrátit lektora " + r.name + " mezi aktivní?")) return;
      reBtn.disabled = true;
      try {
        await lek.saveLector({ active: true }, r.id);
        r.active = true;
        renderTable();
      } catch (err) {
        reBtn.disabled = false;
        alert("Změna se nepodařila: " + (err.message || err));
      }
    };
    tb.appendChild(tr);
  });
}

async function refreshList() {
  try {
    // Karty i hodiny naráz – jsou to dva nezávislé dotazy.
    const [list, map] = await Promise.all([
      lek.list(),
      lek.monthHours(month.getFullYear(), month.getMonth()),
    ]);
    rows = list;
    hours = map;
  } catch (e) {
    console.error(e);
    alert("Načtení kartotéky lektorů selhalo: " + (e.message || e));
    rows = []; hours = {};
  }
  renderTable();
}

// Jen hodiny (při listování měsíců se karty lektorů znovu tahat nemusí).
async function refreshHours() {
  try { hours = await lek.monthHours(month.getFullYear(), month.getMonth()); }
  catch (e) { console.error(e); hours = {}; }
  renderTable();
}

function shiftMonth(delta) {
  month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
  refreshHours();
}

// ---------- Odhlášení (stejné jako v kartotéce klientů) ----------
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

let _toastTimer = null;
function ktToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), 4000);
}

// ---------- Karta lektora ----------
function fieldHtml(label, inner, cls) {
  return '<div class="field' + (cls ? " " + cls : "") + '"><label>' + label + "</label>" + inner + "</div>";
}
function inp(id, val, ph) {
  return '<input type="text" id="' + id + '" value="' + escapeHtml(val || "") + '"' + (ph ? ' placeholder="' + escapeHtml(ph) + '"' : "") + ">";
}

async function openCardPanel(id) {
  openId = id;
  openHistory = [];
  if (id) {
    openLector = rows.find((r) => r.id === id) || null;
    if (!openLector) { alert("Kartu se nepodařilo najít."); return; }
    try { openHistory = await lek.lectorHours(id); }
    catch (e) { console.error(e); }
  } else {
    openLector = { active: true, tax_signed: false };
  }
  renderCard();
  $("overlay").classList.remove("hidden");
  $("cardPanel").classList.remove("hidden");
}

function closeCard() {
  openId = null; openLector = null; openHistory = [];
  $("overlay").classList.add("hidden");
  $("cardPanel").classList.add("hidden");
}

function renderCard() {
  const l = openLector || {};
  $("cardTitle").textContent = openId ? l.name : "Nový lektor";

  // Přehled nahoře: hodiny vybraného měsíce + stav smlouvy.
  const h = openId ? hours[openId] : null;
  const sml = contractState(l);
  const rozsah = contractRange(l);
  let stateHtml = "";
  if (openId) {
    stateHtml = '<div class="kt-state">' +
      '<div class="box"><div class="v">' + fmtH(h && h.hours) + '</div><div class="k">hodin – ' + escapeHtml(monthLabel().toLowerCase()) + "</div></div>" +
      '<div class="box"><div class="v">' + ((h && h.lessons) || 0) + '</div><div class="k">odučených lekcí</div></div>' +
      '<div class="box"><div class="v"><span class="chip ' + sml.cls + '">' + escapeHtml(sml.label) + "</span></div>" +
        '<div class="k">SMLOUVA' + (rozsah ? " " + escapeHtml(rozsah) : "") + "</div></div>" +
      "</div>";
  }

  const fieldsHtml = '<div class="card-fields">' +
    fieldHtml("Jméno *", inp("kName", l.name)) +
    fieldHtml("Telefon", inp("kPhone", l.phone)) +
    fieldHtml("E-mail", inp("kEmail", l.email)) +
    fieldHtml("Co učí", inp("kSubjects", l.subjects, "např. ČJ, MAT")) +
    fieldHtml("Adresa", inp("kAddress", l.address, "Ulice č. p., město"), "wide") +
    fieldHtml("Smlouva od", '<input type="date" id="kContractFrom" value="' + escapeHtml(String(l.contract_from || "").slice(0, 10)) + '">') +
    fieldHtml("Smlouva do", '<input type="date" id="kContract" value="' + escapeHtml(String(l.contract_until || "").slice(0, 10)) + '">') +
    fieldHtml("Učí", '<select id="kTeach">' + teachOptions(l.teaching_mode) + "</select>") +
    fieldHtml("Klíče", '<select id="kKeys">' + keyOptions(l.key_set) + "</select>") +
    // Daňové prohlášení: jen ano/ne, nic víc se k tomu nevede.
    '<div class="field check-field"><label class="check"><input type="checkbox" id="kTax"' +
      (l.tax_signed ? " checked" : "") + "> Podepsal(a) daně</label></div>" +
    fieldHtml("Hodinová sazba Kč/h", '<input type="number" id="kRate" min="0" step="10" value="' + (l.hourly_rate || "") + '">') +
    fieldHtml("Stav", '<select id="kActive">' +
      '<option value="1"' + (l.active !== false ? " selected" : "") + ">aktivní</option>" +
      '<option value="0"' + (l.active === false ? " selected" : "") + ">bývalý</option>" +
      "</select>") +
    fieldHtml("Poznámka", inp("kNote", l.note), "wide") +
    "</div>";

  // Odučené hodiny po měsících – historie z work_log. Drží se 10+ let, takže
  // je vidět i to, co bylo dávno před úklidem starých lekcí.
  let hoursHtml = '<div class="kt-section-h">Odučené hodiny po měsících</div>';
  if (!openId) {
    hoursHtml += '<span style="font-size:12px;color:#999;">Hodiny se začnou počítat, jakmile lektor bude mít v rozvrhu potvrzené lekce.</span>';
  } else if (!openHistory.length) {
    hoursHtml += '<span style="font-size:12px;color:#999;">Zatím žádné potvrzené lekce. Počítají se jen ty odškrtnuté jako <b>Odučeno</b>.</span>';
  } else {
    const rate = Number(l.hourly_rate) || 0;
    hoursHtml += '<div class="hrs-scroll"><table class="hrs-table"><tr><th>Měsíc</th>' +
      '<th class="num">Lekcí</th><th class="num">Hodin</th>' + (rate ? '<th class="num">Kč</th>' : "") + "</tr>";
    openHistory.forEach((r) => {
      const cur = r.year === month.getFullYear() && r.month === month.getMonth() + 1;
      hoursHtml += '<tr class="' + (cur ? "cur" : "") + '">' +
        "<td>" + MONTHS[r.month - 1] + " " + r.year + "</td>" +
        '<td class="num">' + r.lessons + "</td>" +
        '<td class="num"><b>' + fmtH(r.hours) + "</b></td>" +
        (rate ? '<td class="num">' + Math.round(Number(r.payout_czk) || 0).toLocaleString("cs-CZ") + "</td>" : "") +
        "</tr>";
    });
    hoursHtml += "</table></div>";
    hoursHtml += '<p style="font-size:11.5px;color:#999;margin-top:6px;">' +
      "Měsíc = od prvního do posledního dne. Sčítají se jen lekce potvrzené jako <b>Odučeno</b>; " +
      "zápisy „lektor u stolu\" se do hodin nepočítají." +
      (rate ? "" : " Kč se dopočítají, jakmile vyplníte hodinovou sazbu.") + "</p>";
  }

  let html = stateHtml;
  if (openId) {
    html += '<div class="card-main">' +
      '<div class="card-col">' + fieldsHtml + "</div>" +
      '<div class="card-col">' + hoursHtml + "</div>" +
      "</div>";
  } else {
    html += fieldsHtml +
      '<p style="font-size:12.5px;color:#777;">Lektor se do rozvrhu nabídne v našeptávači u pole „Lektor" ' +
      "hned po uložení karty.</p>";
  }

  $("cardBody").innerHTML = html;
  $("cardSaved").textContent = "";
  // Smazat jde jen uloženou kartu – nový lektor ještě nic nemá.
  $("cardDelete").classList.toggle("hidden", !openId);
}

async function saveCard() {
  const name = $("kName").value.trim();
  if (!name) { $("cardSaved").textContent = "Jméno je povinné."; return; }
  const fields = {
    name,
    phone: $("kPhone").value.trim() || null,
    email: $("kEmail").value.trim() || null,
    address: $("kAddress").value.trim() || null,
    subjects: $("kSubjects").value.trim() || null,
    contract_from: $("kContractFrom").value || null,
    contract_until: $("kContract").value || null,
    teaching_mode: $("kTeach").value || null,
    key_set: $("kKeys").value || null,
    tax_signed: $("kTax").checked,
    hourly_rate: Number($("kRate").value) || null,
    active: $("kActive").value === "1",
    note: $("kNote").value.trim() || null,
  };
  // ISO data se dají porovnat jako text.
  if (fields.contract_from && fields.contract_until && fields.contract_from > fields.contract_until) {
    $("cardSaved").textContent = "Smlouva nemůže končit dřív, než začne.";
    return;
  }
  const btn = $("cardSave");
  btn.disabled = true;
  // Upozornění, když databáze ještě nezná nové sloupce (viz DbLek.saveLector).
  const migrWarn = () => lek.missingCols
    ? " Smlouva od a způsob výuky se neuložily – v databázi chybí migrace_smlouva_a_mazani.sql."
    : "";
  try {
    const isNew = !openId;
    const id = await lek.saveLector(fields, openId);
    openId = id;
    if (isNew) {
      closeCard();
      await refreshList();
      ktToast("Lektor „" + name + "“ uložen." + migrWarn());
      return;
    }
    await refreshList();
    openLector = rows.find((r) => r.id === id) || Object.assign({ id }, fields);
    try { openHistory = await lek.lectorHours(id); } catch (e) { console.error(e); }
    renderCard();
    $("cardSaved").textContent = "Uloženo ✓" + migrWarn();
  } catch (e) {
    // Jméno lektora je v databázi unikátní – páruje se podle něj rozvrh
    // i výkaz hodin, takže dvě karty se stejným jménem by hodiny rozpůlily.
    const m = String((e && e.message) || e);
    $("cardSaved").textContent = /duplicate key|lectors_name_uidx|unique/i.test(m)
      ? "Lektor s tímhle jménem už v kartotéce je."
      : "Chyba: " + m;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Smazání lektora ----------
// Nejdřív se databáze zeptá „nanečisto", co by zmizelo, a to se ukáže
// v potvrzení. Odučené hodiny jsou podklad k výplatám – kdo je smaže, přijde
// o ně nadobro, tak to musí být v okně napsané černé na bílém.
// Tvar podle počtu: [1, 2–4, 5 a víc]. Čeština s číslem mění i sloveso,
// takže se skloňuje celá věta, ne jen podstatné jméno.
function plural(n, forms) { return n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2]; }
function lessonWordCz(n) { return plural(n, ["lekce", "lekce", "lekcí"]); }

async function deleteCard() {
  if (!openId) return;
  const l = openLector || {};
  const btn = $("cardDelete");
  btn.disabled = true;
  $("cardSaved").textContent = "";
  try {
    const info = await lek.deleteLector(openId, true);
    const co = [];
    if (info.work_rows) {
      co.push("• odučené hodiny: " + fmtH(info.hours) + " h (" + info.work_rows + " " + lessonWordCz(info.work_rows) +
        ") – zmizí i z podkladů k výplatám");
    }
    if (info.future_lessons) {
      const f = info.future_lessons;
      co.push("• " + f + " " + plural(f, [
        "lekce naplánovaná dopředu zůstane", "lekce naplánované dopředu zůstanou", "lekcí naplánovaných dopředu zůstane",
      ]) + " v rozvrhu bez lektora – přidělte " + (f === 1 ? "ji" : "je") + " jinému");
    }
    if (info.shifts) {
      co.push("• " + info.shifts + " " + plural(info.shifts, [
        "zápis „lektor u stolu“ se smaže", "zápisy „lektor u stolu“ se smažou", "zápisů „lektor u stolu“ se smaže",
      ]));
    }
    const msg =
      "Smazat lektora " + (info.name || l.name) + " úplně?\n\n" +
      (co.length ? co.join("\n") + "\n\n" : "Lektor nemá žádné odučené hodiny ani lekce.\n\n") +
      "Nejde to vrátit. Když lektor jen odešel, stačí v kartě nastavit Stav: bývalý – " +
      "hodiny zůstanou a z nabídky v rozvrhu zmizí.";
    if (!confirm(msg)) return;

    await lek.deleteLector(openId, false);
    closeCard();
    await refreshList();
    ktToast("Lektor „" + (info.name || l.name) + "“ smazán." +
      (info.has_account ? " Přihlašovací účet má pořád – zrušte ho v rozvrhu v Účtech." : ""));
  } catch (e) {
    $("cardSaved").textContent = "Chyba: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Export CSV (pro Excel) ----------
function exportCsv() {
  const cols = ["Lektor/ka", "Telefon", "E-mail", "Adresa", "Co učí", "Výuka", "Smlouva od", "Smlouva do", "Stav smlouvy",
    "Klíče", "Podepsal daně", "Hodinová sazba Kč/h",
    "Odučeno lekcí (" + monthLabel() + ")", "Odučeno hodin (" + monthLabel() + ")",
    "Stav", "Poznámka"];
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [cols.map(esc).join(";")];
  visibleRows().forEach((r) => {
    const h = hours[r.id];
    lines.push([
      r.name, r.phone, r.email, r.address, r.subjects, teachLabel(r.teaching_mode),
      fmtDateCz(r.contract_from), fmtDateCz(r.contract_until), contractState(r).label,
      keyLabel(r.key_set), r.tax_signed ? "ano" : "ne", r.hourly_rate || "",
      (h && h.lessons) || 0, fmtH(h && h.hours),
      r.active === false ? "bývalý" : "aktivní", r.note,
    ].map(esc).join(";"));
  });
  // BOM kvůli češtině v Excelu
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lektori-" + month.getFullYear() + "-" + String(month.getMonth() + 1).padStart(2, "0") + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Inicializace ----------
window.addEventListener("DOMContentLoaded", async () => {
  $("backLink").href = "index.html" + location.search;

  // Tlačítko se váže hned – nepřihlášenému se schová, odhlašovat nemá co.
  $("ktLogout").onclick = () => pageLogout($("ktLogout"), DbLek._c());

  const badge = $("storeBadge");
  const session = await DbLek.session();
  if (!session) {
    $("lockedBox").classList.remove("hidden");
    $("mainBox").classList.add("hidden");
    $("ktLogout").classList.add("hidden");
    badge.textContent = "nepřihlášeno";
    return;
  }
  // Kartotéka lektorů je mzdový a provozní podklad, ne platby klientů – proto
  // sem na rozdíl od kartotéky klientů vidí i auditor. Lektor ne: jsou tu
  // adresy a smlouvy kolegů.
  if (session.role !== "admin" && session.role !== "auditor") {
    $("lockedBox").innerHTML =
      '<h2 style="margin:0 0 8px;">Jen pro administrátora a auditora</h2>' +
      '<p style="color:#777;font-size:13.5px;">Kartotéka lektorů vede adresy, smlouvy a odučené ' +
      'hodiny celého týmu. Zpět na <a href="index.html">rozvrh</a>.</p>';
    $("lockedBox").classList.remove("hidden");
    $("mainBox").classList.add("hidden");
    badge.textContent = "bez oprávnění";
    return;
  }
  badge.textContent = "databáze";
  badge.style.background = "#e6f4ea"; badge.style.color = "#1e6b30";

  $("ktSearch").addEventListener("input", renderTable);
  $("ktShowFormer").addEventListener("change", renderTable);
  $("mPrev").onclick = () => shiftMonth(-1);
  $("mNext").onclick = () => shiftMonth(1);
  $("ktNewBtn").onclick = () => openCardPanel(null);
  $("ktExportBtn").onclick = exportCsv;
  $("overlay").onclick = closeCard;
  $("cardClose").onclick = closeCard;
  $("cardSave").onclick = saveCard;
  $("cardDelete").onclick = deleteCard;

  await refreshList();
});
