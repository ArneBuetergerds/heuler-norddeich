export function isDateBlocked(
  date: Date,
  periods: { startDate: Date; endDate: Date }[],
): boolean {
  return periods.some((p) => date >= p.startDate && date < p.endDate);
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
