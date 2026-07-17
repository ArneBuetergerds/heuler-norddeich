"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildCalendarGrid, WEEKDAY_LABELS } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DayAppearance = {
  className: string;
  /** Tooltip, z. B. der Gastname im Admin-Kalender. */
  title?: string;
};

type Props = {
  appearanceFor: (day: Date) => DayAppearance;
  legend: ReactNode;
};

/**
 * Gemeinsames Gerüst für den öffentlichen und den Admin-Kalender: Monats-
 * navigation, Wochentagskopf und Raster sind identisch, nur die Einfärbung der
 * Tage unterscheidet sich – die liefert der Aufrufer über `appearanceFor`.
 */
export function MonthCalendar({ appearanceFor, legend }: Props) {
  const [monthOffset, setMonthOffset] = useState(0);

  // Durchgehend in UTC rechnen, damit die Tage zu den aus der DB geladenen
  // Sperrzeiträumen passen (siehe lib/calendar.ts).
  const today = new Date();
  const view = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1),
  );
  const grid = buildCalendarGrid(view.getUTCFullYear(), view.getUTCMonth());

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setMonthOffset((offset) => offset - 1)}
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-bold">
          {view.toLocaleDateString("de-DE", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setMonthOffset((offset) => offset + 1)}
          aria-label="Nächster Monat"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[11px] font-semibold text-zinc-400"
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
          const { className, title } = appearanceFor(day);
          return (
            <div
              key={day.toISOString()}
              title={title}
              className={cn(
                "flex h-9 items-center justify-center rounded-md border text-xs font-semibold",
                className,
              )}
            >
              {day.getUTCDate()}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">{legend}</div>
    </div>
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
