"use client";

import { useState } from "react";
import { isDateBlocked } from "@/lib/calendar";

type Period = { startDate: Date; endDate: Date };

function buildMonthDays(year: number, month: number): Date[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

export function AvailabilityCalendar({ blockedPeriods }: { blockedPeriods: Period[] }) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days = buildMonthDays(viewDate.getFullYear(), viewDate.getMonth());

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          className="px-2 py-1 hover:underline"
        >
          ← Vorheriger Monat
        </button>
        <span className="font-medium">
          {viewDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m + 1)}
          className="px-2 py-1 hover:underline"
        >
          Nächster Monat →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {days.map((day) => {
          const blocked = isDateBlocked(day, blockedPeriods);
          return (
            <div
              key={day.toISOString()}
              className={
                blocked
                  ? "rounded bg-red-100 p-2 text-red-700"
                  : "rounded bg-green-50 p-2 text-green-700"
              }
              title={blocked ? "belegt" : "frei"}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Rot = belegt, Grün = frei. Verbindliche Prüfung erfolgt nach Absenden Ihrer
        Anfrage.
      </p>
    </div>
  );
}
