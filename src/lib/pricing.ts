export type Season = {
  label: string;
  startMonthDay: readonly [month: number, day: number];
  endMonthDay: readonly [month: number, day: number];
  pricePerNight: number;
  minNights: number;
};

// Quelle: Preistabelle der alten Website. Zwei Lücken dort (31.08. und
// 06.–08.01., je ein Tag zwischen zwei Saisons ohne eigenen Eintrag) werden
// hier der jeweiligen Nachbarsaison zugeschlagen, damit jedes Kalenderdatum
// eindeutig einer Saison zugeordnet werden kann.
export const SEASONS: readonly Season[] = [
  { label: "09.01. – 31.03.", startMonthDay: [1, 9], endMonthDay: [3, 31], pricePerNight: 54, minNights: 3 },
  { label: "01.04. – 30.06.", startMonthDay: [4, 1], endMonthDay: [6, 30], pricePerNight: 74, minNights: 4 },
  { label: "01.07. – 31.08.", startMonthDay: [7, 1], endMonthDay: [8, 31], pricePerNight: 94, minNights: 7 },
  { label: "01.09. – 04.11.", startMonthDay: [9, 1], endMonthDay: [11, 4], pricePerNight: 74, minNights: 3 },
  { label: "05.11. – 22.12.", startMonthDay: [11, 5], endMonthDay: [12, 22], pricePerNight: 54, minNights: 3 },
  { label: "23.12. – 08.01.", startMonthDay: [12, 23], endMonthDay: [1, 8], pricePerNight: 74, minNights: 3 },
];

function monthDayValue(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Saison eines Datums, jahresunabhängig anhand von Monat/Tag ermittelt (die
 * Saisons wiederholen sich jedes Jahr identisch). Die Wintersaison läuft
 * über den Jahreswechsel – dort liegt `startMonthDay` zahlenmäßig hinter
 * `endMonthDay`, weshalb der Vergleich zwei Fälle unterscheidet.
 */
export function seasonForDate(date: Date): Season {
  const value = monthDayValue(date.getUTCMonth() + 1, date.getUTCDate());

  const season = SEASONS.find(({ startMonthDay: [sm, sd], endMonthDay: [em, ed] }) => {
    const start = monthDayValue(sm, sd);
    const end = monthDayValue(em, ed);
    return start <= end ? value >= start && value <= end : value >= start || value <= end;
  });

  if (!season) {
    throw new Error(`Keine Saison für Datum gefunden: ${date.toISOString()}`);
  }
  return season;
}

export function nightsBetween(startDate: Date, endDate: Date): number {
  const msPerNight = 1000 * 60 * 60 * 24;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerNight);
}
