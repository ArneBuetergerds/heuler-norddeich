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
