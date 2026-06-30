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
  USE_SUPABASE: false,

  SUPABASE_URL: "https://TVUJ-PROJEKT.supabase.co",
  SUPABASE_ANON_KEY: "TVUJ-ANON-KLIC",

  // Rozsah denního rozvrhu a výška jedné hodiny v pixelech
  DAY_START_HOUR: 8,
  DAY_END_HOUR: 21,
  HOUR_HEIGHT: 60,

  // Demo účty pro přihlášení v ukázkovém režimu (USE_SUPABASE = false).
  // V ostré verzi (Supabase) se NEPOUŽIJÍ – účty se zakládají v Supabase Auth
  // a role se čte z tabulky profiles.
  DEMO_USERS: [
    { email: "admin@poradys.cz", password: "admin123", name: "Administrátor", role: "admin" },
    { email: "kunkelova@poradys.cz", password: "lektor123", name: "Kunkelová", role: "lektor" },
  ],
};
