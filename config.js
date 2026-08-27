// ---------------------------------------------------------------------------
// Konfigurace aplikace
// ---------------------------------------------------------------------------
// Appka běží NAOSTRO proti Supabase. Ukázkový (demo) režim s daty v paměti
// se zapíná parametrem ?demo=1 v adrese – hodí se na proklikání bez zásahu
// do ostrých dat.
//
// Databáze musí mít spuštěné schema.sql a všechny migrace z migrace_*.sql
// (naposledy migrace_typ_lekce.sql – druh lekce mimořádná/opakovaná).
// ---------------------------------------------------------------------------
window.APP_CONFIG = {
  // OSTRÝ REŽIM JE VÝCHOZÍ – appka pracuje se skutečnou databází (Supabase)
  // a chce přihlášení účtem z Supabase Auth.
  //
  // Ukázkový režim (data v paměti, nic se neukládá) se zapne přidáním
  // ?demo=1 do adresy:
  //   https://…/index.html?demo=1
  // Odkazy mezi stránkami si parametr nesou s sebou, takže se v ukázkovém
  // režimu zůstane i po přechodu do kartotéky nebo diagnostiky.
  USE_SUPABASE: !new URLSearchParams(location.search).has("demo"),

  // Jen čistá adresa projektu – BEZ /rest/v1/ na konci (cesty si klient přidává sám).
  SUPABASE_URL: "https://smdcqnankroajubawqng.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Z7mTsl_KRP55dyYrJdlY3w_RZwy79Gq",

  // Rozsah denního rozvrhu a výška jedné hodiny v pixelech.
  // Výuka běží do 20:00, takže mřížka končí tam – kratší den = vyšší řádky
  // a čitelnější bloky. HOUR_HEIGHT je jen záloha, appka si výšku dopočítá
  // podle okna, aby se celý den vešel bez svislého rolování.
  DAY_START_HOUR: 8,
  DAY_END_HOUR: 20,
  HOUR_HEIGHT: 32,

  // Demo účty pro přihlášení v ukázkovém režimu (?demo=1).
  // V ostré verzi (Supabase) se NEPOUŽIJÍ – účty se zakládají v Supabase Auth
  // a role se čte z tabulky profiles.
  DEMO_USERS: [
    { email: "admin@poradys.cz", password: "admin123", name: "Administrátor", role: "admin" },
    { email: "kunkelova@poradys.cz", password: "lektor123", name: "Kunkelová", role: "lektor" },
  ],
};
