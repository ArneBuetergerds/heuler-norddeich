"use client";

import { isDateBlocked } from "@/lib/calendar";
import type { Occupancy } from "@/lib/occupancy";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

const FREE = "bg-green-50 text-green-800 border-green-200";
const OCCUPIED = "bg-red-50 text-red-700 border-red-200";
const BLOCKED = "bg-zinc-100 text-zinc-600 border-zinc-200";

/**
 * Der Admin sieht mehr als der Gast: Belegungen tragen den Namen des Gasts,
 * Sperrzeiträume ihre Notiz – beide sperren den Tag, sehen aber anders aus.
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

    return { className: FREE, title: "Frei" };
  }

  return (
    <MonthCalendar
      appearanceFor={appearanceFor}
      legend={
        <>
          <CalendarLegendItem colorClassName="bg-green-500">Frei</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-red-500">Gast da</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-zinc-400">Gesperrt</CalendarLegendItem>
        </>
      }
    />
  );
}
