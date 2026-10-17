import { isDateBlocked } from "./calendar";
import type { Occupancy, Stay } from "./occupancy";

/**
 * Welcher Aufenthalt öffnet sich, wenn im Admin-Kalender auf `day` geklickt
 * wird? `null` heißt: Der Tag ist nicht anklickbar.
 *
 * - Freie Tage und Sperrzeiträume ohne Gast öffnen nichts – die Liste daneben
 *   kennt sie ebenfalls nicht (Sperrzeiträume haben eine eigene Seite).
 * - Am Wechseltag (Abreise des einen = Anreise des anderen) gewinnt immer der
 *   anreisende Gast. Das ist eindeutig, und keiner geht verloren: Jeder
 *   Aufenthalt ist an seinem Anreisetag erreichbar, denn dort kann kein
 *   zweiter beginnen.
 * - Ein reiner Abreisetag gehört dem abreisenden Gast.
 *
 * Alle Daten als UTC-Mitternacht, wie im Kalender (siehe lib/calendar.ts).
 */
export function stayForDay(day: Date, occupancy: Occupancy): Stay | null {
  // Dieselbe Rangfolge wie die Einfärbung in OccupancyCalendar: Ein grau
  // gezeichneter Sperrtag darf keinen Gast öffnen.
  if (occupancy.maintenance.some((entry) => isDateBlocked(day, [entry]))) {
    return null;
  }

  const covering = occupancy.stays.find((entry) => isDateBlocked(day, [entry]));
  if (covering) {
    return covering;
  }

  return occupancy.stays.find((entry) => entry.endDate.getTime() === day.getTime()) ?? null;
}
