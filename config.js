// ---------------------------------------------------------------------------
// Konfigurace aplikace
// ---------------------------------------------------------------------------
// Dokud je USE_SUPABASE = false, appka běží na ukázkových datech (mockData.js)
// a funguje hned po otevření, bez jakéhokoli nastavení.
//
// Až budeš chtít připojit Supabase:
//   1) spusť schema.sql v Supabase SQL Editoru,
//   2) v Supabase: Project Settings -> API -> zkopíruj "Project URL" a "anon public" klíč,
//   3) vyplň je níže,
//   4) přepni USE_SUPABASE na true a obnov stránku.
// ---------------------------------------------------------------------------
window.APP_CONFIG = {
  // Přidáním ?mock=1 do adresy se appka přepne na ukázková data –
  // hodí se na zkoušení novinek bez zápisu do ostré databáze.
  USE_SUPABASE: !new URLSearchParams(location.search).has("mock"),

  // Jen čistá adresa projektu – BEZ /rest/v1/ na konci (cesty si klient přidává sám).
  SUPABASE_URL: "https://smdcqnankroajubawqng.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Z7mTsl_KRP55dyYrJdlY3w_RZwy79Gq",

  // Rozsah denního rozvrhu a výška jedné hodiny v pixelech
  // (42 px = celý den 8–21 se vejde na běžnou obrazovku bez svislého rolování)
  DAY_START_HOUR: 8,
  DAY_END_HOUR: 21,
  HOUR_HEIGHT: 42,

  // Demo účty pro přihlášení v ukázkovém režimu (USE_SUPABASE = false).
  // V ostré verzi (Supabase) se NEPOUŽIJÍ – účty se zakládají v Supabase Auth
  // a role se čte z tabulky profiles.
  DEMO_USERS: [
    { email: "admin@poradys.cz", password: "admin123", name: "Administrátor", role: "admin" },
    { email: "kunkelova@poradys.cz", password: "lektor123", name: "Kunkelová", role: "lektor" },
  ],
};
