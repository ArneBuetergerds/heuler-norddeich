"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayOccupancy } from "@/lib/calendar";
import { seasonForDate, nightsBetween } from "@/lib/pricing";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

// react-day-picker liefert angeklickte Tage als lokale Mitternacht
// (new Date(jahr, monat, tag)). Sperrzeiträume aus der DB sind UTC-
// Mitternacht (Drizzle `date`-Spalten) – ohne diese Umrechnung würde der
// Vergleich in dayOccupancy für Besucher außerhalb UTC (z. B. Deutschland)
// um einen Tag verschoben.
function toUtcMidnight(localDay: Date): Date {
  return new Date(Date.UTC(localDay.getFullYear(), localDay.getMonth(), localDay.getDate()));
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Dieselbe "YYYY-MM-DD"-Form, die bisher `<input type="date">` lieferte –
 * aus den LOKALEN Datumsanteilen gebaut, nicht über `toISOString()` (das
 * würde in UTC umrechnen und den angeklickten Tag verschieben).
 */
export function toDateInputValue(localDay: Date): string {
  return `${localDay.getFullYear()}-${pad(localDay.getMonth() + 1)}-${pad(localDay.getDate())}`;
}

type Props = {
  occupancy: Occupancy;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
};

export function DateRangePicker({ occupancy, range, onRangeChange }: Props) {
  const [open, setOpen] = useState(false);

  function isDisabled(localDay: Date): boolean {
    const utcDay = toUtcMidnight(localDay);
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (utcDay < todayUtc) {
      return true;
    }

    // "arrival": An diesem Tag beginnt bereits ein anderer Aufenthalt – ab
    // 14 Uhr ist der Tag vergeben, für eine neue Anfrage also nicht mehr
    // wählbar. "departure"/"free" bleiben wählbar (Abreisetag eines
    // anderen Gasts = möglicher Anreisetag für diese Anfrage).
    const state = dayOccupancy(utcDay, occupancy.stays, occupancy.maintenance);
    return state === "occupied" || state === "arrival";
  }

  const season = range?.from ? seasonForDate(toUtcMidnight(range.from)) : null;
  const nights =
    range?.from && range?.to
      ? nightsBetween(toUtcMidnight(range.from), toUtcMidnight(range.to))
      : null;

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 size-4" />
            {range?.from ? (
              range.to ? (
                <>
                  {range.from.toLocaleDateString("de-DE")} –{" "}
                  {range.to.toLocaleDateString("de-DE")}
                </>
              ) : (
                range.from.toLocaleDateString("de-DE")
              )
            ) : (
              <span className="text-muted-foreground">Zeitraum wählen</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(next) => {
              onRangeChange(next);
              if (next?.from && next?.to) {
                setOpen(false);
              }
            }}
            disabled={isDisabled}
            numberOfMonths={2}
            defaultMonth={range?.from}
            // Ohne min setzt react-day-pickers addToRange() beim ersten
            // Klick from UND to auf denselben Tag (siehe addToRange.js:
            // `to: min > 0 ? undefined : date`) – der Picker würde dann
            // sofort schließen, ohne dass ein Enddatum gewählt wurde.
            min={1}
          />
        </PopoverContent>
      </Popover>

      {season && (
        <p className="text-[11px] text-zinc-400">
          Mindestaufenthalt in diesem Zeitraum: {season.minNights} Nächte
          {nights !== null && nights < season.minNights
            ? ` – aktuell ausgewählt: ${nights} ${nights === 1 ? "Nacht" : "Nächte"}`
            : ""}
        </p>
      )}
    </div>
  );
}
