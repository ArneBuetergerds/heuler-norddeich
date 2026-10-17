import { isDateBlocked } from "./calendar";
import type { Occupancy, Stay } from "./occupancy";

/**
 * Welche Aufenthalte gehören zu `day`, wenn im Admin-Kalender darauf geklickt
 * wird? Eine leere Liste heißt: Der Tag ist nicht anklickbar.
 *
 * - Freie Tage und Sperrzeiträume ohne Gast liefern nichts – die Liste daneben
 *   kennt sie ebenfalls nicht (Sperrzeiträume haben eine eigene Seite).
 * - Ein normaler Tag, ein Anreisetag oder ein reiner Abreisetag liefert genau
 *   den einen Aufenthalt.
 * - Am Wechseltag (Abreise des einen = Anreise des anderen) kommen beide,
 *   der abreisende zuerst – so wie der Tag abläuft (Abreise bis 10, Anreise
 *   ab 14 Uhr). Der Kalender bietet dann eine Auswahl an.
 *
 * Die Reihenfolge hängt nicht von der Reihenfolge in `occupancy.stays` ab.
 * Alle Daten als UTC-Mitternacht, wie im Kalender (siehe lib/calendar.ts).
 */
export function staysForDay(day: Date, occupancy: Occupancy): Stay[] {
  // Dieselbe Rangfolge wie die Einfärbung in OccupancyCalendar: Ein grau
  // gezeichneter Sperrtag darf keinen Gast öffnen.
  if (occupancy.maintenance.some((entry) => isDateBlocked(day, [entry]))) {
    return [];
  }

  const byStart = (a: Stay, b: Stay) => a.startDate.getTime() - b.startDate.getTime();
  const departing = occupancy.stays
    .filter((entry) => entry.endDate.getTime() === day.getTime())
    .sort(byStart);
  // Anreisetag und Tage mitten im Aufenthalt (Abreisetag ausgenommen).
  const covering = occupancy.stays
    .filter((entry) => isDateBlocked(day, [entry]))
    .sort(byStart);

  return [...departing, ...covering];
}

/** Rolle eines Aufenthalts an `day`, für die Beschriftung im Admin-Kalender. */
export function stayRoleOnDay(stay: Stay, day: Date): "Abreise" | "Anreise" | "Aufenthalt" {
  if (stay.endDate.getTime() === day.getTime()) {
    return "Abreise";
  }
  if (stay.startDate.getTime() === day.getTime()) {
    return "Anreise";
  }
  return "Aufenthalt";
}
