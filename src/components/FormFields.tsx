"use client";

import type { ReactNode } from "react";

/**
 * Feldbausteine, die das Gastformular (`BookingRequestForm`) und das
 * Eintragen-Formular im Admin (`ManualBlockedPeriodForm`) teilen: Eine
 * telefonische Buchung soll sich genauso ausfüllen wie eine Online-Anfrage.
 */

/** Meldung samt Feld, zu dem sie gehört (`null` = allgemein, am Absende-Button). */
export type Fehler = { feld: string | null; text: string };

export const FELD =
  "h-13 w-full rounded-sm border border-linie bg-sand px-4 text-base text-schlick placeholder:text-schlick-3";

export function Feld({
  id,
  label,
  optional,
  fehler,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  /** Meldung, falls sie zu diesem Feld gehört. */
  fehler?: Fehler | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-klein font-medium text-schlick">
        {label}
        {optional && <span className="font-normal text-schlick-2"> — optional</span>}
      </label>
      {children}
      {fehler?.feld === id && <FehlerText id={`${id}-fehler`}>{fehler.text}</FehlerText>}
    </div>
  );
}

export function FehlerText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-klein font-medium text-destructive">
      {children}
    </p>
  );
}

/**
 * Zahlenfeld mit Plus und Minus. Bewusst kein reines `type="number"`: Auf dem
 * Handy sind die Spinner winzig, und die Werte bewegen sich hier zwischen 0
 * und 4 – da sind zwei große Schaltflächen schneller als die Tastatur.
 */
export function Zahlenfeld({
  id,
  name,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  /** Wofür gezählt wird – für die Beschriftung der Knöpfe im Screenreader. */
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (wert: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <SchrittButton
        label={`${name} verringern`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </SchrittButton>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-14 rounded-sm border border-linie bg-sand text-center text-base text-schlick tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <SchrittButton
        label={`${name} erhöhen`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </SchrittButton>
    </div>
  );
}

function SchrittButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-11 place-items-center rounded-pille border border-linie text-lg text-priel-tief disabled:opacity-30"
    >
      {children}
    </button>
  );
}
