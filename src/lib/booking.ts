import { rangesOverlap } from "./dateRange";

export type Period = { startDate: Date; endDate: Date };

export function isRangeAvailable(
  blockedPeriods: Period[],
  start: Date,
  end: Date,
): boolean {
  return !blockedPeriods.some((p) =>
    rangesOverlap(start, end, p.startDate, p.endDate),
  );
}

/**
 * Spätestmöglicher Abreisetag für eine Anreise am `start` – oder `null`, wenn
 * danach nichts mehr belegt ist.
 *
 * Es ist der Beginn des nächsten belegten Zeitraums, und zwar einschließlich:
 * Zeiträume sind halboffen ([start, end)), ein Aufenthalt darf also am
 * Anreisetag des nächsten Gasts enden. Wer bis 10 Uhr räumt, kollidiert nicht
 * mit dem, der ab 14 Uhr einzieht – `rangesOverlap` sieht das genauso.
 *
 * Der Wert begrenzt die Auswahl im Datepicker, damit ein Zeitraum nicht über
 * eine Belegung hinweg *springen* kann: Die belegten Tage selbst sind zwar
 * nicht anklickbar, ein Klick auf einen freien Tag dahinter würde sie aber
 * kommentarlos einschließen.
 */
export function latestCheckout(periods: Period[], start: Date): Date | null {
  let earliest: Date | null = null;

  for (const { startDate } of periods) {
    if (startDate > start && (earliest === null || startDate < earliest)) {
      earliest = startDate;
    }
  }

  return earliest;
}
