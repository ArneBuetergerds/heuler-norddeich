"use client";

import { isDateBlocked, isHandoverDay } from "@/lib/calendar";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

type Period = { startDate: Date; endDate: Date };

const FREE = "bg-green-50 text-green-800 border-green-200";
const BLOCKED = "bg-red-50 text-red-700 border-red-200";
const HANDOVER = "bg-amber-50 text-amber-800 border-amber-200";
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
          <CalendarLegendItem colorClassName="bg-amber-500">
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
