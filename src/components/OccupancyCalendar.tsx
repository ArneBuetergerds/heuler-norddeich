"use client";

import { isDateBlocked, dayOccupancy } from "@/lib/calendar";
import type { Occupancy } from "@/lib/occupancy";
import { stayForDay } from "@/lib/stayForDay";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";
import { useOpenStayDetail } from "./StayDetailProvider";

const FREE = "bg-green-50 text-green-800 border-green-200";
const OCCUPIED = "bg-red-50 text-red-700 border-red-200";
const BLOCKED = "bg-zinc-100 text-zinc-600 border-zinc-200";
// Diagonal von oben links nach unten rechts. Abreise: noch belegt (rot) oben
// links, ab 14 Uhr frei (grün) unten rechts. Anreise: umgekehrt – der
// Vormittag war noch frei, ab 14 Uhr zieht der Gast ein.
const DEPARTURE =
  "bg-[linear-gradient(to_bottom_right,var(--color-red-50)_50%,var(--color-green-50)_50%)] text-zinc-700 border-zinc-300";
const ARRIVAL =
  "bg-[linear-gradient(to_bottom_right,var(--color-green-50)_50%,var(--color-red-50)_50%)] text-zinc-700 border-zinc-300";

/**
 * Der Admin sieht mehr als der Gast: Belegungen tragen den Namen des Gasts,
 * Sperrzeiträume ihre Notiz – beide sperren den Tag, sehen aber anders aus.
 * Übergabetage gibt es nur bei Aufenthalten (Abreise bis 10, Anreise ab 14
 * Uhr) – Sperrzeiträume kennen kein Halbtags-Ende, ihr Enddatum ist voll
 * mitgesperrt (siehe `createMaintenanceBlock`).
 *
 * Ein Klick auf einen Tag mit Gast öffnet dieselbe Detailansicht wie die
 * Liste; welcher Aufenthalt das ist, entscheidet `stayForDay` (am Wechseltag
 * der anreisende Gast). Freie und gesperrte Tage sind nicht anklickbar.
 */
export function OccupancyCalendar({ occupancy }: { occupancy: Occupancy }) {
  const openDetail = useOpenStayDetail();

  function appearanceFor(day: Date): DayAppearance {
    const stay = stayForDay(day, occupancy);
    const base = appearanceWithoutAction(day);
    return stay ? { ...base, action: `Details zu ${stay.guestName} öffnen` } : base;
  }

  function appearanceWithoutAction(day: Date): DayAppearance {
    const state = dayOccupancy(day, occupancy.stays, occupancy.maintenance);

    if (state === "free") {
      return { className: FREE, title: "Frei" };
    }

    if (state === "departure") {
      const stay = occupancy.stays.find((entry) => entry.endDate.getTime() === day.getTime());
      return { className: DEPARTURE, title: `${stay?.guestName ?? "Gast"} (Abreise bis 10 Uhr)` };
    }

    if (state === "arrival") {
      const stay = occupancy.stays.find(
        (entry) => entry.startDate.getTime() === day.getTime(),
      );
      return { className: ARRIVAL, title: `${stay?.guestName ?? "Gast"} (Anreise ab 14 Uhr)` };
    }

    // state === "occupied": Sperrzeitraum, ein durchgehender Aufenthalt,
    // oder Ab- und Anreise zweier verschiedener Gäste am selben Tag.
    const block = occupancy.maintenance.find((entry) => isDateBlocked(day, [entry]));
    if (block) {
      return { className: BLOCKED, title: block.note ?? "Gesperrt" };
    }

    const stay = occupancy.stays.find((entry) => isDateBlocked(day, [entry]));
    if (stay) {
      return { className: OCCUPIED, title: stay.guestName };
    }

    const departing = occupancy.stays.find(
      (entry) => entry.endDate.getTime() === day.getTime(),
    );
    const arriving = occupancy.stays.find(
      (entry) => entry.startDate.getTime() === day.getTime(),
    );
    return {
      className: OCCUPIED,
      title: `${departing?.guestName ?? "Gast"} (Abreise) / ${arriving?.guestName ?? "Gast"} (Anreise)`,
    };
  }

  return (
    <MonthCalendar
      appearanceFor={appearanceFor}
      onDayClick={(day) => {
        const stay = stayForDay(day, occupancy);
        if (stay) {
          openDetail(stay);
        }
      }}
      isDayClickable={(day) => stayForDay(day, occupancy) !== null}
      legend={
        <>
          <CalendarLegendItem colorClassName="bg-green-500">Frei</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-[linear-gradient(to_bottom_right,var(--color-red-500)_50%,var(--color-green-500)_50%)]">
            Anreise möglich
          </CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-red-500">Gast da</CalendarLegendItem>
          <CalendarLegendItem colorClassName="bg-zinc-400">Gesperrt</CalendarLegendItem>
        </>
      }
    />
  );
}
