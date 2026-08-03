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
  async getLessonsRange(start, end) {
    const out = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      out.push(...await this.getLessons(new Date(d)));
    }
    return out;
  },
  async updateLessonFields(id, fields) {
    const l = this._all.find((x) => x.id === id);
    if (l) Object.assign(l, fields);
  },
  async saveLesson(payload, id) {
    // Nový klient z rozvrhu se v ukázkovém režimu přidá do seznamu klientů,
    // ať se chová stejně jako v ostré verzi (propíše se do kartotéky).
    if (payload.student_names && !window.MOCK_CLIENTS.some((s) => s.name === payload.student_names)) {
      window.MOCK_CLIENTS.push(Object.assign(
        { id: "c-" + this._seq++, name: payload.student_names, status: "active" },
        payload.student_fields || {}
      ));
    }
    const client = window.MOCK_CLIENTS.find((s) => s.name === payload.student_names);
    const enriched = Object.assign({}, payload, {
      student_phone: (client && client.phone) || "",
      student_grade: (client && client.grade) || "",
      student_category: (client && client.category) || "",
    });
    if (id) {
      const l = this._all.find((x) => x.id === id);
      if (l) Object.assign(l, enriched);
      return l;
    }
    const l = Object.assign({ id: "mock-new-" + this._seq++ }, enriched);
    this._all.push(l);
    return l;
  },
  async deleteLesson(id) {
    const i = this._all.findIndex((x) => x.id === id);
    if (i >= 0) this._all.splice(i, 1);
  },
  async getStudents() { return window.MOCK_CLIENTS.slice(); },
  // Součet potvrzených (done) lekcí za měsíc po lektorech.
  // Nejdřív doseje všechny dny měsíce, aby výkaz nezávisel na tom,
  // které dny už uživatel navštívil. month je 0-based (jako v JS Date).
  async getMonthlyHours(year, month) {
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) await this.getLessons(new Date(year, month, d));
    const map = new Map();
    this._all.forEach((l) => {
      if (!l.done) return;
      if (l.starts_at.getFullYear() !== year || l.starts_at.getMonth() !== month) return;
      const key = l.lector_name || "(bez lektora)";
      const cur = map.get(key) || { hours: 0, lessons: 0 };
      cur.hours += (l.ends_at - l.starts_at) / 3600000;
      cur.lessons += 1;
      map.set(key, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ lector_name: name, lessons: v.lessons, hours: Math.round(v.hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours);
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
    return this.getLessonsRange(start, end);
  },
  // Celý rozsah jedním dotazem – export měsíce by jinak poslal 31 requestů
  // za sebou a appka by při něm viditelně stála.
  async getLessonsRange(start, end) {
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
  async getStudents() {
    const { data, error } = await this._init().from("students")
      .select("id, name, phone, grade, category, payment_method, status").order("name");
    if (error) throw error;
    return data;
  },
  // Najde klienta podle jména, nebo ho založí. `fields` jsou údaje z rozvrhu
  // (kategorie, třída, telefon, platba) – propíšou se rovnou do kartotéky.
  async _resolveStudent(name, fields) {
    if (!name) return null;
    const c = this._init();
    const { data } = await c.from("students").select("id").eq("name", name).limit(1);
    if (data && data.length) return data[0].id;
    const { data: ins, error } = await c.from("students")
      .insert(Object.assign({ name, status: "active" }, fields || {})).select("id").single();
    if (error) throw error;
    return ins.id;
  },
  // Plné založení / úprava lekce (administrátor).
  async saveLesson(payload, id) {
    const c = this._init();
    const lector_id = await this._resolveLector(payload.lector_name);
    const row = {
      kind: payload.kind || "lesson",
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
      const student_id = await this._resolveStudent(payload.student_names, payload.student_fields);
      await c.from("attendance").insert({ lesson_id: lessonId, student_id });
    }
    return { id: lessonId };
  },
  async deleteLesson(id) {
    const { error } = await this._init().from("lessons").delete().eq("id", id);
    if (error) throw error;
  },
  // Čte pohled lector_monthly_hours (plněný triggerem z work_log).
  // month je 0-based (JS Date), pohled používá 1-based.
  async getMonthlyHours(year, month) {
    const { data, error } = await this._init()
      .from("lector_monthly_hours")
      .select("*")
      .eq("year", year)
      .eq("month", month + 1)
      .order("hours", { ascending: false });
    if (error) throw error;
    return data;
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
  // Vždy se zobrazuje jen jeden režim, ať se online a prezenční lekce
  // nemíchají v jednom sloupci ("all" z dřívějška spadne na 'offline').
  modeFilter: sessionStorage.getItem("poradys_mode") === "online" ? "online" : "offline",
  user: null, // { email, name, role }
  rooms: [],
  lessons: [],
  openLessonId: null,
  students: [], // klienti z kartotéky (telefon, ročník, kategorie)
  selection: new Set(), // id vybraných lekcí (admin)
  clipboard: [], // zkopírované lekce (admin)
  hourH: null, // výška hodiny; dopočítá se z okna a drží se do změny dne/okna
};

function isAdmin() { return state.user && state.user.role === "admin"; }

// Klienti z kartotéky – rozvrh z nich bere telefon a ročník k lekci
// a našeptává jména, ať nevznikají překlepy a duplicitní karty.
async function loadStudents() {
  try { state.students = await provider.getStudents(); }
  catch (e) { console.error(e); state.students = []; }
  const dl = document.getElementById("studentsList");
  if (dl) {
    dl.innerHTML = state.students
      .filter((s) => s.status !== "former")
      .map((s) => '<option value="' + escapeHtml(s.name) + '">').join("");
  }
}

// ---------- Pomocné funkce ----------
// Klíč dne z lokálních složek data. Dřívější toISOString() převádělo na UTC,
// takže v letním čase (UTC+2) nesla buňka mini kalendáře datum o den posunuté
// a klik vybíral jiný den, než na který uživatel mířil.
function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
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

// Řádek rozvrhu je buď lekce, nebo směna lektora u stolu (kdo tu dnes je).
function isShift(l) { return l.kind === "shift"; }
function isLesson(l) { return !isShift(l); }

// Najde v daném seznamu lekci, která koliduje (stejná místnost + překryv času).
// Online lekce (bez místnosti) se nekontrolují. Směny se nekontrolují vůbec –
// lekce se naopak mají zakládat uvnitř směny lektora.
function findConflict(dayLessons, roomId, start, end, excludeId) {
  if (!roomId) return null;
  return dayLessons.find(
    (l) => l.id !== excludeId && isLesson(l) && l.room_id === roomId && overlaps(start, end, l.starts_at, l.ends_at)
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
// Načtení dne. Když spojení selže (uspaný projekt, výpadek sítě), nesmí
// zůstat prázdná stránka bez vysvětlení – ukážeme chybu a tlačítko Zkusit znovu.
async function refresh() {
  try {
    state.lessons = await provider.getLessons(state.date);
  } catch (e) {
    console.error(e);
    document.getElementById("viewContainer").innerHTML =
      '<div class="placeholder">Data se nepodařilo načíst: ' + escapeHtml(e.message || e) +
      '<br><button id="retryBtn" class="primary-btn" style="margin-top:10px;padding:6px 14px;">Zkusit znovu</button></div>';
    const rb = document.getElementById("retryBtn");
    if (rb) rb.onclick = refresh;
    return;
  }
  invalidateLayout(); // jiný den = může přibýt/zmizet řádek se směnami
  renderRoomFilter();
  renderToolbar();
  renderView();
}

// Filtr učeben. Dřív to byla mřížka 17 barevných dlaždic přes celou hlavičku;
// jako rozbalovací seznam dělá totéž a nebere výšku, kterou potřebuje rozvrh.
// Barvu učebny stejně nese záhlaví sloupce, takže legenda nechybí.
function renderRoomFilter() {
  const sel = document.getElementById("roomSelect");
  sel.innerHTML = '<option value="">Vše</option>' +
    state.rooms.map((r) =>
      '<option value="' + escapeHtml(r.id) + '"' + (state.roomFilter === r.id ? " selected" : "") +
      ' style="color:' + r.color + '">' + escapeHtml(r.name) + "</option>"
    ).join("");
  sel.onchange = () => {
    state.roomFilter = sel.value || null;
    renderView();
  };
}

function renderLegend() {
  const el = document.getElementById("legend");
  if (!el) return; // denní rozvrh legendu už nemá, filtr je v rozbalovacím seznamu
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
      closeMiniCalendar();
      refresh();
    };
  });
}

// Mini kalendář je rozbalovací – otevře se kliknutím na datum v liště.
function toggleMiniCalendar() {
  const el = document.getElementById("miniCalendar");
  if (el.classList.contains("hidden")) {
    state.miniMonth = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    renderMiniCalendar();
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}
function closeMiniCalendar() {
  document.getElementById("miniCalendar").classList.add("hidden");
}

function renderToolbar() {
  document.getElementById("navDate").textContent = fmtDateLong(state.date);
  document.getElementById("newLessonBtn").classList.toggle("hidden", !isAdmin());
  document.getElementById("newShiftBtn").classList.toggle("hidden", !isAdmin());
  document.getElementById("selectAllBtn").classList.toggle("hidden", !isAdmin());
  // „Vše odučeno" má smysl jen na denním pohledu, kde je vidět, co se potvrzuje
  const doneAll = document.getElementById("doneAllBtn");
  doneAll.classList.toggle("hidden", !isAdmin() || state.view !== "den");
  const pending = isAdmin() ? pendingLessonsOfDay().length : 0;
  doneAll.textContent = pending ? "✓ Odučeno (" + pending + ")" : "✓ Odučeno";
  doneAll.disabled = !pending;
  document.getElementById("extendWeekBtn").classList.toggle("hidden", !isAdmin());
  document.getElementById("kartotekaBtn").classList.toggle("hidden", !isAdmin());
  document.getElementById("hoursBtn").classList.toggle("hidden", !isAdmin());
  document.querySelectorAll(".view-tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

// Výška hodiny se počítá ještě před vykreslením, takže se napoprvé netrefí
// (lišta se na úzkém okně teprve zalomí). Doměříme ji tedy jednou po vložení
// do DOM a VÝSLEDEK SI ULOŽÍME – jinak by se celá mřížka překreslovala dvakrát
// při každém kliknutí na lekci, což je přesně to, co appku sekalo.
// Znovu se počítá jen při změně dne (může přibýt/zmizet řádek se směnami)
// a při změně velikosti okna.
let _needsFit = false;

function ensureHourHeight(withShiftRow) {
  if (state.hourH == null) {
    state.hourH = computeHourHeight(withShiftRow);
    _needsFit = true;
  }
  return state.hourH;
}
function invalidateLayout() { state.hourH = null; }

function renderView() {
  const c = document.getElementById("viewContainer");
  if (state.view === "den") {
    c.innerHTML = "";
    c.appendChild(buildDayView());
    if (_needsFit) {
      _needsFit = false;
      requestAnimationFrame(() => {
        const grid = c.querySelector(".day-grid");
        if (!grid) return;
        const hours = CFG.DAY_END_HOUR - CFG.DAY_START_HOUR;
        const spare = window.innerHeight - grid.getBoundingClientRect().bottom - 8;
        if (Math.abs(spare) < 10) return;
        // korekce se dopočítá rovnou, žádné opakované přibližování
        const fixed = Math.max(24, Math.min(80, Math.round(state.hourH + spare / hours)));
        if (fixed === state.hourH) return;
        state.hourH = fixed;
        renderView();
      });
    }
  } else if (state.view === "agenda") { c.innerHTML = ""; c.appendChild(buildAgenda()); }
  else c.innerHTML = '<div class="placeholder">Pohled „' + state.view + '" je v prototypu zatím jen jako náhled. Hlavní je denní rozvrh.</div>';
}

function visibleRooms() {
  return state.roomFilter ? state.rooms.filter((r) => r.id === state.roomFilter) : state.rooms;
}

// Filtr podle dropdownu Prezenční/Online v toolbaru.
function matchesMode(l) {
  return (l.mode || "offline") === state.modeFilter;
}

// Výška jedné hodiny se dopočítá tak, aby se celý den (8–21) vešel do volné
// plochy pod lištami – rozvrh se pak celý vejde na jednu obrazovku bez
// svislého rolování. Na malých displejích má spodní mez (radši malý scroll
// než nečitelně nízké bloky); CFG.HOUR_HEIGHT je záloha, když nejde změřit.
function computeHourHeight(withShiftRow) {
  const hours = CFG.DAY_END_HOUR - CFG.DAY_START_HOUR;
  const vc = document.getElementById("viewContainer");
  if (!vc) return CFG.HOUR_HEIGHT;
  // Volná výška pod lištami = od horní hrany plochy po spodek okna.
  // Bereme pozici v okně (getBoundingClientRect), ne clientHeight – ta bývá
  // při stavbě ještě nedopočítaná (banner/hint se teprve srovnávají).
  const top = vc.getBoundingClientRect().top;
  const avail = window.innerHeight - top - 8;
  // záhlaví sloupců + okraje mřížky (+ řádek se směnami, když se zobrazuje)
  const OVERHEAD = 40 + (withShiftRow ? shiftRowHeight() + 1 : 0);
  const fit = Math.floor((avail - OVERHEAD) / hours);
  return Math.max(24, Math.min(fit, 80));
}

// Ve sloupci je málo místa, tak celé hodiny píšeme bez ":00" (8–12, 12:30–17).
function fmtHourShort(d) {
  return d.getMinutes() ? d.getHours() + ":" + pad(d.getMinutes()) : String(d.getHours());
}

// Směny zobrazeného dne pro daný stůl.
function shiftsOf(roomId) {
  return state.lessons
    .filter((l) => isShift(l) && l.room_id === roomId && matchesMode(l))
    .sort((a, b) => a.starts_at - b.starts_at);
}
function dayHasShifts() {
  return state.lessons.some((l) => isShift(l) && matchesMode(l));
}

// Nejvíc směn u jednoho stolu – podle toho je řádek vysoký ve všech sloupcích.
// Stejná výška je nutná, jinak by se sloupce svisle rozjely proti časové ose.
function maxShiftsPerRoom() {
  return visibleRooms().reduce((m, r) => Math.max(m, shiftsOf(r.id).length), 0);
}
const SHIFT_CHIP_H = 16; // výška jednoho řádku se jménem lektora (px)
function shiftRowHeight() {
  const n = Math.min(maxShiftsPerRoom(), 4); // víc než 4 lektory u stolu = rolování
  return n ? n * SHIFT_CHIP_H + 5 : 0;
}

// Řádek pod názvem stolu: „Kunkelová 8–13 / Šíma 13–17".
// Když v daném dni není ani jedna směna, řádek se nikde nevykreslí; jinak ho
// dostanou VŠECHNY sloupce (i prázdné), aby zůstaly stejně vysoké.
function buildShiftRow(room) {
  const row = document.createElement("div");
  row.className = "shift-row";
  row.style.height = shiftRowHeight() + "px";
  if (!room) return row; // sloupec s časy – jen drží výšku

  shiftsOf(room.id).forEach((s) => {
    const label = (s.lector_name || "?") + " " + fmtHourShort(s.starts_at) + "–" + fmtHourShort(s.ends_at);
    const chip = document.createElement("span");
    chip.className = "shift-chip";
    chip.textContent = label;
    // v úzkém sloupci se text ořízne, celý je proto vždy v tooltipu
    chip.title = label + (s.description ? " – " + s.description : "");
    if (isAdmin()) {
      chip.classList.add("editable");
      chip.onclick = (e) => { e.stopPropagation(); openDetail(s.id); };
    }
    row.appendChild(chip);
  });
  return row;
}

function buildDayView() {
  const wrap = document.createElement("div");
  wrap.className = "day-scroll";
  const grid = document.createElement("div");
  grid.className = "day-grid";

  const showShiftRow = dayHasShifts();
  const HH = ensureHourHeight(showShiftRow);
  const hours = CFG.DAY_END_HOUR - CFG.DAY_START_HOUR;
  const bodyH = hours * HH;
  const lineCss =
    "repeating-linear-gradient(to bottom, transparent 0, transparent " +
    (HH - 1) + "px, var(--line) " + (HH - 1) +
    "px, var(--line) " + HH + "px)";

  // Sloupec s časy
  const timeCol = document.createElement("div");
  timeCol.className = "col time";
  timeCol.innerHTML = '<div class="col-head"></div>';
  if (showShiftRow) timeCol.appendChild(buildShiftRow(null));
  const timeBody = document.createElement("div");
  timeBody.className = "col-body";
  timeBody.style.height = bodyH + "px";
  for (let h = CFG.DAY_START_HOUR; h <= CFG.DAY_END_HOUR; h++) {
    const lbl = document.createElement("div");
    lbl.className = "time-label";
    lbl.style.top = (h - CFG.DAY_START_HOUR) * HH + "px";
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

    // Kdo je dnes u tohohle stolu a od kolika do kolika (směny).
    if (showShiftRow) col.appendChild(buildShiftRow(room));

    const body = document.createElement("div");
    body.className = "col-body" + (isAdmin() ? " admin" : "");
    body.style.height = bodyH + "px";
    body.style.background = lineCss;

    // Dvojklik do prázdna zakládá lekci – obsluhuje ho setupBoxSelect,
    // odsud si bere jen to, ke kterému stolu sloupec patří.
    body.dataset.room = room.id;

    state.lessons
      .filter((l) => isLesson(l) && l.room_id === room.id && matchesMode(l))
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
    if (e.target.closest(".event")) return;     // klik na lekci řeší buildEvent
    if (e.target.closest(".shift-row")) return; // klik na směnu otevírá její detail
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
        // Dvojklik do prázdna = nová lekce na daném čase a stole.
        // Nejde použít událost "dblclick": první klik zruší výběr a překreslí
        // mřížku, takže druhý klik dopadne na úplně nový element a prohlížeč
        // dvojklik nerozpozná. Proto si dvojklik hlídáme sami z času a pozice.
        const now = Date.now();
        const isDouble = _lastEmptyClick &&
          now - _lastEmptyClick.t < 400 &&
          Math.abs(ue.clientX - _lastEmptyClick.x) < 6 &&
          Math.abs(ue.clientY - _lastEmptyClick.y) < 6;
        _lastEmptyClick = { t: now, x: ue.clientX, y: ue.clientY };
        if (isDouble && isAdmin()) {
          _lastEmptyClick = null;
          createAtPoint(ue);
          return;
        }
        // jen kliknutí do prázdna = zrušit výběr (překreslujeme jen když je co)
        if (!additive && state.selection.size) { state.selection.clear(); renderView(); }
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

let _lastEmptyClick = null;

// Z místa kliknutí odvodí stůl a hodinu a otevře formulář nové lekce.
function createAtPoint(ev) {
  const body = ev.target.closest && ev.target.closest(".col-body");
  if (!body || !body.dataset.room) return;
  const y = ev.clientY - body.getBoundingClientRect().top;
  const hours = y / (state.hourH || CFG.HOUR_HEIGHT);
  const h = Math.min(
    Math.max(CFG.DAY_START_HOUR + Math.floor(hours), CFG.DAY_START_HOUR),
    CFG.DAY_END_HOUR - 1
  );
  const starts = new Date(state.date);
  starts.setHours(h, 0, 0, 0);
  openCreate("lesson", { starts_at: starts, room_id: body.dataset.room });
}

function clearSelection() {
  if (state.selection.size) { state.selection.clear(); }
}

// Vybere všechny lekce zobrazeného dne (jen admin).
// Bere jen lekce aktuálního režimu (Prezenční/Online), ať se nekopíruje nic skrytého.
function selectAllDay() {
  if (!isAdmin()) return;
  state.selection = new Set(state.lessons.filter((l) => isLesson(l) && matchesMode(l)).map((l) => l.id));
  renderView();
  toast("Vybráno " + state.selection.size + " lekcí.");
}

function buildEvent(l, room) {
  const startMin = l.starts_at.getHours() * 60 + l.starts_at.getMinutes();
  const endMin = l.ends_at.getHours() * 60 + l.ends_at.getMinutes();
  const HH = state.hourH || CFG.HOUR_HEIGHT;
  const top = ((startMin - CFG.DAY_START_HOUR * 60) / 60) * HH;
  const height = Math.max(16, ((endMin - startMin) / 60) * HH - 2);

  const sub = [l.subject && l.subject !== "—" ? l.subject : null, l.lector_name].filter(Boolean).join(" · ");
  const note = (l.description || "").trim();
  const level = [l.student_grade, l.student_category].filter(Boolean).join(" ").trim();
  const phone = (l.student_phone || "").trim();

  const ev = document.createElement("div");
  // Krátké lekce (půlhodina a míň) dostanou jednořádkové rozvržení – na dva
  // řádky tam prostě není místo a useknuté jméno je horší než žádný detail.
  const compact = height < 36;
  ev.className =
    "event" +
    (compact ? " compact" : "") +
    (l.done ? " is-done" : "") +
    (l.status === "cancelled" ? " is-cancelled" : "") +
    (state.selection.has(l.id) ? " selected" : "");
  ev.dataset.id = l.id;
  ev.style.top = top + "px";
  ev.style.height = height + "px";
  ev.style.background = room.color;

  // Čas v buňce NENÍ – kdy lekce je, říká pozice bloku a časová osa vlevo.
  // Ušetřený řádek dostane jméno žáka, které je jediné, co musí být čitelné
  // na první pohled. Přesný čas je v tooltipu a v detailu lekce.
  ev.innerHTML =
    '<div class="e-title">' + escapeHtml(l.student_names || "") + "</div>" +
    (level ? '<div class="e-level">' + escapeHtml(level) + "</div>" : "") +
    (sub ? '<div class="e-sub">' + escapeHtml(sub) + "</div>" : "") +
    (phone ? '<div class="e-phone">' + escapeHtml(phone) + "</div>" : "") +
    (note ? '<div class="e-note">' + escapeHtml(note) + "</div>" : "") +
    (l.mode === "online" ? '<span class="e-badge">ONLINE</span>' : "");

  ev.title = [
    fmtRange(l.starts_at, l.ends_at) + " · " + (room ? room.name : ""),
    (l.student_names || "—") + (level ? " · " + level : ""),
    phone ? "Tel: " + phone : "",
    sub,
    note ? "Poznámka: " + note : "",
  ].filter(Boolean).join("\n");

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
    .filter((l) => isLesson(l) && (!state.roomFilter || l.room_id === state.roomFilter) && matchesMode(l))
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
  if (isAdmin()) renderAdminForm(l, isShift(l) ? "Lektor u stolu" : "Detail lekce");
  else renderLektorForm(l);
  showPanel();
}

// Admin: nová lekce (kind = 'lesson') nebo nová směna lektora (kind = 'shift').
// `slot` (nepovinné) předvyplní čas a stůl – používá ho dvojklik do prázdna
// v rozvrhu, díky kterému jde zapsat i lekce, která už proběhla.
function openCreate(kind, slot) {
  state.openLessonId = null;
  const base = slot ? new Date(slot.starts_at) : defaultStart();
  const end = new Date(base);
  end.setHours(end.getHours() + (kind === "shift" ? 4 : 1));
  renderAdminForm(
    { starts_at: base, ends_at: end, room_id: (slot && slot.room_id) || "",
      lector_name: "", subject: "", student_names: "",
      mode: "offline", status: "planned", done: false, description: "", kind: kind || "lesson" },
    kind === "shift" ? "Nový lektor u stolu" : "Nová lekce"
  );
  showPanel();
}

// Nová lekce začíná nejbližší celou hodinou (u dnešního dne tou právě
// probíhající), ne natvrdo v 8:00 – to se muselo pokaždé přepisovat.
function defaultStart() {
  const d = new Date(state.date);
  const now = new Date();
  const h = sameDay(d, now)
    ? Math.min(Math.max(now.getHours(), CFG.DAY_START_HOUR), CFG.DAY_END_HOUR - 1)
    : CFG.DAY_START_HOUR;
  d.setHours(h, 0, 0, 0);
  return d;
}

// Formulář pro administrátora (plná editace).
// Přepínač Typ rozhoduje, jestli jde o lekci, nebo jen o zápis „kdo je u stolu
// od kolika do kolika" – u směny nemá smysl žák, předmět ani odučeno, tak se
// ta pole schovají.
function renderAdminForm(l, title) {
  const shift = l.kind === "shift";
  document.getElementById("detailTitle").textContent = title;
  // Panel je rozdělený na dvě části: nahoře to, co člověk hledá pokaždé
  // (kdo, kdy, kde, co), pod čarou sbalené věci, které se mění výjimečně
  // (stav, odučeno, režim, opakování). Dřív bylo všechno v jedné hromadě
  // a hledalo se v tom špatně.
  document.getElementById("detailBody").innerHTML =
    '<div class="detail-main">' +
      '<div id="lessonOnly"' + (shift ? ' class="hidden"' : "") + ">" +
        field("Žák", '<input type="text" id="fStudent" list="studentsList" value="' + escapeHtml(l.student_names || "") + '">') +
        '<div id="studentInfo" class="student-info"></div>' +
      "</div>" +
      '<div class="field-row">' +
        field("Datum", '<input type="date" id="fDate" value="' + dateVal(l.starts_at) + '">') +
        field("Začátek", '<input type="time" id="fStart" value="' + timeVal(l.starts_at) + '">') +
        field("Konec", '<input type="time" id="fEnd" value="' + timeVal(l.ends_at) + '">') +
      "</div>" +
      field(shift ? "Stůl / učebna" : "Místnost / stůl", '<select id="fRoom">' + roomOptions(l.room_id) + "</select>") +
      '<div class="field-row">' +
        '<div id="lessonOnly2"' + (shift ? ' class="hidden"' : "") + ' style="flex:1;">' +
          field("Předmět", '<input type="text" id="fSubject" value="' + escapeHtml(l.subject || "") + '">') +
        "</div>" +
        field("Lektor", '<input type="text" id="fLector" value="' + escapeHtml(l.lector_name || "") + '">') +
      "</div>" +
      field(shift ? "Poznámka" : "Popis – co se na lekci dělalo", '<textarea id="fDesc">' + escapeHtml(l.description || "") + "</textarea>") +
    "</div>" +

    '<details class="detail-more"' + (shift ? " open" : "") + ">" +
      "<summary>Další nastavení</summary>" +
      field("Typ zápisu",
        '<select id="fKind"><option value="lesson"' + (shift ? "" : " selected") + ">Lekce</option>" +
        '<option value="shift"' + (shift ? " selected" : "") + ">Lektor u stolu (kdo tu dnes je)</option></select>") +
      '<div id="lessonOnly3"' + (shift ? ' class="hidden"' : "") + ">" +
        '<div class="field-row">' +
          field("Stav", '<select id="fStatus">' + statusOptions(l.status) + "</select>") +
          field("Režim", '<select id="fMode"><option value="offline"' + (l.mode !== "online" ? " selected" : "") + ">Osobní</option><option value=\"online\"" + (l.mode === "online" ? " selected" : "") + ">Online</option></select>") +
        "</div>" +
        '<label class="check"><input type="checkbox" id="fDone"' + (l.done ? " checked" : "") + "> Odučeno</label>" +
      "</div>" +
      // Opakování dává smysl jen u nově zakládané lekce, ne při úpravě stávající.
      (state.openLessonId ? "" :
        field("Opakovat", '<select id="fRepeat">' +
          '<option value="">neopakovat</option>' +
          '<option value="daily">denně</option>' +
          '<option value="weekly">týdně</option>' +
          '<option value="biweekly">ob týden</option>' +
        "</select>") +
        '<div class="role-note">Opakování založí lekce jen na následující týden. Dál dopředu se rozvrh protahuje tlačítkem <b>Protáhnout týden</b>.</div>') +
      (shift ? '<div class="role-note">Směna se ukáže jako řádek pod názvem stolu. Nepočítá se do odpracovaných hodin ani nečerpá kredit žáka.</div>' : "") +
    "</details>";

  // Přepnutí typu překreslí formulář, ať sedí popisky i schovaná pole.
  document.getElementById("fKind").onchange = (e) => {
    renderAdminForm(readAdminForm(e.target.value), e.target.value === "shift" ? "Lektor u stolu" : "Lekce");
  };

  // Konec se drží délky lekce – při posunu začátku se posune s ním.
  // Nová lekce startuje s hodinou, takže z 9:00 je automaticky 9:00–10:00.
  const fStart = document.getElementById("fStart");
  const fEnd = document.getElementById("fEnd");
  fStart.onchange = () => {
    const mins = minutesBetween(l.starts_at, l.ends_at) || 60;
    fEnd.value = addMinutesToTimeVal(fStart.value, mins);
  };

  if (!shift) {
    const fStudent = document.getElementById("fStudent");
    const showInfo = () => renderStudentInfo(fStudent.value.trim());
    fStudent.oninput = showInfo;
    showInfo();
  }

  document.getElementById("detailDelete").classList.toggle("hidden", !state.openLessonId);
  document.getElementById("detailSaved").textContent = "";
}

// Kategorie klienta – stejné hodnoty používá kartotéka.
const CATEGORIES = ["ZŠ", "SŠ", "VŠ", "pracující", "dospělý"];
const PAY_METHODS = ["účet DR", "účet PoraDys", "účet jazykovka", "hotově"];

function findStudent(name) {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;
  return state.students.find((s) => String(s.name || "").trim().toLowerCase() === q) || null;
}

// Pod polem „Žák" ukáže, co o klientovi ví kartotéka (telefon, ročník,
// kategorie). Když je jméno nové, rovnou nabídne doplnění těchto údajů –
// uloží se do kartotéky spolu s lekcí, aby se karta nemusela zakládat zvlášť.
function renderStudentInfo(name) {
  const box = document.getElementById("studentInfo");
  if (!box) return;
  if (!name) { box.innerHTML = ""; return; }

  const s = findStudent(name);
  if (s) {
    const bits = [
      s.phone ? "📞 " + s.phone : null,
      s.grade || null,
      s.category || null,
      s.payment_method ? "platí: " + s.payment_method : null,
    ].filter(Boolean);
    box.innerHTML = '<div class="si-known">' +
      (bits.length ? escapeHtml(bits.join(" · ")) : "V kartotéce zatím bez dalších údajů") +
      ' <span class="si-note">(z kartotéky)</span></div>';
    return;
  }

  const opts = (arr, id, ph) =>
    '<select id="' + id + '"><option value="">' + ph + "</option>" +
    arr.map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + "</option>").join("") + "</select>";
  box.innerHTML =
    '<div class="si-new"><b>Nový klient</b> – doplňte, ať se rovnou založí i v kartotéce:' +
    '<div class="si-grid">' +
      opts(CATEGORIES, "fNewCategory", "kategorie…") +
      '<input type="text" id="fNewGrade" placeholder="třída / ročník">' +
      '<input type="text" id="fNewPhone" placeholder="telefon">' +
      opts(PAY_METHODS, "fNewPay", "způsob platby…") +
    "</div></div>";
}

// Údaje pro založení nového klienta (prázdné, když už v kartotéce je).
function readNewStudentFields() {
  const g = (id) => document.getElementById(id);
  if (!g("fNewCategory")) return null;
  return {
    category: g("fNewCategory").value || null,
    grade: g("fNewGrade").value.trim() || null,
    phone: g("fNewPhone").value.trim() || null,
    payment_method: g("fNewPay").value || null,
  };
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((b - a) / 60000);
}
// "09:00" + 90 min => "10:30"
function addMinutesToTimeVal(hhmm, mins) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const t = h * 60 + m + mins;
  return pad(Math.floor(t / 60) % 24) + ":" + pad(t % 60);
}

// Přečte rozdělaný formulář zpět do objektu (kvůli přepnutí typu bez ztráty dat).
function readAdminForm(kind) {
  const g = (id) => document.getElementById(id);
  const [y, mo, d] = g("fDate").value.split("-").map(Number);
  const mk = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(y, mo - 1, d, h, m); };
  return {
    starts_at: mk(g("fStart").value),
    ends_at: mk(g("fEnd").value),
    room_id: g("fRoom").value,
    student_names: g("fStudent") ? g("fStudent").value : "",
    lector_name: g("fLector").value,
    subject: g("fSubject") ? g("fSubject").value : "",
    mode: g("fMode") ? g("fMode").value : "offline",
    status: g("fStatus") ? g("fStatus").value : "planned",
    done: g("fDone") ? g("fDone").checked : false,
    description: g("fDesc").value,
    kind: kind,
  };
}

// Formulář pro lektora (jen popis + potvrzení)
function renderLektorForm(l) {
  const room = roomById(l.room_id);
  document.getElementById("detailTitle").textContent = l.student_names || "Lekce";
  document.getElementById("detailBody").innerHTML =
    '<div class="role-note">Jako lektor můžeš zapsat popis a potvrdit, že lekce proběhla. Změny rozvrhu dělá administrátor.</div>' +
    metaRow("Žák", escapeHtml(l.student_names || "—")) +
    metaRow("Ročník", escapeHtml([l.student_grade, l.student_category].filter(Boolean).join(" · ") || "—")) +
    metaRow("Telefon", l.student_phone
      ? '<a href="tel:' + escapeHtml(l.student_phone.replace(/\s/g, "")) + '">' + escapeHtml(l.student_phone) + "</a>"
      : "—") +
    metaRow("Předmět", escapeHtml(l.subject || "—")) +
    metaRow("Lektor", escapeHtml(l.lector_name || "—")) +
    metaRow("Místnost", room ? escapeHtml(room.name) : "—") +
    metaRow("Čas", fmtRange(l.starts_at, l.ends_at)) +
    metaRow("Režim", l.mode === "online" ? "Online" : "Osobní") +
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
      const kind = document.getElementById("fKind").value;
      const shift = kind === "shift";
      const [sh, sm] = document.getElementById("fStart").value.split(":").map(Number);
      const [eh, em] = document.getElementById("fEnd").value.split(":").map(Number);
      const [y, mo, d] = document.getElementById("fDate").value.split("-").map(Number);
      const starts = new Date(y, mo - 1, d, sh, sm);
      const ends = new Date(y, mo - 1, d, eh, em);
      if (ends <= starts) { saved.textContent = "Konec musí být po začátku."; btn.disabled = false; return; }
      const roomId = document.getElementById("fRoom").value || null;
      if (shift && !roomId) { saved.textContent = "U lektora u stolu vyberte stůl."; btn.disabled = false; return; }
      if (shift && !document.getElementById("fLector").value.trim()) {
        saved.textContent = "Vyplňte lektora."; btn.disabled = false; return;
      }
      // Kontrola překryvu: stejná místnost + překrývající se čas v daném dni.
      // Směny se nekontrolují – lekce mají uvnitř směny naopak vznikat.
      if (!shift) {
        const dayLessons = await provider.getLessons(starts);
        const conflict = findConflict(dayLessons, roomId, starts, ends, state.openLessonId);
        if (conflict) {
          saved.textContent = "Kolize: v této místnosti už je lekce " + fmtRange(conflict.starts_at, conflict.ends_at) + ".";
          btn.disabled = false;
          return;
        }
      }
      const payload = {
        kind,
        starts_at: starts,
        ends_at: ends,
        room_id: roomId,
        student_names: shift ? "" : document.getElementById("fStudent").value.trim(),
        student_fields: shift ? null : readNewStudentFields(),
        lector_name: document.getElementById("fLector").value.trim(),
        subject: shift ? "" : document.getElementById("fSubject").value.trim(),
        mode: shift ? "offline" : document.getElementById("fMode").value,
        status: shift ? "planned" : document.getElementById("fStatus").value,
        done: shift ? false : document.getElementById("fDone").checked,
        description: document.getElementById("fDesc").value,
      };
      await provider.saveLesson(payload, state.openLessonId);

      // Opakování (jen u nové lekce) – založí kopie na následující týden.
      const repeatEl = document.getElementById("fRepeat");
      if (repeatEl && repeatEl.value) {
        const r = await repeatLesson(payload, repeatEl.value);
        if (r.added || r.skipped) {
          toast("Opakování: založeno " + r.added +
            (r.skipped ? ", " + r.skipped + " přeskočeno kvůli kolizi" : "") + ".");
        }
      }
      await loadStudents(); // v kartotéce mohl přibýt nový klient
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

// ---------- Export rozvrhu do Excelu ----------
// Klasický .csv s BOM a středníkem – Excel ho otevře dvojklikem včetně
// diakritiky a nemusí se nic importovat. Bere i směny lektorů u stolu,
// ať je v přehledu vidět, kdo kde ten den byl.
function csvEscape(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }

async function exportSchedule() {
  const choice = prompt("Stáhnout rozvrh jako Excel (.csv):\n\n1 = zobrazený den\n2 = celý týden\n3 = celý měsíc", "1");
  if (choice === null) return;
  const range = { 1: "den", 2: "tyden", 3: "mesic" }[choice.trim()];
  if (!range) { toast("Zadejte 1, 2 nebo 3."); return; }

  const btn = document.getElementById("exportBtn");
  btn.disabled = true;
  try {
    const [from, to] = exportRange(range);
    // Do exportu jdou jen lekce – směny lektorů u stolu jsou provozní
    // poznámka k rozvrhu, ne odučená výuka, a v tabulce jen zavazely.
    const lessons = (await provider.getLessonsRange(from, to))
      .filter(isLesson)
      .sort((a, b) => a.starts_at - b.starts_at);

    const rows = lessons.map((l) => {
      const room = roomById(l.room_id);
      return [
        dayKey(l.starts_at),
        DAYS_FULL[l.starts_at.getDay()],
        fmtTime(l.starts_at),
        fmtTime(l.ends_at),
        (minutesBetween(l.starts_at, l.ends_at) / 60).toFixed(2).replace(".", ","),
        room ? room.name : "",
        l.student_names || "",
        l.student_phone || "",
        l.student_grade || "",
        l.student_category || "",
        l.subject || "",
        l.lector_name || "",
        l.mode === "online" ? "online" : "osobní",
        STATUS_LABELS[l.status] || l.status || "",
        l.done ? "ano" : "ne",
        l.description || "",
      ];
    });
    if (!rows.length) { toast("V tomto období nejsou žádné lekce."); return; }

    const cols = ["Datum", "Den", "Od", "Do", "Hodin", "Stůl / učebna", "Žák", "Telefon",
      "Třída / ročník", "Kategorie", "Předmět", "Lektor", "Režim", "Stav", "Odučeno", "Poznámka"];
    const csv = [cols.map(csvEscape).join(";")]
      .concat(rows.map((r) => r.map(csvEscape).join(";")))
      .join("\r\n");

    const name = "rozvrh-" + range + "-" + dayKey(state.date) + ".csv";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Staženo " + rows.length + " řádků do " + name);
  } catch (e) {
    toast("Export selhal: " + (e.message || e));
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

// Období exportu jako [od, do) – načte se jedním dotazem.
function exportRange(range) {
  const d0 = new Date(state.date); d0.setHours(0, 0, 0, 0);
  if (range === "den") {
    const to = new Date(d0); to.setDate(to.getDate() + 1);
    return [d0, to];
  }
  if (range === "tyden") {
    const monday = new Date(d0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const to = new Date(monday); to.setDate(monday.getDate() + 7);
    return [monday, to];
  }
  return [
    new Date(d0.getFullYear(), d0.getMonth(), 1),
    new Date(d0.getFullYear(), d0.getMonth() + 1, 1),
  ];
}

// ---------- Opakování lekce (admin) ----------
// Záměrně jen na následující týden – dál dopředu se rozvrh protahuje
// tlačítkem „Protáhnout týden →", ať v databázi nevznikají měsíce lekcí,
// které se stejně budou přehazovat.
//   denně    = každý další den až +7 dní
//   týdně    = jednou za 7 dní (1 kopie)
//   ob týden = jednou za 14 dní (1 kopie)
function repeatOffsets(mode) {
  if (mode === "daily") return [1, 2, 3, 4, 5, 6, 7];
  if (mode === "weekly") return [7];
  if (mode === "biweekly") return [14];
  return [];
}

async function repeatLesson(payload, mode) {
  let added = 0, skipped = 0;
  for (const off of repeatOffsets(mode)) {
    const starts = new Date(payload.starts_at); starts.setDate(starts.getDate() + off);
    const ends = new Date(payload.ends_at); ends.setDate(ends.getDate() + off);
    try {
      const dayLessons = await provider.getLessons(starts);
      if (payload.kind !== "shift" && findConflict(dayLessons, payload.room_id, starts, ends, null)) {
        skipped++;
        continue;
      }
      await provider.saveLesson(
        Object.assign({}, payload, {
          starts_at: starts, ends_at: ends,
          status: "planned", done: false,      // kopie jsou vždy nepotvrzené
          student_fields: null,                // klienta zakládá jen první lekce
        }),
        null
      );
      added++;
    } catch (e) { console.error(e); skipped++; }
  }
  return { added, skipped };
}

// ---------- Konec dne: „Vše odučeno" (admin) ----------
// Šéfová to zmáčkne večer a odklikne tím celý den najednou. Bere lekce
// obou režimů (prezenční i online), ale jen ty naplánované – zrušené,
// nedostavené ani směny lektorů u stolu se nedotýká.
function pendingLessonsOfDay() {
  return state.lessons.filter(
    (l) => isLesson(l) && !l.done && l.status !== "cancelled" && l.status !== "no_show"
  );
}

async function markDayDone() {
  const pending = pendingLessonsOfDay();
  if (!pending.length) {
    toast("Všechny lekce tohoto dne už jsou odučené (nebo zrušené).");
    return;
  }
  const online = pending.filter((l) => l.mode === "online").length;
  if (!confirm(
    "Označit " + pending.length + " " + lessonWord(pending.length) + " dne " + fmtDateLong(state.date) +
    " jako odučené?" + (online ? "\n(Z toho " + online + " online – ty teď v rozvrhu nevidíte.)" : "") +
    "\n\nZapíšou se tím lektorům odpracované hodiny a žákům se strhne kredit."
  )) return;

  const btn = document.getElementById("doneAllBtn");
  btn.disabled = true;
  let ok = 0, failed = 0;
  for (const l of pending) {
    try {
      await provider.updateLessonFields(l.id, {
        done: true,
        status: l.status === "planned" ? "done" : l.status,
      });
      ok++;
    } catch (e) { console.error(e); failed++; }
  }
  btn.disabled = false;
  await refresh();
  toast("Odučeno: " + ok + " " + lessonWord(ok) + (failed ? ", " + failed + " se nepodařilo uložit" : "") + ".");
}

function lessonWord(n) { return n === 1 ? "lekci" : n >= 2 && n <= 4 ? "lekce" : "lekcí"; }

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
      student_names: l.student_names, mode: l.mode, kind: l.kind || "lesson",
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
    if (t.kind !== "shift" && findConflict(placed, t.room_id, starts, ends, null)) { skipped++; continue; }
    const payload = {
      kind: t.kind || "lesson",
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

// ---------- Protažení týdne (admin) ----------
// Zkopíruje všechny lekce z týdne, ve kterém je zobrazený den, do týdne
// následujícího. Zrušené lekce se nekopírují; kolize v cílovém týdnu se
// přeskočí. Kopie vzniknou jako naplánované (nepotvrzené).
async function extendWeekToNext() {
  if (!isAdmin()) return;
  const monday = new Date(state.date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // pondělí týdne
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmtD = (d) => d.getDate() + ". " + (d.getMonth() + 1) + ".";
  if (!confirm("Zkopírovat všechny lekce z týdne " + fmtD(monday) + " – " + fmtD(sunday) +
    " do týdne následujícího?\n(Zrušené lekce se vynechají, kolize se přeskočí.)")) return;

  const btn = document.getElementById("extendWeekBtn");
  btn.disabled = true;
  let added = 0, skipped = 0;
  try {
    for (let i = 0; i < 7; i++) {
      const srcDay = new Date(monday); srcDay.setDate(monday.getDate() + i);
      const tgtDay = new Date(monday); tgtDay.setDate(monday.getDate() + i + 7);
      const src = await provider.getLessons(srcDay);
      const placed = [...await provider.getLessons(tgtDay)];
      for (const l of src) {
        if (l.status === "cancelled") continue;
        const starts = new Date(tgtDay); starts.setHours(l.starts_at.getHours(), l.starts_at.getMinutes(), 0, 0);
        const ends = new Date(tgtDay); ends.setHours(l.ends_at.getHours(), l.ends_at.getMinutes(), 0, 0);
        // Směny se kopírují taky (kdo u kterého stolu bývá), jen nekolidují.
        if (isLesson(l) && findConflict(placed, l.room_id, starts, ends, null)) { skipped++; continue; }
        const res = await provider.saveLesson({
          kind: l.kind || "lesson",
          starts_at: starts, ends_at: ends, room_id: l.room_id,
          student_names: l.student_names, lector_name: l.lector_name,
          subject: l.subject, mode: l.mode, status: "planned", done: false, description: "",
        }, null);
        placed.push({ id: (res && res.id) || "tmp", room_id: l.room_id, starts_at: starts, ends_at: ends });
        added++;
      }
    }
    await refresh();
    toast("Do dalšího týdne zkopírováno " + added + " lekcí" +
      (skipped ? ", " + skipped + " přeskočeno kvůli kolizi" : "") + ".");
  } catch (e) {
    toast("Chyba při kopírování: " + (e.message || e));
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Výkaz hodin (admin) ----------
// Šéfová na konci měsíce otevře výkaz a vidí u každého lektora součet
// potvrzených hodin – podle toho vyplácí.
const hoursState = { month: new Date() };

async function openHoursReport() {
  if (!isAdmin()) return;
  hoursState.month = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
  document.getElementById("hoursModal").classList.remove("hidden");
  await renderHoursReport();
}

function closeHoursReport() {
  document.getElementById("hoursModal").classList.add("hidden");
}

function shiftHoursMonth(delta) {
  const m = hoursState.month;
  hoursState.month = new Date(m.getFullYear(), m.getMonth() + delta, 1);
  renderHoursReport();
}

async function renderHoursReport() {
  const m = hoursState.month;
  document.getElementById("hoursMonth").textContent = MONTHS[m.getMonth()] + " " + m.getFullYear();
  const body = document.getElementById("hoursBody");
  body.innerHTML = '<div class="placeholder">Načítám…</div>';
  try {
    const rows = await provider.getMonthlyHours(m.getFullYear(), m.getMonth());
    if (!rows.length) {
      body.innerHTML = '<div class="placeholder">Žádné potvrzené lekce v tomto měsíci.</div>';
      return;
    }
    let totH = 0, totL = 0;
    let html = '<table class="hours-table"><tr><th>Lektor</th><th>Lekcí</th><th>Hodin</th></tr>';
    rows.forEach((r) => {
      totH += Number(r.hours);
      totL += Number(r.lessons);
      html += "<tr><td>" + escapeHtml(r.lector_name) + "</td><td>" + r.lessons + "</td><td><b>" + r.hours + "</b></td></tr>";
    });
    html += '<tr class="total"><td>Celkem</td><td>' + totL + "</td><td><b>" + (Math.round(totH * 100) / 100) + "</b></td></tr></table>";
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="placeholder">Chyba: ' + escapeHtml(e.message || e) + "</div>";
    console.error(e);
  }
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
  // V liště jen jméno; role je v tooltipu, ať „(administrátor)" nebere šířku.
  b.textContent = state.user.name;
  b.title = isAdmin() ? "Přihlášen jako administrátor" : "Přihlášen jako lektor";
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
  // Když se nepodaří načíst číselníky (uspaný projekt, výpadek sítě),
  // nesmí zůstat prázdná bílá stránka bez vysvětlení.
  try {
    state.rooms = await provider.getRooms();
    await loadStudents();
  } catch (e) {
    console.error(e);
    document.getElementById("viewContainer").innerHTML =
      '<div class="placeholder">Spojení s databází selhalo: ' + escapeHtml(e.message || e) +
      '<br><button id="bootRetry" class="primary-btn" style="margin-top:10px;padding:6px 14px;">Zkusit znovu</button></div>';
    document.getElementById("bootRetry").onclick = () => location.reload();
    return;
  }

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
    document.getElementById("newLessonBtn").onclick = () => openCreate("lesson");
    document.getElementById("newShiftBtn").onclick = () => openCreate("shift");
    document.getElementById("doneAllBtn").onclick = markDayDone;
    document.getElementById("selectAllBtn").onclick = selectAllDay;
    document.getElementById("extendWeekBtn").onclick = extendWeekToNext;
    document.getElementById("exportBtn").onclick = exportSchedule;

    // Datum v liště rozbaluje mini kalendář; klik jinam ho zavře.
    document.getElementById("navDate").onclick = (e) => { e.stopPropagation(); toggleMiniCalendar(); };
    document.getElementById("miniCalendar").onclick = (e) => e.stopPropagation();
    document.addEventListener("click", closeMiniCalendar);

    const modeSel = document.getElementById("modeSelect");
    modeSel.value = state.modeFilter;
    modeSel.onchange = () => {
      state.modeFilter = modeSel.value;
      sessionStorage.setItem("poradys_mode", state.modeFilter);
      clearSelection();
      renderView();
    };
    document.getElementById("diagBtn").onclick = () => { location.href = "diagnostika.html" + location.search; };
    document.getElementById("kartotekaBtn").onclick = () => { location.href = "kartoteka.html" + location.search; };
    document.getElementById("hoursBtn").onclick = openHoursReport;
    document.getElementById("hoursClose").onclick = closeHoursReport;
    document.getElementById("hoursPrev").onclick = () => shiftHoursMonth(-1);
    document.getElementById("hoursNext").onclick = () => shiftHoursMonth(1);
    document.getElementById("hoursModal").onclick = (e) => { if (e.target.id === "hoursModal") closeHoursReport(); };

    // Při změně velikosti okna přepočítej výšku hodiny, ať se den pořád vejde.
    let _resizeT = null;
    window.addEventListener("resize", () => {
      clearTimeout(_resizeT);
      _resizeT = setTimeout(() => {
        if (state.view !== "den") return;
        invalidateLayout(); // po změně okna se výška hodiny přepočítá
        renderView();
      }, 150);
    });
    document.addEventListener("keydown", onKeyDown);
  }

  await refresh();
}

window.addEventListener("DOMContentLoaded", init);
