"use client";

import { isDateBlocked, isHandoverDay } from "@/lib/calendar";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

type Period = { startDate: Date; endDate: Date };

const FREE = "bg-green-50 text-green-800 border-green-200";
const BLOCKED = "bg-red-50 text-red-700 border-red-200";
// Diagonal von unten links (noch belegt, Abreise bis 10 Uhr) nach oben
// rechts (schon frei, Anreise ab 14 Uhr) – die Tailwind-Farbvariablen
// halten die Farben synchron mit FREE/BLOCKED.
const HANDOVER =
  "bg-[linear-gradient(to_top_right,var(--color-red-50)_50%,var(--color-green-50)_50%)] text-zinc-700 border-zinc-300";
const PAST = "bg-zinc-50 text-zinc-300 border-zinc-100";

export function AvailabilityCalendar({ blockedPeriods }: { blockedPeriods: Period[] }) {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  function appearanceFor(day: Date): DayAppearance {
    if (day < todayUtc) {
      return { className: PAST, title: "Vergangen" };
    }
    if (isDateBlocked(day, blockedPeriods)) {
      return { className: BLOCKED, title: "Belegt oder gesperrt" };
    }
    if (isHandoverDay(day, blockedPeriods)) {
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
