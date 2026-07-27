// ---------------------------------------------------------------------------
// Kartotéka – klienti, platby a kredit hodin (nahrazuje Excel "KARTOTÉKA").
//
// Data: v ostrém režimu Supabase (pohled student_credit + tabulky students,
// payments; čerpání kreditu plní databázové triggery z rozvrhu). V ukázkovém
// režimu (?mock=1 nebo USE_SUPABASE=false) běží na datech v paměti.
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
function fmtH(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(".", ","));
}
function balanceBand(b) { return b <= 0 ? "out" : b <= 3 ? "low" : "ok"; }
function balanceLabel(b) { return b <= 0 ? "NÍZKÝ KREDIT" : b <= 3 ? "dochází" : "ok"; }

const PAY_METHODS = ["účet DR", "účet PoraDys", "účet jazykovka", "hotově"];

// Barevné označení klienta (řádek se podle něj tónuje; color = barva kolečka).
const FLAGS = [
  { key: "", label: "— bez označení —", cls: "", color: "" },
  { key: "online", label: "online", cls: "fl-online", color: "#2563eb" },
  { key: "inperson", label: "osobně", cls: "fl-inperson", color: "#16a34a" },
  { key: "ending", label: "končí / ukončuje", cls: "fl-ending", color: "#6b7280" },
  { key: "contacted", label: "kontaktováno", cls: "fl-contacted", color: "#dc2626" },
  { key: "problem", label: "problémový", cls: "fl-problem", color: "#ea580c" },
];
function flagInfo(key) { return FLAGS.find((f) => f.key === (key || "")) || FLAGS[0]; }

// <option> pro výběr označení; kolečko ● i text nese barvu daného označení.
function flagOptions(selected) {
  return FLAGS.map((f) => {
    const sel = f.key === (selected || "") ? " selected" : "";
    const style = f.color ? ' style="color:' + f.color + '"' : "";
    const txt = (f.key ? "● " : "") + f.label.replace("— bez označení —", "bez označení");
    return '<option value="' + f.key + '"' + sel + style + ">" + escapeHtml(txt) + "</option>";
  }).join("");
}

// ---------- Provider: MOCK (ukázková data v paměti) ----------
const MockKt = {
  _seq: 1,
  students: [
    { id: "m1", name: "Aftanas Lukáš", phone: "777050743", category: "ZŠ", grade: "5. třída", school: "ZŠ Norská, Kladno", subjects: "AJ", lector_name: "Štruncová", price_hour: 420, price_hour_discount: 430, payment_method: "hotově", status: "active", note: "", flag: "inperson" },
    { id: "m2", name: "Balík Petr", phone: "723111222", category: "ZŠ", grade: "7. třída", school: "ZŠ Moskevská, Kladno", subjects: "MAT", lector_name: "Kunkelová", price_hour: 440, price_hour_discount: 420, payment_method: "účet PoraDys", status: "active", note: "", flag: "online" },
    { id: "m3", name: "Berchak Anna", phone: "605333444", category: "SŠ", grade: "2. ročník", school: "Gymnázium Kladno", subjects: "ČJ, MAT", lector_name: "Mužíková", price_hour: 450, price_hour_discount: 430, payment_method: "účet DR", status: "active", note: "přijímačky na VŠ", flag: "contacted" },
    { id: "m4", name: "Bezdičková Ela", phone: "776555666", category: "ZŠ", grade: "9. tř. - přijímačky", school: "ZŠ Zákostelní, Kladno", subjects: "ČJ, MAT", lector_name: "Šíma", price_hour: 430, price_hour_discount: 420, payment_method: "účet jazykovka", status: "active", note: "", flag: "problem" },
    { id: "m5", name: "Vondrušková Melissa", phone: "731777888", category: "ZŠ", grade: "8. třída", school: "ZŠ Amálská, Kladno", subjects: "MAT", lector_name: "Machalíková", price_hour: 420, price_hour_discount: 410, payment_method: "hotově", status: "active", note: "", flag: "" },
    { id: "m6", name: "Zvonař František", phone: "702999000", category: "SŠ", grade: "3. roč.", school: "SPŠ Kladno", subjects: "ČJ, NAT", lector_name: "Tampír", price_hour: 420, price_hour_discount: 410, payment_method: "účet PoraDys", status: "former", note: "ukončeno 6/2026", flag: "ending" },
  ],
  payments: [
    { id: "p1", student_id: "m1", paid_at: "2026-05-02", amount_czk: 3900, hours_credit: 10, method: "hotově", note: "" },
    { id: "p2", student_id: "m1", paid_at: "2026-06-14", amount_czk: 4200, hours_credit: 10, method: "účet PoraDys", note: "" },
    { id: "p3", student_id: "m2", paid_at: "2026-06-20", amount_czk: 4400, hours_credit: 10, method: "účet PoraDys", note: "" },
    { id: "p4", student_id: "m3", paid_at: "2026-04-11", amount_czk: 4500, hours_credit: 10, method: "účet DR", note: "" },
    { id: "p5", student_id: "m4", paid_at: "2026-07-01", amount_czk: 8600, hours_credit: 20, method: "účet jazykovka", note: "" },
    { id: "p6", student_id: "m5", paid_at: "2026-03-05", amount_czk: 4200, hours_credit: 10, method: "hotově", note: "počáteční zůstatek z Excelu" },
  ],
  used: { m1: 20, m2: 9, m3: 11, m4: 8.5, m5: 9, m6: 4 },
  lessons: {
    m1: [
      { date: "2026-07-16 14:00", subject: "AJ", lector: "Štruncová", hours: 1, done: true },
      { date: "2026-07-09 14:00", subject: "AJ", lector: "Štruncová", hours: 1, done: true },
      { date: "2026-06-25 14:00", subject: "AJ", lector: "Moravcová za Štruncovou", hours: 1, done: true },
    ],
    m4: [
      { date: "2026-07-15 16:00", subject: "MAT", lector: "Šíma", hours: 1.5, done: true },
      { date: "2026-07-08 16:00", subject: "ČJ", lector: "Šíma", hours: 1, done: true },
    ],
  },
  _credit(s) {
    const paid = this.payments.filter((p) => p.student_id === s.id);
    const paid_hours = paid.reduce((x, p) => x + Number(p.hours_credit), 0);
    const paid_czk = paid.reduce((x, p) => x + Number(p.amount_czk), 0);
    const used_hours = this.used[s.id] || 0;
    return { ...s, student_id: s.id, paid_hours, paid_czk, used_hours, balance_hours: paid_hours - used_hours };
  },
  async list() { return this.students.map((s) => this._credit(s)); },
  async getCard(id) {
    const s = this.students.find((x) => x.id === id);
    return {
      student: s,
      credit: this._credit(s),
      payments: this.payments.filter((p) => p.student_id === id).sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
      lessons: this.lessons[id] || [],
    };
  },
  async saveStudent(fields, id) {
    if (id) { Object.assign(this.students.find((x) => x.id === id), fields); return id; }
    const s = { id: "mnew" + this._seq++, status: "active", ...fields };
    this.students.push(s);
    return s.id;
  },
  async addPayment(p) { this.payments.push({ ...p, id: "pnew" + this._seq++ }); },
  async deletePayment(id) { this.payments = this.payments.filter((x) => x.id !== id); },
};

// ---------- Provider: SUPABASE ----------
const DbKt = {
  client: null,
  _c() {
    if (!this.client) this.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    return this.client;
  },
  async session() {
    const { data } = await this._c().auth.getSession();
    return data && data.session;
  },
  async list() {
    const { data, error } = await this._c().from("student_credit").select("*").order("name");
    if (error) throw error;
    return data.map((r) => ({ ...r, id: r.student_id }));
  },
  async getCard(id) {
    const c = this._c();
    const [st, cr, pay, att] = await Promise.all([
      c.from("students").select("*").eq("id", id).single(),
      c.from("student_credit").select("*").eq("student_id", id).single(),
      c.from("payments").select("*").eq("student_id", id).order("paid_at", { ascending: false }),
      c.from("attendance").select("lessons(id, starts_at, ends_at, subject, done, status, lectors(name))").eq("student_id", id),
    ]);
    if (st.error) throw st.error;
    const lessons = (att.data || [])
      .map((a) => a.lessons).filter(Boolean)
      .map((l) => ({
        date: String(l.starts_at).slice(0, 16).replace("T", " "),
        starts: l.starts_at,
        subject: l.subject || "—",
        lector: (l.lectors && l.lectors.name) || "—",
        hours: Math.round(((new Date(l.ends_at) - new Date(l.starts_at)) / 3600000) * 100) / 100,
        done: l.done,
      }))
      .sort((a, b) => new Date(b.starts) - new Date(a.starts))
      .slice(0, 60);
    return { student: st.data, credit: cr.data, payments: pay.data || [], lessons };
  },
  async saveStudent(fields, id) {
    const c = this._c();
    if (id) {
      const { error } = await c.from("students").update(fields).eq("id", id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await c.from("students").insert(fields).select("id").single();
    if (error) throw error;
    return data.id;
  },
  async addPayment(p) {
    const { error } = await this._c().from("payments").insert(p);
    if (error) throw error;
  },
  async deletePayment(id) {
    const { error } = await this._c().from("payments").delete().eq("id", id);
    if (error) throw error;
  },
};

const useDb = !!CFG.USE_SUPABASE;
const kt = useDb ? DbKt : MockKt;

// ---------- Stav ----------
let rows = [];          // řádky přehledu (student_credit)
let openId = null;      // id otevřené karty (null = nový klient)
let openCard = null;    // načtená karta

// ---------- Přehled (TOTAL) ----------
function visibleRows() {
  const q = $("ktSearch").value.trim().toLowerCase();
  const former = $("ktShowFormer").checked;
  return rows
    .filter((r) => former || r.status !== "former")
    .filter((r) => !q || (r.name || "").toLowerCase().includes(q) || (r.phone || "").includes(q));
}

// Souhrny peněz podle způsobu platby (kolik klientů + kolik Kč).
// Kliknutím na kartu se pod ní rozbalí seznam klientů, kteří tak platí –
// jen aktivních, bývalí do rozpisu nepatří.
let openMethod = null; // rozkliknutý způsob platby (null = nic)

function czkFmt(n) { return Math.round(n).toLocaleString("cs-CZ") + " Kč"; }
function clientWord(n) { return n === 1 ? "klient" : n >= 2 && n <= 4 ? "klienti" : "klientů"; }
// „1 aktivní klient" / „3 aktivní klienti" / „7 aktivních klientů"
function activeClients(n) {
  const adj = n === 1 ? "aktivní" : n >= 2 && n <= 4 ? "aktivní" : "aktivních";
  return n + " " + adj + " " + clientWord(n);
}

function renderMoney() {
  const vis = visibleRows();
  const totalCzk = vis.reduce((s, r) => s + Number(r.paid_czk || 0), 0);
  const groups = {};
  vis.forEach((r) => {
    const m = r.payment_method || "(neuvedeno)";
    const g = groups[m] || (groups[m] = { count: 0, czk: 0 });
    g.count++; g.czk += Number(r.paid_czk || 0);
  });
  const order = PAY_METHODS.concat(Object.keys(groups).filter((m) => !PAY_METHODS.includes(m)));

  let html = '<div class="mcard total"><div class="m-label">Celkem zaplaceno</div>' +
    '<div class="m-czk">' + czkFmt(totalCzk) + '</div><div class="m-cnt">' + vis.length + " " + clientWord(vis.length) + "</div></div>";
  order.forEach((m) => {
    const g = groups[m];
    if (!g) return;
    html += '<div class="mcard clickable' + (openMethod === m ? " open" : "") + '" data-method="' + escapeHtml(m) + '">' +
      '<div class="m-label">' + escapeHtml(m) + "</div>" +
      '<div class="m-czk">' + czkFmt(g.czk) + '</div>' +
      '<div class="m-cnt">' + g.count + " " + clientWord(g.count) + ' <span class="m-caret">' + (openMethod === m ? "▾" : "▸") + "</span></div></div>";
  });
  $("ktMoney").innerHTML = html;

  $("ktMoney").querySelectorAll("[data-method]").forEach((el) => {
    el.onclick = () => {
      openMethod = openMethod === el.dataset.method ? null : el.dataset.method;
      renderMoney();
      renderMethodDetail();
    };
  });
  renderMethodDetail();
}

// Rozpis klientů pod kartami – jen aktivní, seřazení podle jména.
function renderMethodDetail() {
  const box = $("ktMethodDetail");
  if (!openMethod) { box.innerHTML = ""; box.classList.add("hidden"); return; }

  const list = rows
    .filter((r) => r.status !== "former")
    .filter((r) => (r.payment_method || "(neuvedeno)") === openMethod)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "cs"));

  const sumCzk = list.reduce((s, r) => s + Number(r.paid_czk || 0), 0);
  let html = '<div class="md-head"><b>' + escapeHtml(openMethod) + "</b> · " +
    activeClients(list.length) + " · zaplaceno " + czkFmt(sumCzk) +
    '<button id="mdClose">Zavřít</button></div>';

  if (!list.length) {
    html += '<div style="font-size:12.5px;color:#999;padding:6px 2px;">Tímto způsobem teď neplatí žádný aktivní klient.</div>';
  } else {
    html += '<table class="md-table"><tr><th>Klient</th><th>Telefon</th><th>Předměty</th><th>Lektor/ka</th>' +
      '<th class="num">Zaplaceno</th><th class="num">Zůstatek h</th><th></th></tr>' +
      list.map((r) => {
        const band = balanceBand(Number(r.balance_hours));
        return '<tr data-open="' + r.id + '"><td><b>' + escapeHtml(r.name) + "</b></td>" +
          "<td>" + escapeHtml(r.phone) + "</td>" +
          "<td>" + escapeHtml(r.subjects) + "</td>" +
          "<td>" + escapeHtml(r.lector_name) + "</td>" +
          '<td class="num">' + czkFmt(r.paid_czk || 0) + "</td>" +
          '<td class="num"><b>' + fmtH(r.balance_hours) + "</b></td>" +
          '<td><span class="chip-credit ' + band + '">' + balanceLabel(Number(r.balance_hours)) + "</span></td></tr>";
      }).join("") + "</table>";
  }

  box.innerHTML = html;
  box.classList.remove("hidden");
  $("mdClose").onclick = () => { openMethod = null; renderMoney(); };
  box.querySelectorAll("[data-open]").forEach((tr) => {
    tr.onclick = () => openCardPanel(tr.dataset.open);
  });
}

function renderTable() {
  const vis = visibleRows();
  const low = vis.filter((r) => r.balance_hours <= 0).length;
  $("ktSummary").innerHTML =
    "<b>" + vis.length + "</b> klientů" +
    (low ? ' · <span style="color:#c62828;font-weight:600;">' + low + "× nízký kredit</span>" : "");
  renderMoney();

  const tb = $("ktBody");
  tb.innerHTML = "";
  if (!vis.length) {
    tb.innerHTML = '<tr><td colspan="13" style="color:#999;padding:18px;">Žádní klienti. Založte prvního tlačítkem „+ Nový klient".</td></tr>';
    return;
  }
  vis.forEach((r) => {
    const tr = document.createElement("tr");
    const classes = [];
    if (r.status === "former") classes.push("former");
    if (r.flag) classes.push("row-" + r.flag);
    tr.className = classes.join(" ");
    const band = balanceBand(Number(r.balance_hours));
    const fc = flagInfo(r.flag).color;
    const flagSel = '<select class="flag-select" data-id="' + r.id + '"' +
      (fc ? ' style="color:' + fc + ';font-weight:600"' : "") + ">" + flagOptions(r.flag) + "</select>";
    tr.innerHTML =
      "<td><b>" + escapeHtml(r.name) + "</b></td>" +
      "<td>" + escapeHtml(r.phone) + "</td>" +
      "<td>" + escapeHtml(r.category) + "</td>" +
      "<td>" + escapeHtml(r.grade) + "</td>" +
      "<td>" + escapeHtml(r.subjects) + "</td>" +
      "<td>" + escapeHtml(r.lector_name) + "</td>" +
      '<td class="num">' + (r.price_hour ? Math.round(r.price_hour) : "") + "</td>" +
      "<td>" + escapeHtml(r.payment_method) + "</td>" +
      '<td class="flag-cell">' + flagSel + "</td>" +
      '<td class="num">' + fmtH(r.paid_hours) + "</td>" +
      '<td class="num">' + fmtH(r.used_hours) + "</td>" +
      '<td class="num"><b>' + fmtH(r.balance_hours) + "</b></td>" +
      // U bývalého klienta je místo stavu kreditu tlačítko na vrácení mezi aktivní.
      "<td>" + (r.status === "former"
        ? '<button class="reactivate" data-reactivate="' + r.id + '" title="Vrátit klienta mezi aktivní">↩ aktivovat</button>'
        : '<span class="chip-credit ' + band + '">' + balanceLabel(Number(r.balance_hours)) + "</span>") + "</td>";
    tr.onclick = (e) => {
      if (e.target.closest(".flag-select") || e.target.closest(".reactivate")) return;
      openCardPanel(r.id);
    };
    const reBtn = tr.querySelector(".reactivate");
    if (reBtn) reBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("Vrátit klienta " + r.name + " mezi aktivní?")) return;
      reBtn.disabled = true;
      try {
        await kt.saveStudent({ status: "active" }, r.id);
        r.status = "active";
        renderTable();
      } catch (err) {
        reBtn.disabled = false;
        alert("Změna se nepodařila: " + (err.message || err));
      }
    };
    const sel = tr.querySelector(".flag-select");
    sel.onclick = (e) => e.stopPropagation();
    sel.onchange = async (e) => {
      e.stopPropagation();
      const val = sel.value;
      try {
        await kt.saveStudent({ flag: val || null }, r.id);
        r.flag = val;
        tr.className = [r.status === "former" ? "former" : "", val ? "row-" + val : ""].filter(Boolean).join(" ");
        const c = flagInfo(val).color;
        sel.style.color = c || "";
        sel.style.fontWeight = c ? "600" : "";
      } catch (err) { alert("Označení se nepodařilo uložit: " + (err.message || err)); }
    };
    tb.appendChild(tr);
  });
}

async function refreshList() {
  try {
    rows = await kt.list();
  } catch (e) {
    console.error(e);
    alert("Načtení kartotéky selhalo: " + (e.message || e));
    rows = [];
  }
  renderTable();
}

// ---------- Karta klienta ----------
function fieldHtml(label, inner) {
  return '<div class="field"><label>' + label + "</label>" + inner + "</div>";
}
function inp(id, val, ph) {
  return '<input type="text" id="' + id + '" value="' + escapeHtml(val || "") + '"' + (ph ? ' placeholder="' + ph + '"' : "") + ">";
}
function methodOptions(sel) {
  return '<option value="">—</option>' + PAY_METHODS.map((m) =>
    '<option value="' + m + '"' + (m === (sel || "") ? " selected" : "") + ">" + m + "</option>").join("") +
    (sel && !PAY_METHODS.includes(sel) ? '<option value="' + escapeHtml(sel) + '" selected>' + escapeHtml(sel) + "</option>" : "");
}

async function openCardPanel(id) {
  openId = id;
  if (id) {
    try { openCard = await kt.getCard(id); }
    catch (e) { alert("Kartu se nepodařilo načíst: " + (e.message || e)); return; }
  } else {
    openCard = { student: { status: "active" }, credit: null, payments: [], lessons: [] };
  }
  renderCard();
  $("overlay").classList.remove("hidden");
  $("cardPanel").classList.remove("hidden");
}

function closeCard() {
  openId = null; openCard = null;
  $("overlay").classList.add("hidden");
  $("cardPanel").classList.add("hidden");
}

function renderCard() {
  const s = openCard.student || {};
  const cr = openCard.credit;
  $("cardTitle").textContent = openId ? s.name : "Nový klient";

  // Stav kreditu (celá šířka nahoře)
  let stateHtml = "";
  if (cr) {
    const band = balanceBand(Number(cr.balance_hours));
    stateHtml = '<div class="kt-state">' +
      '<div class="box"><div class="v">' + fmtH(cr.paid_hours) + '</div><div class="k">zaplaceno hodin</div></div>' +
      '<div class="box"><div class="v">' + fmtH(cr.used_hours) + '</div><div class="k">vyčerpáno hodin</div></div>' +
      '<div class="box bal-' + band + '"><div class="v">' + fmtH(cr.balance_hours) + '</div><div class="k">ZŮSTATEK (kredit)</div></div>' +
      "</div>";
  }

  // Údaje klienta – mřížka 2×N, aby popisky i políčka byly v jedné rovině
  // (u flexu se pole rozjela, když měl jeden popisek dva řádky).
  let fieldsHtml = '<div class="card-fields">' +
    fieldHtml("Jméno *", inp("kName", s.name)) +
    fieldHtml("Telefon", inp("kPhone", s.phone)) +
    fieldHtml("Kategorie", inp("kCategory", s.category, "ZŠ / SŠ…")) +
    fieldHtml("Třída / ročník", inp("kGrade", s.grade)) +
    // Škola se ukazuje i v diagnostice u karty žáka.
    fieldHtml("Škola", inp("kSchool", s.school, "Např. ZŠ Norská, Kladno")) +
    fieldHtml("Předměty", inp("kSubjects", s.subjects, "např. ČJ, MAT")) +
    fieldHtml("Lektor/ka", inp("kLector", s.lector_name)) +
    fieldHtml("Cena Kč/hod", '<input type="number" id="kPrice" value="' + (s.price_hour || "") + '">') +
    fieldHtml("Cena se slevou", '<input type="number" id="kPriceD" value="' + (s.price_hour_discount || "") + '">') +
    fieldHtml("Způsob platby", '<select id="kMethod">' + methodOptions(s.payment_method) + "</select>") +
    fieldHtml("Stav", '<select id="kStatus"><option value="active"' + (s.status !== "former" ? " selected" : "") + '>aktivní</option><option value="former"' + (s.status === "former" ? " selected" : "") + ">bývalý</option></select>") +
    fieldHtml("Označení", '<select id="kFlag">' + flagOptions(s.flag) + "</select>") +
    fieldHtml("Poznámka", inp("kNote", s.note)) +
    "</div>";

  // Platby + Výuka (pravý sloupec)
  let payHtml = '<div class="kt-section-h">Platby</div>';
  if (openId) {
    if (openCard.payments.length) {
      payHtml += '<table class="pay-table"><tr><th>Termín</th><th class="num">Částka Kč</th><th class="num">Kredit h</th><th>Způsob</th><th></th></tr>';
      openCard.payments.forEach((p) => {
        payHtml += "<tr><td>" + fmtDateCz(p.paid_at) + (p.note ? ' <span style="color:#999">(' + escapeHtml(p.note) + ")</span>" : "") + "</td>" +
          '<td class="num">' + Math.round(p.amount_czk).toLocaleString("cs-CZ") + "</td>" +
          '<td class="num">' + fmtH(p.hours_credit) + "</td>" +
          "<td>" + escapeHtml(p.method) + "</td>" +
          '<td><button data-payid="' + p.id + '">Smazat</button></td></tr>';
      });
      payHtml += "</table>";
    } else {
      payHtml += '<span style="font-size:12px;color:#999;">Zatím žádné platby.</span>';
    }
    payHtml += '<div class="pay-form">' +
      '<input type="date" id="pDate" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '<input type="number" id="pAmount" placeholder="Částka Kč">' +
      '<input type="number" id="pHours" placeholder="Kredit hodin" step="0.5">' +
      '<select id="pMethod">' + methodOptions(s.payment_method) + "</select>" +
      '<input type="text" id="pNote" placeholder="Poznámka">' +
      '<button id="pAdd" style="background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:5px;font-weight:600;cursor:pointer;">Přidat platbu</button>' +
      "</div>";
  }

  let lessonsHtml = '<div class="kt-section-h">Výuka (z rozvrhu)</div>';
  if (openId) {
    if (openCard.lessons.length) {
      let lastMonth = "";
      const MONTHS = ["ledna","února","března","dubna","května","června","července","srpna","září","října","listopadu","prosince"];
      lessonsHtml += '<div class="lessons-scroll">';
      openCard.lessons.forEach((l) => {
        const d = new Date(l.starts || l.date.replace(" ", "T"));
        const mKey = d.getFullYear() + "-" + d.getMonth();
        if (mKey !== lastMonth) {
          lastMonth = mKey;
          lessonsHtml += '<div class="lesson-month">' + MONTHS[d.getMonth()].toUpperCase() + " " + d.getFullYear() + "</div>";
        }
        lessonsHtml += '<div class="lesson-row"><span class="d">' + d.getDate() + ". " + (d.getMonth() + 1) + ". " +
          String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + "</span>" +
          '<span class="s">' + escapeHtml(l.subject) + " · " + escapeHtml(l.lector) + (l.done ? " ✓" : ' <span style="color:#999">(neodučeno)</span>') + "</span>" +
          '<span class="h">' + fmtH(l.hours) + " h</span></div>";
      });
      lessonsHtml += "</div>";
    } else {
      lessonsHtml += '<span style="font-size:12px;color:#999;">Žádné lekce v rozvrhu (starší než rok jsou po úklidu – kredit je ale započtený).</span>';
    }
  }

  // Celá karta ve dvou sloupcích (údaje | platby+výuka) – ať se vejde bez rolování.
  let html = stateHtml;
  if (openId) {
    html += '<div class="card-main">' +
      '<div class="card-col">' + fieldsHtml + "</div>" +
      '<div class="card-col">' + payHtml + lessonsHtml + "</div>" +
      "</div>";
  } else {
    html += fieldsHtml + '<p style="font-size:12.5px;color:#777;">Po uložení karty půjde přidat první platba (kredit hodin).</p>';
  }

  $("cardBody").innerHTML = html;
  $("cardSaved").textContent = "";

  // handlery uvnitř karty
  document.querySelectorAll("#cardBody [data-payid]").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("Smazat tuto platbu?")) return;
      try {
        await kt.deletePayment(b.dataset.payid);
        openCard = await kt.getCard(openId);
        renderCard();
        refreshList();
      } catch (err) { alert("Smazání selhalo: " + (err.message || err)); }
    };
  });
  const pAdd = $("pAdd");
  if (pAdd) pAdd.onclick = async () => {
    const hours = Number($("pHours").value);
    if (!hours) { alert("Vyplňte kredit hodin (kolik hodin platba předplácí)."); return; }
    try {
      await kt.addPayment({
        student_id: openId,
        paid_at: $("pDate").value || new Date().toISOString().slice(0, 10),
        amount_czk: Number($("pAmount").value) || 0,
        hours_credit: hours,
        method: $("pMethod").value || null,
        note: $("pNote").value.trim() || null,
      });
      openCard = await kt.getCard(openId);
      renderCard();
      refreshList();
    } catch (err) { alert("Uložení platby selhalo: " + (err.message || err)); }
  };
}

async function saveCard() {
  const name = $("kName").value.trim();
  if (!name) { $("cardSaved").textContent = "Jméno je povinné."; return; }
  const fields = {
    name,
    phone: $("kPhone").value.trim() || null,
    category: $("kCategory").value.trim() || null,
    grade: $("kGrade").value.trim() || null,
    school: $("kSchool").value.trim() || null,
    subjects: $("kSubjects").value.trim() || null,
    lector_name: $("kLector").value.trim() || null,
    price_hour: Number($("kPrice").value) || null,
    price_hour_discount: Number($("kPriceD").value) || null,
    payment_method: $("kMethod").value || null,
    status: $("kStatus").value,
    flag: $("kFlag").value || null,
    note: $("kNote").value.trim() || null,
  };
  const btn = $("cardSave");
  btn.disabled = true;
  try {
    const id = await kt.saveStudent(fields, openId);
    const isNew = !openId;
    openId = id;
    openCard = await kt.getCard(id);
    renderCard();
    $("cardSaved").textContent = "Uloženo ✓";
    await refreshList();
    if (isNew) $("cardSaved").textContent = "Uloženo ✓ – teď přidejte první platbu.";
  } catch (e) {
    $("cardSaved").textContent = "Chyba: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Export CSV (pro Excel) ----------
function exportCsv() {
  const cols = ["Klient", "Telefon", "Kategorie", "Třída/ročník", "Škola", "Předměty", "Lektor/ka",
    "Cena Kč/hod", "Cena se slevou", "Způsob platby", "Zaplaceno hodin", "Zaplaceno Kč",
    "Vyčerpáno hodin", "Zůstatek hodin", "Upozornění", "Stav", "Poznámka"];
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [cols.map(esc).join(";")];
  visibleRows().forEach((r) => {
    lines.push([
      r.name, r.phone, r.category, r.grade, r.school, r.subjects, r.lector_name,
      r.price_hour || "", r.price_hour_discount || "", r.payment_method,
      fmtH(r.paid_hours), Math.round(r.paid_czk || 0), fmtH(r.used_hours), fmtH(r.balance_hours),
      Number(r.balance_hours) <= 0 ? "NÍZKÝ KREDIT" : "ok",
      r.status === "former" ? "bývalý" : "aktivní", r.note,
    ].map(esc).join(";"));
  });
  // BOM kvůli češtině v Excelu
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kartoteka-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Hromadný import ----------
async function runImport() {
  const lines = $("impText").value.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { $("impInfo").textContent = "Vložte alespoň jeden řádek."; return; }
  let ok = 0, bad = 0;
  $("impRun").disabled = true;
  for (const line of lines) {
    const p = line.split(";").map((x) => x.trim());
    if (!p[0]) { bad++; continue; }
    try {
      const id = await kt.saveStudent({
        name: p[0], phone: p[1] || null, category: p[2] || null, grade: p[3] || null,
        subjects: p[4] || null, lector_name: p[5] || null,
        price_hour: Number(p[6]) || null, payment_method: p[7] || null,
        status: "active", note: null,
      }, null);
      const balance = Number(String(p[8] || "").replace(",", "."));
      if (balance) {
        await kt.addPayment({
          student_id: id, paid_at: new Date().toISOString().slice(0, 10),
          amount_czk: 0, hours_credit: balance, method: p[7] || null,
          note: "počáteční zůstatek z Excelu",
        });
      }
      ok++;
    } catch (e) { console.error(line, e); bad++; }
  }
  $("impRun").disabled = false;
  $("impInfo").textContent = "Importováno " + ok + " klientů" + (bad ? ", " + bad + " řádků přeskočeno (chyba)" : "") + ".";
  await refreshList();
}

// ---------- Inicializace ----------
window.addEventListener("DOMContentLoaded", async () => {
  $("backLink").href = "index.html" + location.search;

  const badge = $("storeBadge");
  if (useDb) {
    const session = await DbKt.session();
    if (!session) {
      $("lockedBox").classList.remove("hidden");
      $("mainBox").classList.add("hidden");
      badge.textContent = "nepřihlášeno";
      return;
    }
    badge.textContent = "databáze";
    badge.style.background = "#e6f4ea"; badge.style.color = "#1e6b30";
  } else {
    badge.textContent = "ukázková data";
  }

  $("ktSearch").addEventListener("input", renderTable);
  $("ktShowFormer").addEventListener("change", renderTable);
  $("ktNewBtn").onclick = () => openCardPanel(null);
  $("ktExportBtn").onclick = exportCsv;
  $("ktImportBtn").onclick = () => { $("impInfo").textContent = ""; $("impModal").classList.remove("hidden"); };
  $("impClose").onclick = () => $("impModal").classList.add("hidden");
  $("impRun").onclick = runImport;
  $("impModal").onclick = (e) => { if (e.target.id === "impModal") $("impModal").classList.add("hidden"); };
  $("overlay").onclick = closeCard;
  $("cardClose").onclick = closeCard;
  $("cardSave").onclick = saveCard;

  await refreshList();
});
