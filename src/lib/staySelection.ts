import { dayOccupancy } from "./calendar";
import { isRangeAvailable, latestCheckout } from "./booking";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

/** Auswahl im Belegungskalender, alle Daten als UTC-Mitternacht. */
export type StaySelection = { from: Date; to?: Date };

/**
 * Kann an diesem Tag angereist werden? Nicht in der Vergangenheit, nicht an
 * belegten Tagen und nicht an Tagen, an denen ab 14 Uhr schon ein anderer Gast
 * einzieht. Der Abreisetag eines anderen Gasts ist dagegen ein möglicher
 * Anreisetag – dieselbe Regel wie im Datums-Picker des Formulars.
 */
export function canArrive(day: Date, occupancy: Occupancy, today: Date): boolean {
  if (day < today) return false;
  const state = dayOccupancy(day, occupancy.stays, occupancy.maintenance);
  return state !== "occupied" && state !== "arrival";
}

/** Kann dieser Tag als Abreise zur gewählten Anreise dienen? */
export function canDepart(from: Date, day: Date, occupancy: Occupancy): boolean {
  if (day <= from) return false;
  const periods = [...occupancy.stays, ...occupancy.maintenance];
  // Nicht über den nächsten belegten Zeitraum hinweg springen.
  const max = latestCheckout(periods, from);
  return (max === null || day <= max) && isRangeAvailable(periods, from, day);
}

/**
 * Nächste Auswahl nach einem Klick auf `day`:
 *
 * - Ohne Auswahl oder bei vollständigem Zeitraum beginnt ein neuer (Anreise).
 * - Mit gewählter Anreise wird ein späterer, erreichbarer Tag zur Abreise.
 * - Ein früherer Tag oder einer hinter einer Belegung ersetzt die Anreise.
 * - Ungültige Klicks ändern nichts.
 */
export function nextStaySelection(
  current: StaySelection | undefined,
  day: Date,
  occupancy: Occupancy,
  today: Date,
): StaySelection | undefined {
  const waehltAbreise = current !== undefined && current.to === undefined;

  if (waehltAbreise && canDepart(current.from, day, occupancy)) {
    return { from: current.from, to: day };
  }
  if (canArrive(day, occupancy, today)) {
    return { from: day };
  }
  return current;
}

/** Ist der Tag im aktuellen Auswahlschritt anklickbar? */
export function isSelectable(
  current: StaySelection | undefined,
  day: Date,
  occupancy: Occupancy,
  today: Date,
): boolean {
  const waehltAbreise = current !== undefined && current.to === undefined;
  return (
    (waehltAbreise && canDepart(current.from, day, occupancy)) ||
    canArrive(day, occupancy, today)
  );
}
