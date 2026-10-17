"use client";

import { useState, useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayOccupancy } from "@/lib/calendar";
import { isRangeAvailable, latestCheckout } from "@/lib/booking";
import { seasonForDate, nightsBetween } from "@/lib/pricing";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

/**
 * "stay"  – Ende ist der Abreisetag und zählt selbst nicht mit; er darf mit dem
 *           Anreisetag des nächsten Gasts zusammenfallen (Übergabetag).
 * "block" – Ende ist der letzte gesperrte Tag und zählt mit. Ein Sperrzeitraum
 *           kennt keinen Übergabetag, er muss vollständig frei sein.
 *
 * Die beiden Bedeutungen stammen aus dem Datenmodell (siehe
 * `createMaintenanceBlock`) und sind hier nur nachgebildet, nicht erfunden.
 */
type Kind = "stay" | "block";

// react-day-picker liefert angeklickte Tage als lokale Mitternacht
// (new Date(jahr, monat, tag)). Sperrzeiträume aus der DB sind UTC-
// Mitternacht (Drizzle `date`-Spalten) – ohne diese Umrechnung würde der
// Vergleich in dayOccupancy für Besucher außerhalb UTC (z. B. Deutschland)
// um einen Tag verschoben.
export function toUtcMidnight(localDay: Date): Date {
  return new Date(Date.UTC(localDay.getFullYear(), localDay.getMonth(), localDay.getDate()));
}

function addUtcDays(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount),
  );
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

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type Props = {
  occupancy: Occupancy;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  id?: string;
  kind?: Kind;
  /** Im Admin dürfen auch vergangene Tage gewählt werden (Nachtragen). */
  allowPast?: boolean;
  /** Mindestaufenthalt der Anreisesaison einblenden (nur im Gastformular). */
  showSeasonHint?: boolean;
};

/** `true`, solange die Media Query zutrifft; beim Server-Rendern `false`. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function DateRangePicker({
  occupancy,
  range,
  onRangeChange,
  id,
  kind = "stay",
  allowPast = false,
  showSeasonHint = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const isWide = useMediaQuery("(min-width: 768px)");
  const periods = [...occupancy.stays, ...occupancy.maintenance];

  /** Enddatum in der exklusiven Form, die `isRangeAvailable` erwartet. */
  function exclusiveEnd(end: Date): Date {
    return kind === "stay" ? end : addUtcDays(end, 1);
  }

  function isDisabled(localDay: Date): boolean {
    const day = toUtcMidnight(localDay);

    if (!allowPast && day < todayUtc()) {
      return true;
    }

    // Zweiter Klick eines Aufenthalts: Jetzt wird der Abreisetag gewählt, und
    // dafür gelten andere Regeln als für die Anreise. Alles nach dem nächsten
    // belegten Zeitraum ist gesperrt, sonst könnte die Auswahl über eine
    // Belegung hinwegspringen – die belegten Tage sind zwar nicht anklickbar,
    // ein Klick dahinter würde sie aber stillschweigend einschließen.
    if (kind === "stay" && range?.from && !range.to && day > toUtcMidnight(range.from)) {
      const max = latestCheckout(periods, toUtcMidnight(range.from));
      return max !== null && day > max;
    }

    // "arrival": An diesem Tag beginnt bereits ein anderer Aufenthalt – ab
    // 14 Uhr ist der Tag vergeben, als Anreisetag also nicht mehr wählbar.
    // "departure"/"free" bleiben wählbar (Abreisetag eines anderen Gasts =
    // möglicher Anreisetag für diese Anfrage).
    const state = dayOccupancy(day, occupancy.stays, occupancy.maintenance);
    return state === "occupied" || state === "arrival";
  }

  /**
   * Letzte Instanz vor dem Absenden – und die einzige, die auch den Fall
   * abdeckt, dass der Nutzer *vor* seinen bereits gewählten Anreisetag klickt
   * und die Auswahl dadurch rückwärts über eine Belegung wächst. Geprüft wird
   * mit derselben Funktion, die der Server verwendet.
   */
  function handleSelect(next: DateRange | undefined, triggerDate: Date): void {
    if (next?.from && next.to) {
      const start = toUtcMidnight(next.from);
      const end = exclusiveEnd(toUtcMidnight(next.to));

      if (!isRangeAvailable(periods, start, end)) {
        onRangeChange({ from: triggerDate, to: undefined });
        return;
      }
    }

    onRangeChange(next);

    // Nur bei Aufenthalten schließen: Ein Sperrzeitraum ist schon nach dem
    // ersten Klick ein vollständiger Bereich (ein einzelner gesperrter Tag),
    // und der lässt sich durch einen zweiten Klick noch verlängern.
    if (kind === "stay" && next?.from && next.to) {
      setOpen(false);
    }
  }

  const season =
    showSeasonHint && range?.from ? seasonForDate(toUtcMidnight(range.from)) : null;
  const nights =
    range?.from && range.to
      ? nightsBetween(toUtcMidnight(range.from), exclusiveEnd(toUtcMidnight(range.to)))
      : null;

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            // Gleiche Höhe wie die übrigen Formularfelder (h-13): 32px waren
            // für das wichtigste Feld des Formulars ein zu kleines Tippziel.
            className="h-13 w-full justify-start rounded-sm border-linie bg-sand px-4 text-left text-base font-normal"
          >
            <CalendarIcon className="mr-2 size-5" />
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
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
          <Calendar
            // Mobil größere Tage (40px statt 28px) – dort wird mit dem Finger
            // getippt; am Desktop reichen 32px, damit zwei Monate nebeneinander
            // passen.
            className="[--cell-size:--spacing(10)] md:[--cell-size:--spacing(8)]"
            mode="range"
            selected={range}
            onSelect={(next, triggerDate) => handleSelect(next, triggerDate)}
            disabled={isDisabled}
            // Ohne Locale steht react-day-picker auf US-Standard: Wochenbeginn
            // Sonntag und englische Monats- und Wochentagsnamen.
            locale={de}
            // Explizit, nicht nur über die Locale: Der Wochenbeginn ist hier
            // eine bewusste Festlegung und soll nicht daran hängen, was eine
            // Bibliotheksaktualisierung für "de" hinterlegt. Der eigene
            // Belegungskalender rechnet in buildCalendarGrid ebenfalls fest
            // ab Montag.
            weekStartsOn={1}
            // Mobil nur ein Monat: Zwei gestapelte Monate sind höher als der
            // Bildschirm, der zweite läge unerreichbar außerhalb des Popovers.
            // Weiterblättern geht über die Pfeile.
            numberOfMonths={isWide ? 2 : 1}
            defaultMonth={range?.from}
            // Ohne min setzt react-day-pickers addToRange() beim ersten
            // Klick from UND to auf denselben Tag (siehe addToRange.js:
            // `to: min > 0 ? undefined : date`) – der Picker würde dann
            // sofort schließen, ohne dass ein Abreisetag gewählt wurde.
            // Für Sperrzeiträume ist genau das gewollt: ein einzelner Tag
            // ist dort ein gültiger Zeitraum.
            min={kind === "stay" ? 1 : undefined}
          />
        </PopoverContent>
      </Popover>

      {nights !== null && (
        <p className="text-mikro text-schlick-3">
          {kind === "stay"
            ? `${nights} ${nights === 1 ? "Nacht" : "Nächte"}`
            : `${nights} ${nights === 1 ? "Tag" : "Tage"} gesperrt`}
        </p>
      )}

      {season && (
        <p className="text-mikro text-schlick-2">
          Mindestaufenthalt in diesem Zeitraum: {season.minNights} Nächte
        </p>
      )}
    </div>
  );
}
