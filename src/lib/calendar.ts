export function isDateBlocked(
  date: Date,
  periods: { startDate: Date; endDate: Date }[],
): boolean {
  return periods.some((p) => date >= p.startDate && date < p.endDate);
}

export type DayOccupancy = "free" | "occupied" | "departure" | "arrival";

function addDays(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount),
  );
}

/**
 * Belegungszustand eines Tages inklusive Übergabetage: Die Wohnung wird bis
 * 10 Uhr geräumt und kann ab 14 Uhr neu bezogen werden.
 *
 * - "departure": Abreisetag eines Aufenthalts, ab 14 Uhr wieder frei.
 * - "arrival": Anreisetag eines Aufenthalts nach einem Vortag, der nicht in
 *   einem Sperrzeitraum lag – vormittags frei, ab 14 Uhr belegt. Liegt der
 *   Vortag in einem Sperrzeitraum, gilt der Tag als ganz normal "occupied":
 *   Ohne konkreten Vorgänger-Gast, von dem man abgrenzen könnte, wirkt der
 *   Übergabetag-Look hier eher irreführend als hilfreich.
 * - "occupied": Sperrzeitraum, ein durchgehender Aufenthalt, oder Abreise-
 *   und Anreisetag zweier verschiedener Aufenthalte fallen auf denselben Tag
 *   (beide Tageshälften sind dann belegt, nur von unterschiedlichen Gästen).
 * - "free": kein Zeitraum berührt den Tag.
 *
 * Sperrzeiträume selbst kennen keinen Übergabetag (siehe
 * `createMaintenanceBlock`) – sie tragen hier nur zur "occupied"-Erkennung
 * bei, nie zu "departure"/"arrival".
 */
export function dayOccupancy(
  date: Date,
  stays: { startDate: Date; endDate: Date }[],
  maintenance: { startDate: Date; endDate: Date }[],
): DayOccupancy {
  if (isDateBlocked(date, maintenance)) {
    return "occupied";
  }

  const isDeparture = stays.some((p) => p.endDate.getTime() === date.getTime());
  const isArrival = stays.some((p) => p.startDate.getTime() === date.getTime());

  if (isDeparture && isArrival) {
    return "occupied";
  }
  if (isDeparture) {
    return "departure";
  }
  if (isArrival) {
    return isDateBlocked(addDays(date, -1), maintenance) ? "occupied" : "arrival";
  }

  return isDateBlocked(date, stays) ? "occupied" : "free";
}

// Blocked-period-Daten kommen aus Drizzle `date`-Spalten und werden als
// UTC-Mitternacht geparst (z.B. "2026-08-01" -> 2026-08-01T00:00:00Z). Die
// Kalendertage müssen deshalb ebenfalls in UTC konstruiert werden, sonst
// verschiebt sich der Vergleich in isDateBlocked für Besucher außerhalb UTC
// (z.B. Deutschland, UTC+1/+2) um einen Tag.
export function buildMonthDays(year: number, month: number): Date[] {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month, i + 1)));
}

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

// 6 Wochen à 7 Tage fassen jeden Monat, unabhängig vom Starttag – dadurch
// springt das Raster beim Monatswechsel nicht in der Höhe.
const CALENDAR_CELLS = 42;

/**
 * Monatsraster mit führenden und abschließenden Leerzellen (`null`), damit jeder
 * Tag unter seinem Wochentag steht. Montag ist die erste Spalte, wie in
 * Deutschland üblich – `getUTCDay()` zählt ab Sonntag, daher die Verschiebung.
 */
export function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = buildMonthDays(year, month);

  return Array.from({ length: CALENDAR_CELLS }, (_, cell) => days[cell - firstWeekday] ?? null);
}
