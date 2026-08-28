// ---------------------------------------------------------------------------
// Konfigurace aplikace
// ---------------------------------------------------------------------------
// Appka běží NAOSTRO proti databázi (Supabase). Přihlášení je povinné,
// role (admin / lektor) se čte z tabulky `profiles`.
//
// Databáze musí mít spuštěné schema.sql a všechny migrace z migrace_*.sql
// (naposledy migrace_ucty_lektoru.sql, migrace_prava_ostry_provoz.sql
// a migrace_role_auditor.sql – účty z appky, ostrá práva a role auditor).
//
// Účty lektorů zakládá administrátor přímo v appce: Rozvrh -> „Lektoři".
// ---------------------------------------------------------------------------
window.APP_CONFIG = {
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
};
