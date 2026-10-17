"use client";

import { Fragment, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildCalendarGrid, WEEKDAY_LABELS } from "@/lib/calendar";
import type { MonthLinks } from "@/lib/month";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DayAppearance = {
  className: string;
  /** Tooltip, z. B. der Gastname im Admin-Kalender. */
  title?: string;
  /**
   * Was ein Klick auf den Tag tut, nur für Screenreader – z. B. „Details zu
   * Gast X öffnen“ oder „Auswahl öffnen“ am Wechseltag.
   */
  action?: string;
};

type Props = {
  appearanceFor: (day: Date) => DayAppearance;
  legend: ReactNode;
  /**
   * Frühester Monat relativ zu heute. Gäste brauchen keine vergangenen Monate
   * (0), der Admin darf zurückblättern (undefined = unbegrenzt).
   */
  minMonthOffset?: number;
  /**
   * Monat und Blätter-Links vom Server, wenn der Monat in der Adresse steht
   * (Admin: `?monat=`). Dann sind die Pfeile Links und `minMonthOffset` gilt
   * nicht. Ohne: Blättern im Client, ab dem aktuellen Monat (öffentlich).
   */
  monthLinks?: MonthLinks;
  /**
   * Macht Tage anklickbar (öffentlicher Kalender: Zeitraum direkt wählen;
   * Admin: Aufenthalt öffnen). Ohne diesen Callback bleibt er reine Anzeige.
   */
  onDayClick?: (day: Date) => void;
  /** Welche Tage im aktuellen Auswahlschritt anklickbar sind. */
  isDayClickable?: (day: Date) => boolean;
  /**
   * Umhüllt den Knopf eines anklickbaren Tags, z. B. mit einem Popover, das
   * am Tag verankert ist (Admin: Auswahl am Wechseltag). Wer den Knopf
   * unverändert zurückgibt, ändert nichts.
   */
  wrapDay?: (day: Date, dayButton: ReactElement) => ReactNode;
};

/**
 * Gemeinsames Gerüst für den öffentlichen und den Admin-Kalender: Monats-
 * navigation, Wochentagskopf und Raster sind identisch, nur die Einfärbung der
 * Tage unterscheidet sich – die liefert der Aufrufer über `appearanceFor`.
 */
export function MonthCalendar({
  appearanceFor,
  legend,
  minMonthOffset,
  monthLinks,
  onDayClick,
  isDayClickable,
  wrapDay,
}: Props) {
  const [monthOffset, setMonthOffset] = useState(0);

  // Durchgehend in UTC rechnen, damit die Tage zu den aus der DB geladenen
  // Sperrzeiträumen passen (siehe lib/calendar.ts).
  const today = new Date();
  const view =
    monthLinks?.month ??
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const grid = buildCalendarGrid(view.getUTCFullYear(), view.getUTCMonth());

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        {monthLinks ? (
          <MonthLink href={monthLinks.previousHref} label="Vorheriger Monat">
            <ChevronLeft className="size-4" />
          </MonthLink>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => setMonthOffset((offset) => offset - 1)}
            disabled={minMonthOffset !== undefined && monthOffset <= minMonthOffset}
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <span className="text-sm font-bold" aria-live="polite">
          {view.toLocaleDateString("de-DE", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        {monthLinks ? (
          <MonthLink href={monthLinks.nextHref} label="Nächster Monat">
            <ChevronRight className="size-4" />
          </MonthLink>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => setMonthOffset((offset) => offset + 1)}
            aria-label="Nächster Monat"
          >
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>

      {monthLinks?.currentHref && (
        <div className="-mt-3 mb-2 flex justify-center">
          <Link
            href={monthLinks.currentHref}
            scroll={false}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-schlick-2 underline underline-offset-2 hover:text-schlick"
          >
            Zum aktuellen Monat
          </Link>
        </div>
      )}

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[11px] font-semibold text-schlick-2"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, cell) => {
          if (!day) {
            return <div key={`leer-${cell}`} className="h-9" />;
          }
          const { className, title, action } = appearanceFor(day);
          const label = (
            <>
              <span aria-hidden="true">{day.getUTCDate()}</span>
              {/* Der Zustand steckt sonst nur in Farbe und Tooltip – beides
                  erreicht weder Screenreader noch Touch-Geräte. */}
              <span className="sr-only">
                {day.toLocaleDateString("de-DE", {
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
                {title ? `: ${title}` : ""}
                {action ? `. ${action}` : ""}
              </span>
            </>
          );
          const cellClass = cn(
            "flex h-9 items-center justify-center rounded-md border text-xs font-semibold",
            className,
          );

          if (onDayClick) {
            const clickable = isDayClickable?.(day) ?? true;
            const dayButton = (
              <button
                type="button"
                title={title}
                disabled={!clickable}
                onClick={() => onDayClick(day)}
                className={cn(
                  cellClass,
                  "h-11 outline-none focus-visible:ring-2 focus-visible:ring-priel focus-visible:ring-offset-1 sm:h-10",
                  clickable && "cursor-pointer hover:ring-2 hover:ring-priel/40",
                )}
              >
                {label}
              </button>
            );
            return (
              <Fragment key={day.toISOString()}>
                {wrapDay ? wrapDay(day, dayButton) : dayButton}
              </Fragment>
            );
          }

          return (
            <div key={day.toISOString()} title={title} className={cellClass}>
              {label}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">{legend}</div>
    </div>
  );
}

/**
 * Pfeil als Link auf einen anderen Monat. Ohne `href` (Grenze erreicht) ein
 * deaktivierter Knopf, damit der Kopf nicht springt.
 */
function MonthLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  if (href === null) {
    return (
      <Button variant="outline" size="icon" className="size-11" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon" className="size-11">
      {/* Ohne Sprung nach oben: Wer blättert, will im Kalender bleiben. */}
      <Link href={href} scroll={false} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}

export function CalendarLegendItem({
  colorClassName,
  children,
}: {
  colorClassName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-600">
      <span className={cn("inline-block size-2.5 rounded-[3px]", colorClassName)} />
      {children}
    </div>
  );
}
