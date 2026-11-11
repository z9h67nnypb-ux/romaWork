// ---------------------------------------------------------------------------
// Společné pomůcky všech stránek (rozvrh, obě kartotéky, diagnostika).
// Načítá se hned za config.js, před skriptem stránky. Dřív si každá stránka
// držela vlastní kopii, takže oprava na jednom místě se na ostatní nedostala.
// ---------------------------------------------------------------------------

const CFG = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);

// Jeden klient Supabase na stránku; vytvoří se až při prvním použití.
let _db = null;
function db() {
  if (!_db) _db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  return _db;
}

// ---------- Text a čísla ----------
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// "2026-11-03" -> "3. 11. 2026"
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
// Česká shoda po číslovce: plural(3, "lekce", "lekce", "lekcí")
function plural(n, one, few, many) { return n === 1 ? one : n >= 2 && n <= 4 ? few : many; }

const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

// ---------- Formulářová pole ----------
function fieldHtml(label, inner, cls) {
  return '<div class="field' + (cls ? " " + cls : "") + '"><label>' + label + "</label>" + inner + "</div>";
}
function inp(id, val, ph) {
  return '<input type="text" id="' + id + '" value="' + escapeHtml(val || "") + '"' + (ph ? ' placeholder="' + escapeHtml(ph) + '"' : "") + ">";
}

// ---------- Krátká hláška dole na stránce ----------
let _toastTimer = null;
function showToast(msg, ms) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), ms || 4000);
}

// ---------- Stažení tabulky do Excelu ----------
// Klasický .csv se středníkem a BOM – Excel ho otevře dvojklikem včetně
// diakritiky a nemusí se nic importovat. `rows` = pole řádků, první je záhlaví.
function downloadCsv(name, rows) {
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const csv = rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Přihlášení ----------
// Kdo je přihlášený: { name, role }, nebo null. Roli je nutné ověřit na každé
// stránce, ne jen schováním tlačítka v rozvrhu – dá se na ni jít i adresou.
async function currentUser() {
  const c = db();
  const { data } = await c.auth.getSession();
  if (!data || !data.session) return null;
  const user = data.session.user;
  const { data: p } = await c.from("profiles").select("*").eq("id", user.id).maybeSingle();
  // Účet, kterému administrátor odebral přístup (profiles.active = false),
  // se dovnitř nesmí dostat ani se starou session z prohlížeče.
  if (p && p.active === false) { try { await c.auth.signOut(); } catch (e) { console.error(e); } return null; }
  return { name: (p && p.name) || user.email, role: (p && p.role) || "lektor" };
}

// Poslední pojistka odhlášení: smaže stopy po přihlášení přímo z prohlížeče.
// supabase-js si session drží v localStorage pod klíčem sb-<projekt>-auth-token;
// dokud tam je, po obnovení stránky je uživatel zase přihlášený.
function clearLocalAuth() {
  try { sessionStorage.removeItem("poradys_user"); } catch (e) { /* privátní režim */ }
  try {
    Object.keys(localStorage)
      .filter((k) => /^sb-.*-auth-token/.test(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* privátní režim */ }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Vypršel čas čekání na server.")), ms)),
  ]);
}

// Odhlášení z kartoték a diagnostiky. Session je společná pro celou appku;
// po odhlášení se jde na rozvrh, kde naskočí přihlášení. signOut() jde po síti
// a umí se při výpadku zaseknout, ne spadnout – proto se na něj čeká jen
// chvilku a session se tak jako tak smaže z prohlížeče.
async function pageLogout(btn) {
  if (btn) btn.disabled = true;
  try {
    const { error } = await withTimeout(db().auth.signOut(), 2500);
    if (error) throw error;
  } catch (e) {
    console.error(e);
  }
  clearLocalAuth();
  location.href = "index.html" + location.search;
}
