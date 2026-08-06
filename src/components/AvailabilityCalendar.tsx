"use client";

import { dayOccupancy } from "@/lib/calendar";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

const FREE = "bg-green-50 text-green-800 border-green-200";
const BLOCKED = "bg-red-50 text-red-700 border-red-200";
// Diagonal von oben links nach unten rechts. Abreise: noch belegt (rot)
// oben links, ab 14 Uhr frei (grün) unten rechts. Anreise: umgekehrt – der
// Vormittag war noch frei, ab 14 Uhr zieht der Gast ein.
const DEPARTURE =
  "bg-[linear-gradient(to_bottom_right,var(--color-red-50)_50%,var(--color-green-50)_50%)] text-zinc-700 border-zinc-300";
const ARRIVAL =
  "bg-[linear-gradient(to_bottom_right,var(--color-green-50)_50%,var(--color-red-50)_50%)] text-zinc-700 border-zinc-300";
const PAST = "bg-zinc-50 text-zinc-300 border-zinc-100";

export function AvailabilityCalendar({ occupancy }: { occupancy: Occupancy }) {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  function appearanceFor(day: Date): DayAppearance {
    if (day < todayUtc) {
      return { className: PAST, title: "Vergangen" };
    }

    switch (dayOccupancy(day, occupancy.stays, occupancy.maintenance)) {
      case "occupied":
        return { className: BLOCKED, title: "Belegt oder gesperrt" };
      case "departure":
        return { className: DEPARTURE, title: "Anreise möglich (Abreise bis 10 Uhr)" };
      case "arrival":
        return { className: ARRIVAL, title: "Anreise möglich (ab 14 Uhr)" };
      case "free":
        return { className: FREE, title: "Frei" };
    }
  }

  return (
    <MonthCalendar
      appearanceFor={appearanceFor}
      legend={
        <>
          <CalendarLegendItem colorClassName="bg-green-500">Frei</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-[linear-gradient(to_bottom_right,var(--color-red-500)_50%,var(--color-green-500)_50%)]">
            Anreise möglich (Abreise bis 10 Uhr)
          </CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-red-500">
            Belegt / gesperrt
          </CalendarLegendItem>
        </>
      }
    />
  );
}
