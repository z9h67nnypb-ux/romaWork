// ---------------------------------------------------------------------------
// Kartotéka – klienti, platby a kredit hodin (nahrazuje Excel "KARTOTÉKA").
//
// Data: naostro ze Supabase (pohled student_credit + tabulky students,
// payments; čerpání kreditu plní databázové triggery z rozvrhu). Ukázkový
// režim (?demo=1) běží na sdíleném demo úložišti – viz DemoStore v mockData.js.
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

// ---------- Provider: MOCK (sdílené ukázkové úložiště) ----------
// Klienty, platby i lekce drží DemoStore (mockData.js) společně s rozvrhem.
// Dřív měla kartotéka vlastní seznam klientů a natvrdo zapsané „vyčerpané
// hodiny", takže odučení lekce v rozvrhu se do zůstatku nikdy nepropsalo.
// Teď se vyčerpané hodiny počítají z potvrzených lekcí – stejně jako to
// v ostré verzi dělá databáze (tabulka credit_log plněná triggery).
const MockKt = {
  get students() { return window.DemoStore.clients(); },
  get payments() { return window.DemoStore.payments(); },

  // Lekce klienta z rozvrhu (podle jména – v ukázkovém režimu není docházka).
  _lessonsOf(s) {
    const name = String((s && s.name) || "").trim().toLowerCase();
    if (!name) return [];
    return window.DemoStore.lessons()
      .filter((l) => (l.kind || "lesson") !== "shift")
      .filter((l) => String(l.student_names || "").trim().toLowerCase() === name)
      .map((l) => ({
        date: l.starts_at,
        starts: l.starts_at,
        subject: l.subject || "—",
        lector: l.lector_name || "—",
        hours: Math.round(((l.ends_at - l.starts_at) / 3600000) * 100) / 100,
        done: !!l.done,
      }))
      .sort((a, b) => b.starts - a.starts);
  },

  _credit(s) {
    const paid = this.payments.filter((p) => p.student_id === s.id);
    const paid_hours = paid.reduce((x, p) => x + Number(p.hours_credit), 0);
    const paid_czk = paid.reduce((x, p) => x + Number(p.amount_czk), 0);
    const used_hours = Math.round(
      this._lessonsOf(s).filter((l) => l.done).reduce((x, l) => x + l.hours, 0) * 100
    ) / 100;
    return { ...s, student_id: s.id, paid_hours, paid_czk, used_hours, balance_hours: paid_hours - used_hours };
  },

  async list() { return this.students.map((s) => this._credit(s)); },
  async getCard(id) {
    const s = this.students.find((x) => x.id === id);
    return {
      student: s,
      credit: this._credit(s),
      payments: this.payments.filter((p) => p.student_id === id).sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
      lessons: this._lessonsOf(s).slice(0, 60),
    };
  },
  async saveStudent(fields, id) {
    if (id) {
      Object.assign(this.students.find((x) => x.id === id), fields);
      window.DemoStore.save();
      return id;
    }
    const s = { id: window.DemoStore.newId("k"), status: "active", ...fields };
    this.students.push(s);
    window.DemoStore.save();
    return s.id;
  },
  async addPayment(p) {
    this.payments.push({ ...p, id: window.DemoStore.newId("p") });
    window.DemoStore.save();
  },
  async deletePayment(id) {
    const arr = this.payments;
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    window.DemoStore.save();
  },

  // --- rozvrh (pravidelná lekce zakládaná z karty klienta) ---
  async rooms() { return [...window.ROOMS].sort((a, b) => a.sort - b.sort); },
  async lessonsInRange(from, to) {
    return window.DemoStore.lessons().filter((l) => l.starts_at >= from && l.starts_at < to);
  },
  async createLesson(row) {
    window.DemoStore.lessons().push({
      id: window.DemoStore.newId("mock-new"),
      kind: "lesson",
      lesson_type: row.lesson_type || "regular",
      room_id: row.room_id || null,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      student_names: row.student_name || "",
      student_phone: row.student_phone || "",
      student_grade: row.student_grade || "",
      student_category: row.student_category || "",
      subject: row.subject || "",
      lector_name: row.lector_name || "",
      mode: row.mode || "offline",
      status: "planned",
      done: false,
      description: "",
    });
    window.DemoStore.save();
  },
  async finishLessons() { window.DemoStore.save(); },
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

  // --- rozvrh (pravidelná lekce zakládaná z karty klienta) ---
  async rooms() {
    const { data, error } = await this._c().from("rooms").select("*").order("sort");
    if (error) throw error;
    return data;
  },
  // Existující lekce v rozsahu – kvůli kontrole kolizí u série termínů.
  async lessonsInRange(from, to) {
    const { data, error } = await this._c().from("lessons")
      .select("id, room_id, starts_at, ends_at, kind")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString());
    if (error) throw error;
    return (data || []).map((l) => ({ ...l, starts_at: new Date(l.starts_at), ends_at: new Date(l.ends_at) }));
  },
  // Lektor se dohledá podle jména, případně se založí (stejně jako v rozvrhu).
  async _resolveLector(name) {
    if (!name) return null;
    const c = this._c();
    const { data } = await c.from("lectors").select("id").eq("name", name).limit(1);
    if (data && data.length) return data[0].id;
    const { data: ins, error } = await c.from("lectors").insert({ name }).select("id").single();
    if (error) throw error;
    return ins.id;
  },
  // Sloupec lesson_type má jen databáze po migraci_typ_lekce.sql; bez něj
  // appka jede dál, jen bez rozlišení mimořádná/opakovaná.
  _noLessonType: false,
  async createLesson(row) {
    const c = this._c();
    const lector_id = await this._resolveLector(row.lector_name);
    const base = {
      kind: "lesson",
      starts_at: row.starts_at.toISOString(),
      ends_at: row.ends_at.toISOString(),
      subject: row.subject || null,
      room_id: row.room_id || null,
      lector_id,
      mode: row.mode || "offline",
      status: "planned",
      done: false,
      description: null,
    };
    if (!this._noLessonType) base.lesson_type = row.lesson_type || "regular";
    let res = await c.from("lessons").insert(base).select("id").single();
    if (res.error && /lesson_type/.test(String(res.error.message || res.error))) {
      this._noLessonType = true;
      delete base.lesson_type;
      res = await c.from("lessons").insert(base).select("id").single();
    }
    if (res.error) throw res.error;
    if (row.student_id) {
      const { error } = await c.from("attendance").insert({ lesson_id: res.data.id, student_id: row.student_id });
      if (error) throw error;
    }
  },
  async finishLessons() {},
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
  if (useDb && client) {
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

async function openCardPanel(id) {
  openId = id;
  await ensureRooms(); // seznam stolů pro blok pravidelné lekce
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

  // Odučené hodiny se počítají výhradně z rozvrhu (potvrzené lekce) – ručně
  // se nepřidávají, aby čísla v kartě vždy odpovídala tomu, co se doopravdy
  // odučilo. Oprava se dělá u konkrétní lekce v rozvrhu.
  const usedH = fmtH((cr && cr.used_hours) || 0);
  // V seznamu jsou i lekce naplánované dopředu, proto „lekce v rozvrhu" –
  // kredit čerpají jen ty potvrzené jako odučené.
  let lessonsHtml = '<div class="kt-section-h">Lekce v rozvrhu · odučeno ' + usedH + " h</div>";
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

  const recHtml = recurringHtml(s);

  // Celá karta ve dvou sloupcích (údaje | platby+výuka) – ať se vejde bez rolování.
  let html = stateHtml;
  if (openId) {
    html += '<div class="card-main">' +
      '<div class="card-col">' + fieldsHtml + recHtml + "</div>" +
      '<div class="card-col">' + payHtml + lessonsHtml + "</div>" +
      "</div>";
  } else {
    html += fieldsHtml + recHtml +
      '<p style="font-size:12.5px;color:#777;">Po uložení karty půjde přidat první platba (kredit hodin).</p>';
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
  // Pravidelná lekce – přepočítávat náhled při každé změně.
  ["rEnabled", "rDow", "rTimeFrom", "rTimeTo", "rWeeks", "rEvery", "rFrom", "rRoom"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("change", updateRecurringInfo);
  });
  updateRecurringInfo();
  const rCreate = $("rCreate");
  if (rCreate) rCreate.onclick = async () => {
    rCreate.disabled = true;
    try {
      const r = await createRecurring(openId, openCard.student || {});
      if (!r) { alert("Nejdřív zapněte „Chodí pravidelně“ a vyplňte termín."); return; }
      $("cardSaved").textContent = "Do rozvrhu založeno " + r.added + " " + ktLessonWord(r.added) +
        (r.skipped ? " (" + r.skipped + " přeskočeno kvůli kolizi)" : "") + " ✓";
      openCard = await kt.getCard(openId);
      renderCard();
    } catch (e) {
      alert("Založení lekcí selhalo: " + (e.message || e));
    } finally {
      rCreate.disabled = false;
    }
  };

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

// ---------- Pravidelná lekce zakládaná rovnou z karty klienta ----------
// Většina klientů chodí pořád ve stejný den a čas. Tady se to zadá jednou
// a lekce se rovnou naplánují na několik týdnů dopředu do rozvrhu – dřív se
// musely klikat po jedné.

let ktRooms = null;

async function ensureRooms() {
  if (ktRooms) return ktRooms;
  // Při chybě se nic nekešuje, ať to jde příště zkusit znovu.
  try { ktRooms = await kt.rooms(); }
  catch (e) { console.error(e); return []; }
  return ktRooms;
}

function ktRoomOptions(sel) {
  return '<option value="">— bez místnosti (online) —</option>' +
    (ktRooms || []).map((r) =>
      '<option value="' + escapeHtml(r.id) + '"' + (r.id === sel ? " selected" : "") + ">" + escapeHtml(r.name) + "</option>"
    ).join("");
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

function recurringHtml(s) {
  const O = window.Opakovani;
  return '<div class="kt-section-h">Pravidelná lekce v rozvrhu</div>' +
    '<div class="rec-box">' +
      '<label class="check"><input type="checkbox" id="rEnabled"> Chodí pravidelně – naplánovat do rozvrhu</label>' +
      '<div id="rFields" class="rec-grid hidden">' +
        '<label>Den v týdnu<select id="rDow">' + O.dowOptions(1) + "</select></label>" +
        '<label>První termín od<input type="date" id="rFrom" value="' + todayIso() + '"></label>' +
        '<label>Od<input type="time" id="rTimeFrom" value="15:00"></label>' +
        '<label>Do<input type="time" id="rTimeTo" value="16:00"></label>' +
        '<label>Stůl / učebna<select id="rRoom">' + ktRoomOptions("") + "</select></label>" +
        '<label>Předmět<input type="text" id="rSubject" value="' + escapeHtml(s.subjects || "") + '"></label>' +
        '<label>Lektor/ka<input type="text" id="rLector" value="' + escapeHtml(s.lector_name || "") + '"></label>' +
        '<label>Režim<select id="rMode"><option value="offline"' + (s.flag === "online" ? "" : " selected") + ">Osobní</option>" +
          '<option value="online"' + (s.flag === "online" ? " selected" : "") + ">Online</option></select></label>" +
        '<label>Počet lekcí<input type="number" id="rWeeks" min="1" max="52" value="10"></label>' +
        '<label>Interval<select id="rEvery"><option value="1">každý týden</option><option value="2">ob týden</option></select></label>' +
      "</div>" +
      '<div class="rec-info" id="rInfo"></div>' +
      (openId ? '<button type="button" id="rCreate" class="rec-btn">Založit termíny do rozvrhu</button>' : "") +
    "</div>";
}

// Termíny podle rozdělaného formuláře (prázdné, když je blok vypnutý).
function recurringSeries() {
  const on = $("rEnabled") && $("rEnabled").checked;
  if (!on) return [];
  const [y, mo, d] = ($("rFrom").value || todayIso()).split("-").map(Number);
  const first = window.Opakovani.nextDow(new Date(y, mo - 1, d), $("rDow").value);
  const step = Number($("rEvery").value) === 2 ? 2 : 1;
  const n = Number($("rWeeks").value) || 0;
  if (!n) return [];
  return window.Opakovani.series(first, $("rTimeFrom").value, $("rTimeTo").value, n, step);
}

function updateRecurringInfo() {
  const box = $("rInfo");
  if (!box) return;
  const on = $("rEnabled").checked;
  $("rFields").classList.toggle("hidden", !on);
  const btn = $("rCreate");
  if (btn) btn.classList.toggle("hidden", !on);
  if (!on) { box.textContent = ""; return; }

  // Předmět a lektorku převezmeme z rozdělané karty – u nového klienta se
  // vyplňují až po otevření panelu, takže při vykreslení bloku ještě prázdné byly.
  if (!$("rSubject").value.trim()) $("rSubject").value = $("kSubjects").value.trim();
  if (!$("rLector").value.trim()) $("rLector").value = $("kLector").value.trim();

  const list = recurringSeries();
  if (!list.length) { box.textContent = "Zkontrolujte časy – konec musí být po začátku – a počet lekcí."; return; }
  const step = Number($("rEvery").value) === 2 ? 2 : 1;
  box.innerHTML = "Do rozvrhu se založí <b>" + list.length + " " + ktLessonWord(list.length) + "</b> – " +
    escapeHtml(window.Opakovani.describe(list, step)) + ". Obsazené termíny se přeskočí." +
    ($("rRoom").value ? "" : " <b>Bez stolu</b> se lekce zapíší jako online a kolize se nekontrolují.");
}

function ktLessonWord(n) { return n === 1 ? "lekce" : n >= 2 && n <= 4 ? "lekce" : "lekcí"; }

// Založí sérii do rozvrhu. Vrací { added, skipped } nebo null, když je blok vypnutý.
async function createRecurring(studentId, student) {
  const list = recurringSeries();
  if (!list.length) return null;
  const roomId = $("rRoom").value || null;
  const last = new Date(list[list.length - 1].ends_at);
  last.setDate(last.getDate() + 1);

  let existing = [];
  try { existing = await kt.lessonsInRange(list[0].starts_at, last); }
  catch (e) { console.error(e); }

  const row = {
    room_id: roomId,
    subject: $("rSubject").value.trim(),
    lector_name: $("rLector").value.trim(),
    mode: $("rMode").value,
    lesson_type: "regular",
    student_id: studentId,
    student_name: student.name,
    student_phone: student.phone || "",
    student_grade: student.grade || "",
    student_category: student.category || "",
  };

  let added = 0, skipped = 0;
  for (const t of list) {
    // Kolize hlídáme jen v místnosti – online lekce (bez stolu) se nekryjí.
    const clash = roomId && existing.some((l) =>
      (l.kind || "lesson") !== "shift" && l.room_id === roomId &&
      t.starts_at < l.ends_at && l.starts_at < t.ends_at);
    if (clash) { skipped++; continue; }
    try {
      await kt.createLesson({ ...row, starts_at: t.starts_at, ends_at: t.ends_at });
      existing.push({ kind: "lesson", room_id: roomId, starts_at: t.starts_at, ends_at: t.ends_at });
      added++;
    } catch (e) { console.error(e); skipped++; }
  }
  await kt.finishLessons();
  return { added, skipped };
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
    const isNew = !openId;
    // Sérii je potřeba přečíst z formuláře ještě před překreslením karty.
    const wantSeries = isNew && $("rEnabled") && $("rEnabled").checked;
    const id = await kt.saveStudent(fields, openId);

    let series = null;
    if (wantSeries) {
      try { series = await createRecurring(id, { ...fields, id }); }
      catch (e) { console.error(e); }
    }

    openId = id;

    const seriesInfo = series
      ? " Do rozvrhu založeno " + series.added + " " + ktLessonWord(series.added) +
        (series.skipped ? " (" + series.skipped + " přeskočeno kvůli kolizi)" : "") + "."
      : "";

    if (isNew) {
      // Nový klient: karta se zavře a výsledek se ukáže v hlášce nad tabulkou.
      // Platbu přidáte otevřením klienta v seznamu, kam právě přibyl.
      closeCard();
      await refreshList();
      ktToast("Klient „" + name + "\u201c uložen." + seriesInfo +
        " Kredit hodin přidáte otevřením jeho karty.");
      return;
    }

    openCard = await kt.getCard(id);
    renderCard();
    await refreshList();
    $("cardSaved").textContent = "Uloženo ✓" + seriesInfo;
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

  // Tlačítko se váže hned – nepřihlášenému se schová, odhlašovat nemá co.
  $("ktLogout").onclick = () => pageLogout($("ktLogout"), useDb ? DbKt._c() : null);

  const badge = $("storeBadge");
  if (useDb) {
    const session = await DbKt.session();
    if (!session) {
      $("lockedBox").classList.remove("hidden");
      $("mainBox").classList.add("hidden");
      $("ktLogout").classList.add("hidden");
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
