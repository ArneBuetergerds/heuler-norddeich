"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { BookingRequestForm } from "./BookingRequestForm";

type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

/**
 * Belegungskalender und Anfrageformular mit gemeinsamem Zeitraum: Ein Tipp in
 * den Kalender setzt das Datumsfeld des Formulars und umgekehrt.
 */
export function AvailabilityRequest({ occupancy }: { occupancy: Occupancy }) {
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  return (
    <div className="mt-8 grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
      <AvailabilityCalendar occupancy={occupancy} range={range} onRangeChange={setRange} />
      <BookingRequestForm occupancy={occupancy} range={range} onRangeChange={setRange} />
    </div>
  );
}
