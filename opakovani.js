// ---------------------------------------------------------------------------
// Opakované (pravidelné) lekce – sdílený výpočet termínů.
// ---------------------------------------------------------------------------
// Používá ho rozvrh (app.js) i kartotéka (kartoteka.js), aby "každé úterý
// v 15:00 na 10 týdnů" znamenalo na obou místech totéž. Soubor umí jen
// počítat data – ukládání si každá stránka dělá svým providerem.
// ---------------------------------------------------------------------------

window.Opakovani = {
  // Neděle = 0, jako v JS Date.getDay()
  DOW_NAMES: ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"],
  // Tvar do věty („…každý týden ve středu…"), ať hlášky nedrhnou.
  DOW_IN: ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"],
  // Pořadí v nabídce – pracovní týden začíná pondělkem.
  DOW_ORDER: [1, 2, 3, 4, 5, 6, 0],
  MAX_WEEKS: 52,

  // <option> pro výběr dne v týdnu.
  dowOptions(selected) {
    return this.DOW_ORDER.map((d) =>
      '<option value="' + d + '"' + (Number(selected) === d ? " selected" : "") + ">" + this.DOW_NAMES[d] + "</option>"
    ).join("");
  },

  // Nejbližší datum od `from` (včetně), které padne na zadaný den v týdnu.
  nextDow(from, dow) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    const shift = (Number(dow) - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + shift);
    return d;
  },

  // "15:30" -> [15, 30]
  parseTime(hhmm) {
    const [h, m] = String(hhmm || "").split(":").map(Number);
    return [h || 0, m || 0];
  },

  // Vygeneruje termíny série.
  //   first       – Date prvního termínu (jen datum, čas se dopočítá)
  //   timeFrom/To – "15:00" / "16:00"
  //   weeks       – kolik termínů celkem (včetně prvního)
  //   everyWeeks  – 1 = každý týden, 2 = ob týden
  // Vrací [{ starts_at, ends_at }]; když je konec dřív než začátek, vrací [].
  series(first, timeFrom, timeTo, weeks, everyWeeks) {
    const [sh, sm] = this.parseTime(timeFrom);
    const [eh, em] = this.parseTime(timeTo);
    if (eh * 60 + em <= sh * 60 + sm) return [];
    const step = Number(everyWeeks) > 0 ? Number(everyWeeks) : 1;
    const n = Math.max(1, Math.min(this.MAX_WEEKS, Number(weeks) || 1));
    const out = [];
    for (let i = 0; i < n; i++) {
      const day = new Date(first);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + i * step * 7);
      out.push({
        starts_at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm),
        ends_at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em),
      });
    }
    return out;
  },

  // "každý týden ve středu 15:00–16:00" – společný začátek hlášek.
  rhythm(list, everyWeeks) {
    if (!list.length) return "";
    const d = list[0].starts_at;
    const t = (x) => String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0");
    return (Number(everyWeeks) === 2 ? "ob týden " : "každý týden ") + this.DOW_IN[d.getDay()] +
      " " + t(d) + "–" + t(list[0].ends_at);
  },

  // Krátký popis série do hlášky ("každý týden ve středu 15:00–16:00, poslední 3. 11. 2026").
  describe(list, everyWeeks) {
    if (!list.length) return "";
    const last = list[list.length - 1].starts_at;
    return this.rhythm(list, everyWeeks) + ", poslední " +
      last.getDate() + ". " + (last.getMonth() + 1) + ". " + last.getFullYear();
  },
};
