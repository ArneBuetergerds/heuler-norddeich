"use client";

import { isDateBlocked, isHandoverDay } from "@/lib/calendar";
import type { Occupancy } from "@/lib/occupancy";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

const FREE = "bg-green-50 text-green-800 border-green-200";
const OCCUPIED = "bg-red-50 text-red-700 border-red-200";
const BLOCKED = "bg-zinc-100 text-zinc-600 border-zinc-200";
// Diagonal von unten links (noch belegt, Abreise bis 10 Uhr) nach oben
// rechts (schon frei, Anreise ab 14 Uhr) – dieselben Farbtöne wie
// OCCUPIED/FREE, damit der Übergang stimmig aussieht.
const HANDOVER =
  "bg-[linear-gradient(to_top_right,var(--color-red-50)_50%,var(--color-green-50)_50%)] text-zinc-700 border-zinc-300";

/**
 * Der Admin sieht mehr als der Gast: Belegungen tragen den Namen des Gasts,
 * Sperrzeiträume ihre Notiz – beide sperren den Tag, sehen aber anders aus.
 * Übergabetage gibt es nur bei Aufenthalten (Abreise bis 10, Anreise ab 14
 * Uhr) – Sperrzeiträume kennen kein Halbtags-Ende, ihr Enddatum ist voll
 * mitgesperrt (siehe `createMaintenanceBlock`).
 */
export function OccupancyCalendar({ occupancy }: { occupancy: Occupancy }) {
  function appearanceFor(day: Date): DayAppearance {
    const stay = occupancy.stays.find((entry) => isDateBlocked(day, [entry]));
    if (stay) {
      return { className: OCCUPIED, title: stay.guestName };
    }

    const block = occupancy.maintenance.find((entry) => isDateBlocked(day, [entry]));
    if (block) {
      return { className: BLOCKED, title: block.note ?? "Gesperrt" };
    }

    if (isHandoverDay(day, occupancy.stays)) {
      return { className: HANDOVER, title: "Anreise möglich (Abreise bis 10 Uhr)" };
    }

    return { className: FREE, title: "Frei" };
  }

  return (
    <MonthCalendar
      appearanceFor={appearanceFor}
      legend={
        <>
          <CalendarLegendItem colorClassName="bg-green-500">Frei</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-[linear-gradient(to_top_right,var(--color-red-500)_50%,var(--color-green-500)_50%)]">
            Anreise möglich
          </CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-red-500">Gast da</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-zinc-400">Gesperrt</CalendarLegendItem>
        </>
      }
    />
  );
}
