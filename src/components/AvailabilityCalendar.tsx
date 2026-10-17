"use client";

import type { DateRange } from "react-day-picker";
import { dayOccupancy } from "@/lib/calendar";
import { nightsBetween } from "@/lib/pricing";
import { isSelectable, nextStaySelection, type StaySelection } from "@/lib/staySelection";
import { toUtcMidnight } from "./DateRangePicker";
import { MonthCalendar, CalendarLegendItem, type DayAppearance } from "./MonthCalendar";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

type Props = {
  occupancy: Occupancy;
  /** Gewählter Zeitraum, geteilt mit dem Anfrageformular (lokale Daten). */
  range?: DateRange;
  /** Ohne Callback bleibt der Kalender reine Anzeige. */
  onRangeChange?: (range: DateRange | undefined) => void;
};

const FREE = "bg-green-50 text-green-800 border-green-200";
// Durchgestrichen zusätzlich zur Farbe: Rot/Grün ist für viele Menschen mit
// Farbsehschwäche nicht unterscheidbar.
const BLOCKED = "bg-red-50 text-red-700 border-red-200 line-through";
// Diagonal von oben links nach unten rechts. Abreise: noch belegt (rot)
// oben links, ab 14 Uhr frei (grün) unten rechts. Anreise: umgekehrt – der
// Vormittag war noch frei, ab 14 Uhr zieht der Gast ein.
const DEPARTURE =
  "bg-[linear-gradient(to_bottom_right,var(--color-red-50)_50%,var(--color-green-50)_50%)] text-zinc-700 border-zinc-300";
const ARRIVAL =
  "bg-[linear-gradient(to_bottom_right,var(--color-green-50)_50%,var(--color-red-50)_50%)] text-zinc-700 border-zinc-300";
const PAST = "bg-zinc-50 text-zinc-300 border-zinc-100";
const SELECTED_EDGE = "bg-priel text-muschel border-priel";
const SELECTED_INSIDE = "bg-priel-hell text-schlick border-priel/30";

/** UTC-Mitternacht (Kalender) → lokale Mitternacht (Formular, react-day-picker). */
function toLocalDay(utcDay: Date): Date {
  return new Date(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), utcDay.getUTCDate());
}

export function AvailabilityCalendar({ occupancy, range, onRangeChange }: Props) {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const selection: StaySelection | undefined = range?.from
    ? { from: toUtcMidnight(range.from), to: range.to ? toUtcMidnight(range.to) : undefined }
    : undefined;

  function appearanceFor(day: Date): DayAppearance {
    if (selection) {
      const t = day.getTime();
      const from = selection.from.getTime();
      const to = selection.to?.getTime();
      if (t === from) return { className: SELECTED_EDGE, title: "Ihre Anreise" };
      if (t === to) return { className: SELECTED_EDGE, title: "Ihre Abreise" };
      if (to !== undefined && t > from && t < to) {
        return { className: SELECTED_INSIDE, title: "Ihr Zeitraum" };
      }
    }

    if (day < todayUtc) {
      return { className: PAST, title: "Vergangen" };
    }

    switch (dayOccupancy(day, occupancy.stays, occupancy.maintenance)) {
      case "occupied":
        return { className: BLOCKED, title: "Belegt oder gesperrt" };
      case "departure":
        return { className: DEPARTURE, title: "Wechseltag: Anreise ab 14 Uhr möglich" };
      case "arrival":
        // Ab 14 Uhr zieht hier ein anderer Gast ein – der Tag taugt nur noch
        // als Abreisetag (bis 10 Uhr), nicht als Anreise.
        return { className: ARRIVAL, title: "Nur Abreise möglich (bis 10 Uhr)" };
      case "free":
        return { className: FREE, title: "Frei" };
    }
  }

  function handleDayClick(day: Date): void {
    const next = nextStaySelection(selection, day, occupancy, todayUtc);
    if (next === selection || !onRangeChange) return;
    onRangeChange(
      next
        ? { from: toLocalDay(next.from), to: next.to ? toLocalDay(next.to) : undefined }
        : undefined,
    );
  }

  const nights =
    selection?.to !== undefined ? nightsBetween(selection.from, selection.to) : null;

  return (
    <div>
      {onRangeChange && (
        <p className="mb-3 text-klein text-schlick-2" aria-live="polite">
          {selection === undefined
            ? "Tippen Sie im Kalender auf Ihren Anreisetag und danach auf den Abreisetag."
            : selection.to === undefined
              ? "Jetzt den Abreisetag antippen."
              : `Gewählt: ${nights} ${nights === 1 ? "Nacht" : "Nächte"} – Preis und Anfrage im Formular.`}
        </p>
      )}

      <MonthCalendar
        appearanceFor={appearanceFor}
        minMonthOffset={0}
        onDayClick={onRangeChange ? handleDayClick : undefined}
        isDayClickable={(day) => isSelectable(selection, day, occupancy, todayUtc)}
        legend={
          <>
            <CalendarLegendItem colorClassName="bg-green-500">Frei</CalendarLegendItem>
            <CalendarLegendItem colorClassName="bg-[linear-gradient(to_bottom_right,var(--color-red-500)_50%,var(--color-green-500)_50%)]">
              Anreise ab 14 Uhr möglich
            </CalendarLegendItem>
            <CalendarLegendItem colorClassName="bg-[linear-gradient(to_bottom_right,var(--color-green-500)_50%,var(--color-red-500)_50%)]">
              Nur Abreise möglich (bis 10 Uhr)
            </CalendarLegendItem>
            <CalendarLegendItem colorClassName="bg-red-500">Belegt / gesperrt</CalendarLegendItem>
            {onRangeChange && (
              <CalendarLegendItem colorClassName="bg-priel">Ihr Zeitraum</CalendarLegendItem>
            )}
          </>
        }
      />

      {/* Mobil steht das Formular unter dem Kalender – nach der Auswahl
          führt der Knopf direkt zu Preis und Anfrage. */}
      {selection?.to !== undefined && (
        <a
          href="#anfrageformular"
          className="mt-4 flex h-13 items-center justify-center rounded-pille bg-priel px-8 text-base font-semibold text-muschel hover:bg-priel-tief md:hidden"
        >
          Weiter zur Anfrage
        </a>
      )}
    </div>
  );
}
