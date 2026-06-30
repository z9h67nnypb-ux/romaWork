// ---------------------------------------------------------------------------
// Hlavní logika prototypu rozvrhu.
// Data se čtou přes "provider" – buď mock (paměť), nebo Supabase.
// Front-end nezajímá, odkud data jsou; oba providery vrací stejný tvar.
// ---------------------------------------------------------------------------

const CFG = window.APP_CONFIG;

// ---------- Data provider: MOCK ----------
// Drží lekce v paměti napříč dny; každý navštívený den se jednou naplní
// ukázkovými daty, založené/upravené lekce zůstávají.
const MockProvider = {
  _all: [],
  _seeded: new Set(),
  _seq: 1,
  async getRooms() {
    return [...window.ROOMS].sort((a, b) => a.sort - b.sort);
  },
  async getLessons(date) {
    const key = dayKey(date);
    if (!this._seeded.has(key)) {
      // ID musí být unikátní napříč všemi dny (jinak by se pletlo mazání/úpravy)
      const seeded = window.buildMockLessons(date).map((l, idx) => ({ ...l, id: "mock-" + key + "-" + idx }));
      this._all.push(...seeded);
      this._seeded.add(key);
    }
    return this._all.filter((l) => sameDay(l.starts_at, date));
  },
  async updateLessonFields(id, fields) {
    const l = this._all.find((x) => x.id === id);
    if (l) Object.assign(l, fields);
  },
  async saveLesson(payload, id) {
    if (id) {
      const l = this._all.find((x) => x.id === id);
      if (l) Object.assign(l, payload);
      return l;
    }
    const l = Object.assign({ id: "mock-new-" + this._seq++ }, payload);
    this._all.push(l);
    return l;
  },
  async deleteLesson(id) {
    const i = this._all.findIndex((x) => x.id === id);
    if (i >= 0) this._all.splice(i, 1);
  },
};

// ---------- Data provider: SUPABASE ----------
const SupabaseProvider = {
  client: null,
  _init() {
    if (!this.client) {
      this.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    return this.client;
  },
  async getRooms() {
    const { data, error } = await this._init().from("rooms").select("*").order("sort");
    if (error) throw error;
    return data;
  },
  async getLessons(date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const { data, error } = await this._init()
      .from("lesson_details")
      .select("*")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at");
    if (error) throw error;
    // Převést ISO řetězce na Date objekty (jako u mocku)
    return data.map((l) => ({
      ...l,
      starts_at: new Date(l.starts_at),
      ends_at: new Date(l.ends_at),
    }));
  },
  // Částečná úprava (lektor): jen sloupce v tabulce lessons.
  async updateLessonFields(id, fields) {
    const { error } = await this._init().from("lessons").update(fields).eq("id", id);
    if (error) throw error;
  },
  // Najde lektora podle jména, nebo ho založí. Vrátí id.
  async _resolveLector(name) {
    if (!name) return null;
    const c = this._init();
    const { data } = await c.from("lectors").select("id").eq("name", name).limit(1);
    if (data && data.length) return data[0].id;
    const { data: ins, error } = await c.from("lectors").insert({ name }).select("id").single();
    if (error) throw error;
    return ins.id;
  },
  async _resolveStudent(name) {
    if (!name) return null;
    const c = this._init();
    const { data } = await c.from("students").select("id").eq("name", name).limit(1);
    if (data && data.length) return data[0].id;
    const { data: ins, error } = await c.from("students").insert({ name }).select("id").single();
    if (error) throw error;
    return ins.id;
  },
  // Plné založení / úprava lekce (administrátor).
  async saveLesson(payload, id) {
    const c = this._init();
    const lector_id = await this._resolveLector(payload.lector_name);
    const row = {
      starts_at: payload.starts_at.toISOString(),
      ends_at: payload.ends_at.toISOString(),
      subject: payload.subject,
      room_id: payload.room_id || null,
      lector_id,
      mode: payload.mode,
      status: payload.status,
      done: payload.done,
      description: payload.description,
    };
    let lessonId = id;
    if (id) {
      const { error } = await c.from("lessons").update(row).eq("id", id);
      if (error) throw error;
      await c.from("attendance").delete().eq("lesson_id", id);
    } else {
      const { data, error } = await c.from("lessons").insert(row).select("id").single();
      if (error) throw error;
      lessonId = data.id;
    }
    // Žák (prototyp počítá s jedním jménem; skupinu lze rozšířit)
    if (payload.student_names) {
      const student_id = await this._resolveStudent(payload.student_names);
      await c.from("attendance").insert({ lesson_id: lessonId, student_id });
    }
    return { id: lessonId };
  },
  async deleteLesson(id) {
    const { error } = await this._init().from("lessons").delete().eq("id", id);
    if (error) throw error;
  },
};

const provider = CFG.USE_SUPABASE ? SupabaseProvider : MockProvider;

// ---------- Přihlášení ----------
// MOCK: kontroluje proti DEMO_USERS, session drží v sessionStorage.
const MockAuth = {
  async signIn(email, password) {
    const u = (CFG.DEMO_USERS || []).find((x) => x.email === email && x.password === password);
    if (!u) throw new Error("Neplatný e-mail nebo heslo.");
    const user = { email: u.email, name: u.name, role: u.role };
    sessionStorage.setItem("poradys_user", JSON.stringify(user));
    return user;
  },
  async current() {
    const s = sessionStorage.getItem("poradys_user");
    return s ? JSON.parse(s) : null;
  },
  async signOut() { sessionStorage.removeItem("poradys_user"); },
};

// SUPABASE: skutečné přihlášení e-mailem/heslem, role z tabulky profiles.
const SupabaseAuth = {
  async signIn(email, password) {
    const c = SupabaseProvider._init();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return await this._profile(c, data.user);
  },
  async current() {
    const c = SupabaseProvider._init();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    return await this._profile(c, data.session.user);
  },
  async _profile(c, user) {
    const { data } = await c.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
    return { email: user.email, name: (data && data.name) || user.email, role: (data && data.role) || "lektor" };
  },
  async signOut() { await SupabaseProvider._init().auth.signOut(); },
};

const auth = CFG.USE_SUPABASE ? SupabaseAuth : MockAuth;

// ---------- Stav ----------
const state = {
  date: new Date(),
  miniMonth: new Date(),
  view: "den",
  roomFilter: null, // null = vše
  user: null, // { email, name, role }
  rooms: [],
  lessons: [],
  openLessonId: null,
  selection: new Set(), // id vybraných lekcí (admin)
  clipboard: [], // zkopírované lekce (admin)
};

function isAdmin() { return state.user && state.user.role === "admin"; }

// ---------- Pomocné funkce ----------
function dayKey(d) { return d.toISOString().slice(0, 10); }
function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(d) { return d.getHours() + ":" + pad(d.getMinutes()); }
function fmtRange(a, b) { return fmtTime(a) + " – " + fmtTime(b); }

const DOW = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
const DAYS_FULL = ["Neděle","Pondělí","Úterý","Středa","Čtvrtek","Pátek","Sobota"];

function fmtDateLong(d) {
  return DAYS_FULL[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function roomById(id) { return state.rooms.find((r) => r.id === id); }

// Překrývají se intervaly [aS,aE) a [bS,bE)?
function overlaps(aS, aE, bS, bE) { return aS < bE && bS < aE; }

// Najde v daném seznamu lekci, která koliduje (stejná místnost + překryv času).
// Online lekce (bez místnosti) se nekontrolují.
function findConflict(dayLessons, roomId, start, end, excludeId) {
  if (!roomId) return null;
  return dayLessons.find(
    (l) => l.id !== excludeId && l.room_id === roomId && overlaps(start, end, l.starts_at, l.ends_at)
  );
}

let _toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), 3000);
}

const STATUS_LABELS = {
  planned: "Naplánováno",
  done: "Odučeno (done)",
  cancelled: "Zrušeno",
  no_show: "Nedorazil",
};

// ---------- Načtení a vykreslení ----------
async function refresh() {
  state.lessons = await provider.getLessons(state.date);
  renderLegend();
  renderMiniCalendar();
  renderToolbar();
  renderView();
}

function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = "";
  const all = document.createElement("div");
  all.className = "chip all" + (state.roomFilter === null ? " active" : "");
  all.textContent = "Vše";
  all.onclick = () => { state.roomFilter = null; renderLegend(); renderView(); };
  el.appendChild(all);

  state.rooms.forEach((r) => {
    const c = document.createElement("div");
    c.className = "chip" + (state.roomFilter === r.id ? " active" : "");
    c.style.background = r.color;
    c.textContent = r.name;
    c.title = r.name;
    c.onclick = () => {
      state.roomFilter = state.roomFilter === r.id ? null : r.id;
      renderLegend();
      renderView();
    };
    el.appendChild(c);
  });
}

function renderMiniCalendar() {
  const el = document.getElementById("miniCalendar");
  const mm = state.miniMonth;
  const first = new Date(mm.getFullYear(), mm.getMonth(), 1);
  // pondělí = 0
  let offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const today = new Date();

  let html = '<div class="mini-head">';
  html += '<button id="miniPrev">◀</button>';
  html += '<span class="m-title">' + MONTHS[mm.getMonth()] + " " + mm.getFullYear() + "</span>";
  html += '<button id="miniNext">▶</button></div>';
  html += '<div class="mini-grid">';
  DOW.forEach((d) => (html += '<div class="dow">' + d + "</div>"));

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    let cls = "day";
    if (d.getMonth() !== mm.getMonth()) cls += " other";
    if (sameDay(d, today)) cls += " today";
    if (sameDay(d, state.date)) cls += " selected";
    html += '<div class="' + cls + '" data-date="' + dayKey(d) + '">' + d.getDate() + "</div>";
  }
  html += "</div>";
  el.innerHTML = html;

  el.querySelector("#miniPrev").onclick = () => {
    state.miniMonth = new Date(mm.getFullYear(), mm.getMonth() - 1, 1);
    renderMiniCalendar();
  };
  el.querySelector("#miniNext").onclick = () => {
    state.miniMonth = new Date(mm.getFullYear(), mm.getMonth() + 1, 1);
    renderMiniCalendar();
  };
  el.querySelectorAll(".day").forEach((cell) => {
    cell.onclick = () => {
      const [y, m, day] = cell.dataset.date.split("-").map(Number);
      state.date = new Date(y, m - 1, day);
      clearSelection();
      refresh();
    };
  });
}

function renderToolbar() {
  document.getElementById("navDate").textContent = fmtDateLong(state.date);
  document.getElementById("newLessonBtn").classList.toggle("hidden", !isAdmin());
  document.getElementById("selectAllBtn").classList.toggle("hidden", !isAdmin());
  document.querySelectorAll(".view-tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

function renderView() {
  const c = document.getElementById("viewContainer");
  if (state.view === "den") c.innerHTML = "", c.appendChild(buildDayView());
  else if (state.view === "agenda") c.innerHTML = "", c.appendChild(buildAgenda());
  else c.innerHTML = '<div class="placeholder">Pohled „' + state.view + '" je v prototypu zatím jen jako náhled. Hlavní je denní rozvrh.</div>';
}

function visibleRooms() {
  return state.roomFilter ? state.rooms.filter((r) => r.id === state.roomFilter) : state.rooms;
}

function buildDayView() {
  const wrap = document.createElement("div");
  wrap.className = "day-scroll";
  const grid = document.createElement("div");
  grid.className = "day-grid";

  const hours = CFG.DAY_END_HOUR - CFG.DAY_START_HOUR;
  const bodyH = hours * CFG.HOUR_HEIGHT;
  const lineCss =
    "repeating-linear-gradient(to bottom, transparent 0, transparent " +
    (CFG.HOUR_HEIGHT - 1) + "px, var(--line) " + (CFG.HOUR_HEIGHT - 1) +
    "px, var(--line) " + CFG.HOUR_HEIGHT + "px)";

  // Sloupec s časy
  const timeCol = document.createElement("div");
  timeCol.className = "col time";
  timeCol.innerHTML = '<div class="col-head"></div>';
  const timeBody = document.createElement("div");
  timeBody.className = "col-body";
  timeBody.style.height = bodyH + "px";
  for (let h = CFG.DAY_START_HOUR; h <= CFG.DAY_END_HOUR; h++) {
    const lbl = document.createElement("div");
    lbl.className = "time-label";
    lbl.style.top = (h - CFG.DAY_START_HOUR) * CFG.HOUR_HEIGHT + "px";
    lbl.textContent = h + ":00";
    timeBody.appendChild(lbl);
  }
  timeCol.appendChild(timeBody);
  grid.appendChild(timeCol);

  // Sloupce učeben
  visibleRooms().forEach((room) => {
    const col = document.createElement("div");
    col.className = "col";
    const head = document.createElement("div");
    head.className = "col-head";
    head.style.background = room.color;
    head.textContent = room.name;
    col.appendChild(head);

    const body = document.createElement("div");
    body.className = "col-body" + (isAdmin() ? " admin" : "");
    body.style.height = bodyH + "px";
    body.style.background = lineCss;

    state.lessons
      .filter((l) => l.room_id === room.id)
      .forEach((l) => body.appendChild(buildEvent(l, room)));

    col.appendChild(body);
    grid.appendChild(col);
  });

  wrap.appendChild(grid);
  if (isAdmin()) setupBoxSelect(wrap);
  return wrap;
}

// Výběr lekcí tažením myši přes prázdnou plochu rozvrhu (jen admin).
function setupBoxSelect(wrap) {
  wrap.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".event")) return; // klik na lekci řeší buildEvent
    const startX = e.clientX, startY = e.clientY;
    let rect = null;
    const additive = e.ctrlKey || e.metaKey;

    const onMove = (me) => {
      const dx = Math.abs(me.clientX - startX), dy = Math.abs(me.clientY - startY);
      if (!rect && dx + dy > 4) {
        rect = document.createElement("div");
        rect.className = "select-rect";
        document.body.appendChild(rect);
      }
      if (rect) {
        const x = Math.min(startX, me.clientX), y = Math.min(startY, me.clientY);
        rect.style.left = x + "px";
        rect.style.top = y + "px";
        rect.style.width = Math.abs(me.clientX - startX) + "px";
        rect.style.height = Math.abs(me.clientY - startY) + "px";
      }
    };

    const onUp = (ue) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!rect) {
        // jen kliknutí do prázdna = zrušit výběr
        if (!additive) { state.selection.clear(); renderView(); }
        return;
      }
      const box = { l: Math.min(startX, ue.clientX), r: Math.max(startX, ue.clientX), t: Math.min(startY, ue.clientY), b: Math.max(startY, ue.clientY) };
      rect.remove();
      if (!additive) state.selection.clear();
      wrap.querySelectorAll(".event").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < box.r && r.right > box.l && r.top < box.b && r.bottom > box.t) {
          state.selection.add(el.dataset.id);
        }
      });
      renderView();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function clearSelection() {
  if (state.selection.size) { state.selection.clear(); }
}

// Vybere všechny lekce zobrazeného dne (jen admin).
function selectAllDay() {
  if (!isAdmin()) return;
  state.selection = new Set(state.lessons.map((l) => l.id));
  renderView();
  toast("Vybráno " + state.selection.size + " lekcí.");
}

function buildEvent(l, room) {
  const startMin = l.starts_at.getHours() * 60 + l.starts_at.getMinutes();
  const endMin = l.ends_at.getHours() * 60 + l.ends_at.getMinutes();
  const top = ((startMin - CFG.DAY_START_HOUR * 60) / 60) * CFG.HOUR_HEIGHT;
  const height = Math.max(18, ((endMin - startMin) / 60) * CFG.HOUR_HEIGHT - 2);

  const ev = document.createElement("div");
  ev.className =
    "event" +
    (l.done ? " is-done" : "") +
    (l.status === "cancelled" ? " is-cancelled" : "") +
    (state.selection.has(l.id) ? " selected" : "");
  ev.dataset.id = l.id;
  ev.style.top = top + "px";
  ev.style.height = height + "px";
  ev.style.background = room.color;

  const sub = [l.subject && l.subject !== "—" ? l.subject : null, l.lector_name].filter(Boolean).join(" · ");
  ev.innerHTML =
    '<div class="e-time">' + fmtRange(l.starts_at, l.ends_at) + "</div>" +
    '<div class="e-title">' + escapeHtml(l.student_names || "") + "</div>" +
    (sub ? '<div class="e-sub">' + escapeHtml(sub) + "</div>" : "") +
    (l.mode === "online" ? '<span class="e-badge">ONLINE</span>' : "");

  if (isAdmin()) {
    // Admin: klik = výběr (Ctrl/⌘ přidává), dvojklik = úprava.
    ev.onclick = (e) => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        if (state.selection.has(l.id)) state.selection.delete(l.id);
        else state.selection.add(l.id);
      } else {
        state.selection.clear();
        state.selection.add(l.id);
      }
      renderView();
    };
    ev.ondblclick = (e) => { e.stopPropagation(); openDetail(l.id); };
  } else {
    // Lektor: klik otevře detail (zápis popisu / potvrzení).
    ev.onclick = () => openDetail(l.id);
  }
  return ev;
}

function buildAgenda() {
  const wrap = document.createElement("div");
  wrap.className = "agenda";
  const lessons = state.lessons
    .filter((l) => !state.roomFilter || l.room_id === state.roomFilter)
    .slice()
    .sort((a, b) => a.starts_at - b.starts_at);

  if (!lessons.length) {
    wrap.innerHTML = '<div class="placeholder">Žádné lekce pro tento den.</div>';
    return wrap;
  }
  lessons.forEach((l) => {
    const room = roomById(l.room_id);
    const row = document.createElement("div");
    row.className = "agenda-row";
    row.innerHTML =
      '<span class="dot" style="background:' + (room ? room.color : "#999") + '"></span>' +
      '<span class="a-time">' + fmtRange(l.starts_at, l.ends_at) + "</span>" +
      '<span class="a-main"><b>' + escapeHtml(l.student_names || "") + "</b> – " +
      escapeHtml([l.subject, l.lector_name].filter((x) => x && x !== "—").join(", ")) +
      " <span style='color:#999'>(" + (room ? room.name : "") + ")</span></span>" +
      '<span class="a-status">' + (STATUS_LABELS[l.status] || l.status) + (l.done ? " ✓" : "") + "</span>";
    row.onclick = () => openDetail(l.id);
    wrap.appendChild(row);
  });
  return wrap;
}

// ---------- Detail panel ----------
function metaRow(k, v) {
  return '<div class="meta-row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
}
function statusOptions(sel) {
  return Object.keys(STATUS_LABELS)
    .map((k) => '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>")
    .join("");
}
function roomOptions(sel) {
  return '<option value="">— bez místnosti (online) —</option>' +
    state.rooms.map((r) => '<option value="' + r.id + '"' + (r.id === sel ? " selected" : "") + ">" + escapeHtml(r.name) + "</option>").join("");
}
function dateVal(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function timeVal(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

// Otevření existující lekce
function openDetail(id) {
  const l = state.lessons.find((x) => x.id === id);
  if (!l) return;
  state.openLessonId = id;
  if (isAdmin()) renderAdminForm(l, "Detail lekce");
  else renderLektorForm(l);
  showPanel();
}

// Admin: nová lekce
function openCreate() {
  state.openLessonId = null;
  const base = new Date(state.date);
  base.setHours(8, 0, 0, 0);
  const end = new Date(base); end.setHours(9, 0, 0, 0);
  renderAdminForm(
    { starts_at: base, ends_at: end, room_id: "", lector_name: "", subject: "", student_names: "", mode: "offline", status: "planned", done: false, description: "" },
    "Nová lekce"
  );
  showPanel();
}

// Formulář pro administrátora (plná editace)
function renderAdminForm(l, title) {
  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailBody").innerHTML =
    '<div class="field-row">' +
      field("Datum", '<input type="date" id="fDate" value="' + dateVal(l.starts_at) + '">') +
    "</div>" +
    '<div class="field-row">' +
      field("Začátek", '<input type="time" id="fStart" value="' + timeVal(l.starts_at) + '">') +
      field("Konec", '<input type="time" id="fEnd" value="' + timeVal(l.ends_at) + '">') +
    "</div>" +
    field("Místnost / stůl", '<select id="fRoom">' + roomOptions(l.room_id) + "</select>") +
    field("Žák", '<input type="text" id="fStudent" value="' + escapeHtml(l.student_names || "") + '">') +
    field("Lektor", '<input type="text" id="fLector" value="' + escapeHtml(l.lector_name || "") + '">') +
    '<div class="field-row">' +
      field("Předmět", '<input type="text" id="fSubject" value="' + escapeHtml(l.subject || "") + '">') +
      field("Režim", '<select id="fMode"><option value="offline"' + (l.mode !== "online" ? " selected" : "") + ">Offline</option><option value=\"online\"" + (l.mode === "online" ? " selected" : "") + ">Online</option></select>") +
    "</div>" +
    field("Stav", '<select id="fStatus">' + statusOptions(l.status) + "</select>") +
    '<label class="check"><input type="checkbox" id="fDone"' + (l.done ? " checked" : "") + "> Odučeno</label>" +
    field("Popis – co se dělalo", '<textarea id="fDesc">' + escapeHtml(l.description || "") + "</textarea>");

  document.getElementById("detailDelete").classList.toggle("hidden", !state.openLessonId);
  document.getElementById("detailSaved").textContent = "";
}

// Formulář pro lektora (jen popis + potvrzení)
function renderLektorForm(l) {
  const room = roomById(l.room_id);
  document.getElementById("detailTitle").textContent = l.student_names || "Lekce";
  document.getElementById("detailBody").innerHTML =
    '<div class="role-note">Jako lektor můžeš zapsat popis a potvrdit, že lekce proběhla. Změny rozvrhu dělá administrátor.</div>' +
    metaRow("Předmět", escapeHtml(l.subject || "—")) +
    metaRow("Lektor", escapeHtml(l.lector_name || "—")) +
    metaRow("Místnost", room ? escapeHtml(room.name) : "—") +
    metaRow("Čas", fmtRange(l.starts_at, l.ends_at)) +
    metaRow("Stav", STATUS_LABELS[l.status] || l.status) +
    '<label class="check"><input type="checkbox" id="fDone"' + (l.done ? " checked" : "") + "> Lekce proběhla (potvrzuji)</label>" +
    field("Popis – co se na lekci dělalo", '<textarea id="fDesc" placeholder="Např.: Procvičili jsme kvadratické rovnice, zadán domácí úkol…">' + escapeHtml(l.description || "") + "</textarea>");

  document.getElementById("detailDelete").classList.add("hidden");
  document.getElementById("detailSaved").textContent = "";
}

function field(label, inner) {
  return '<div class="field"><label>' + label + "</label>" + inner + "</div>";
}

function showPanel() {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("detailPanel").classList.remove("hidden");
}
function closeDetail() {
  state.openLessonId = null;
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("detailPanel").classList.add("hidden");
}

async function saveDetail() {
  const btn = document.getElementById("detailSave");
  const saved = document.getElementById("detailSaved");
  btn.disabled = true;
  try {
    if (isAdmin()) {
      const [sh, sm] = document.getElementById("fStart").value.split(":").map(Number);
      const [eh, em] = document.getElementById("fEnd").value.split(":").map(Number);
      const [y, mo, d] = document.getElementById("fDate").value.split("-").map(Number);
      const starts = new Date(y, mo - 1, d, sh, sm);
      const ends = new Date(y, mo - 1, d, eh, em);
      if (ends <= starts) { saved.textContent = "Konec musí být po začátku."; btn.disabled = false; return; }
      const roomId = document.getElementById("fRoom").value || null;
      // Kontrola překryvu: stejná místnost + překrývající se čas v daném dni.
      const dayLessons = await provider.getLessons(starts);
      const conflict = findConflict(dayLessons, roomId, starts, ends, state.openLessonId);
      if (conflict) {
        saved.textContent = "Kolize: v této místnosti už je lekce " + fmtRange(conflict.starts_at, conflict.ends_at) + ".";
        btn.disabled = false;
        return;
      }
      const payload = {
        starts_at: starts,
        ends_at: ends,
        room_id: roomId,
        student_names: document.getElementById("fStudent").value.trim(),
        lector_name: document.getElementById("fLector").value.trim(),
        subject: document.getElementById("fSubject").value.trim(),
        mode: document.getElementById("fMode").value,
        status: document.getElementById("fStatus").value,
        done: document.getElementById("fDone").checked,
        description: document.getElementById("fDesc").value,
      };
      await provider.saveLesson(payload, state.openLessonId);
      state.date = new Date(starts); // přepni na den lekce, ať je vidět
    } else {
      const id = state.openLessonId;
      if (!id) return;
      const done = document.getElementById("fDone").checked;
      const fields = { done, description: document.getElementById("fDesc").value };
      const cur = state.lessons.find((x) => x.id === id);
      if (done && cur && cur.status === "planned") fields.status = "done";
      await provider.updateLessonFields(id, fields);
    }
    saved.textContent = "Uloženo ✓";
    await refresh();
    closeDetail();
  } catch (e) {
    saved.textContent = "Chyba: " + (e.message || e);
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function deleteDetail() {
  const id = state.openLessonId;
  if (!id) return;
  if (!confirm("Opravdu smazat tuto lekci?")) return;
  try {
    await provider.deleteLesson(id);
    await refresh();
    closeDetail();
  } catch (e) {
    document.getElementById("detailSaved").textContent = "Chyba: " + (e.message || e);
    console.error(e);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Kopírování / vkládání (admin) ----------
function copySelection() {
  if (!isAdmin() || !state.selection.size) return;
  state.clipboard = state.lessons
    .filter((l) => state.selection.has(l.id))
    .map((l) => ({
      room_id: l.room_id,
      sh: l.starts_at.getHours(), sm: l.starts_at.getMinutes(),
      eh: l.ends_at.getHours(), em: l.ends_at.getMinutes(),
      subject: l.subject, lector_name: l.lector_name,
      student_names: l.student_names, mode: l.mode,
    }));
  toast("Zkopírováno " + state.clipboard.length + " lekcí. Přepni den a stiskni Ctrl/⌘+V.");
}

async function pasteClipboard() {
  if (!isAdmin() || !state.clipboard.length) return;
  const dayLessons = await provider.getLessons(state.date);
  const placed = [...dayLessons]; // ať kolize hlídáme i mezi vkládanými
  let added = 0, skipped = 0;
  for (const t of state.clipboard) {
    const y = state.date.getFullYear(), mo = state.date.getMonth(), d = state.date.getDate();
    const starts = new Date(y, mo, d, t.sh, t.sm);
    const ends = new Date(y, mo, d, t.eh, t.em);
    if (findConflict(placed, t.room_id, starts, ends, null)) { skipped++; continue; }
    const payload = {
      starts_at: starts, ends_at: ends, room_id: t.room_id,
      student_names: t.student_names, lector_name: t.lector_name,
      subject: t.subject, mode: t.mode, status: "planned", done: false, description: "",
    };
    const res = await provider.saveLesson(payload, null);
    placed.push({ id: (res && res.id) || "tmp", room_id: t.room_id, starts_at: starts, ends_at: ends });
    added++;
  }
  await refresh();
  toast("Vloženo " + added + (skipped ? ", přeskočeno " + skipped + " kvůli kolizi" : "") + ".");
}

async function deleteSelection() {
  if (!isAdmin() || !state.selection.size) return;
  const n = state.selection.size;
  if (!confirm("Smazat vybrané lekce (" + n + ")?")) return;
  for (const id of state.selection) await provider.deleteLesson(id);
  state.selection.clear();
  await refresh();
  toast("Smazáno " + n + " lekcí.");
}

function onKeyDown(e) {
  if (!isAdmin()) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // neruš psaní
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "a") { e.preventDefault(); selectAllDay(); }
  else if (ctrl && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); }
  else if (ctrl && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
  else if (e.key === "Escape") { state.selection.clear(); renderView(); }
}

// ---------- Přihlašovací obrazovka ----------
function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  if (!CFG.USE_SUPABASE) {
    const h = document.getElementById("loginHint");
    h.classList.remove("hidden");
    h.innerHTML = "Demo účty:<br>admin@poradys.cz / admin123 (administrátor)<br>kunkelova@poradys.cz / lektor123 (lektor)";
  }
}
function hideLogin() { document.getElementById("loginScreen").classList.add("hidden"); }

async function onLogin(e) {
  e.preventDefault();
  const err = document.getElementById("loginError");
  err.textContent = "";
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  try {
    const user = await auth.signIn(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );
    hideLogin();
    await startApp(user);
  } catch (e2) {
    err.textContent = e2.message || String(e2);
  } finally {
    btn.disabled = false;
  }
}

async function onLogout() {
  await auth.signOut();
  state.user = null;
  state.selection.clear();
  state.clipboard = [];
  location.reload();
}

function renderUserBadge() {
  const b = document.getElementById("userBadge");
  if (!state.user) { b.textContent = ""; return; }
  b.innerHTML = escapeHtml(state.user.name) + ' <span class="role">(' + (isAdmin() ? "administrátor" : "lektor") + ")</span>";
  document.getElementById("adminHint").classList.toggle("hidden", !isAdmin());
}

// ---------- Inicializace ----------
async function init() {
  document.getElementById("loginForm").onsubmit = onLogin;
  document.getElementById("logoutBtn").onclick = onLogout;

  const u = await auth.current();
  if (u) await startApp(u);
  else showLogin();
}

let _appWired = false;
async function startApp(user) {
  state.user = user;
  renderUserBadge();

  if (!CFG.USE_SUPABASE) document.getElementById("banner").classList.remove("hidden");
  state.rooms = await provider.getRooms();

  if (!_appWired) {
    _appWired = true;
    const goRefresh = () => { clearSelection(); refresh(); };
    document.getElementById("prevDay").onclick = () => { state.date.setDate(state.date.getDate() - 1); state.date = new Date(state.date); goRefresh(); };
    document.getElementById("nextDay").onclick = () => { state.date.setDate(state.date.getDate() + 1); state.date = new Date(state.date); goRefresh(); };
    document.getElementById("todayBtn").onclick = () => { state.date = new Date(); state.miniMonth = new Date(); goRefresh(); };
    document.querySelectorAll(".view-tabs button").forEach((b) => {
      b.onclick = () => { state.view = b.dataset.view; clearSelection(); renderToolbar(); renderView(); };
    });
    document.getElementById("overlay").onclick = closeDetail;
    document.getElementById("detailClose").onclick = closeDetail;
    document.getElementById("detailSave").onclick = saveDetail;
    document.getElementById("detailDelete").onclick = deleteDetail;
    document.getElementById("newLessonBtn").onclick = openCreate;
    document.getElementById("selectAllBtn").onclick = selectAllDay;
    document.addEventListener("keydown", onKeyDown);
  }

  await refresh();
}

window.addEventListener("DOMContentLoaded", init);
