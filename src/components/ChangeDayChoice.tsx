"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateRange } from "@/lib/format";
import type { Stay } from "@/lib/occupancy";
import { stayRoleOnDay } from "@/lib/stayForDay";

const NAVIGATION_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

/**
 * Auswahl am Wechseltag im Admin-Kalender: Der Tag gehört zwei Aufenthalten,
 * ein Klick fragt deshalb, welcher geöffnet werden soll („Abreise: A“ /
 * „Anreise: B“). `children` ist der Tag-Knopf aus `MonthCalendar`, an dem das
 * Popover verankert wird.
 *
 * Die Detailansicht öffnet sich erst, wenn das Popover geschlossen ist und den
 * Fokus an den Tag zurückgegeben hat (`onCloseAutoFocus`). So merkt sich der
 * Dialog den Tag als Rücksprungziel, und nach dem Schließen steht der Fokus
 * wieder dort, wo er vorher war.
 */
export function ChangeDayChoice({
  day,
  stays,
  onSelect,
  children,
}: {
  day: Date;
  /** In Anzeigereihenfolge, siehe `staysForDay` (Abreise vor Anreise). */
  stays: Stay[];
  onSelect: (stay: Stay) => void;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const chosen = useRef<Stay | null>(null);
  const titleId = useId();

  // Pfeiltasten wie in einem Menü; Tab funktioniert ohnehin.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!NAVIGATION_KEYS.includes(event.key)) {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-choice]"),
    );
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const current = items.findIndex((item) => item === document.activeElement);
    const last = items.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : current <= 0
              ? last
              : current - 1;
    items[next].focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        collisionPadding={16}
        className="w-64"
        onKeyDown={handleKeyDown}
        onCloseAutoFocus={() => {
          // Radix setzt den Fokus direkt danach auf den Tag zurück.
          const stay = chosen.current;
          chosen.current = null;
          if (stay) {
            onSelect(stay);
          }
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>
            Wechseltag,{" "}
            {day.toLocaleDateString("de-DE", {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-col gap-1">
          {stays.map((stay) => (
            <Button
              key={stay.id}
              type="button"
              variant="ghost"
              data-choice
              className="h-auto min-h-11 w-full flex-col items-start justify-center gap-0 py-1.5 text-left whitespace-normal"
              onClick={() => {
                chosen.current = stay;
                setOpen(false);
              }}
            >
              <span>
                {stayRoleOnDay(stay, day)}: {stay.guestName}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {formatDateRange(stay.startDate, stay.endDate)}
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
