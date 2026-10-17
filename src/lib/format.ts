/**
 * Datumsanzeige für die Oberfläche.
 *
 * `timeZone: "UTC"` ist zwingend: Die Daten kommen aus Drizzle-`date`-Spalten
 * und sind UTC-Mitternacht. Ohne die Angabe würde ein Browser östlich von UTC
 * den 1.8. als 31.7. anzeigen.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateRange(start: Date, end: Date): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Geldbetrag in deutscher Schreibweise, z. B. "1.234,50 €". */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}
