export function isDateBlocked(
  date: Date,
  periods: { startDate: Date; endDate: Date }[],
): boolean {
  return periods.some((p) => date >= p.startDate && date < p.endDate);
}
