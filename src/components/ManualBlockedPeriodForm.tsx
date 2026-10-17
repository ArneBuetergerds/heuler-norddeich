"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateRangePicker, toDateInputValue } from "@/components/DateRangePicker";
import { cn } from "@/lib/utils";

type EntryKind = "block" | "stay";
type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

const KIND_OPTIONS = [
  { value: "block", label: "Sperrzeitraum" },
  { value: "stay", label: "Aufenthalt" },
] as const;

export function ManualBlockedPeriodForm({ occupancy }: { occupancy: Occupancy }) {
  const router = useRouter();
  const [kind, setKind] = useState<EntryKind>("block");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Beide Eintragsarten teilen sich den Picker, meinen mit "Ende" aber
   * Verschiedenes: beim Aufenthalt den Abreisetag (zählt nicht mit), beim
   * Sperrzeitraum den letzten gesperrten Tag (zählt mit). Die API erwartet
   * genau diese Formen – `createMaintenanceBlock` rechnet serverseitig einen
   * Tag drauf, `createManualStay` nicht.
   */
  function changeKind(next: EntryKind): void {
    setKind(next);
    // Ein bereits gewählter Zeitraum würde nach dem Wechsel etwas anderes
    // bedeuten als beim Anklicken - deshalb zurücksetzen statt umdeuten.
    setRange(undefined);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Referenz vor dem await festhalten: danach ist `currentTarget` null und
    // `reset()` würde werfen.
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!range?.from || !range.to) {
      setError("Bitte wählen Sie einen Zeitraum.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/blocked-period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: toDateInputValue(range.from),
          endDate: toDateInputValue(range.to),
          note: kind === "block" ? formData.get("note") || undefined : undefined,
          guestName: kind === "stay" ? formData.get("guestName") : undefined,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setError("Der Zeitraum überschneidet sich mit einem bestehenden Eintrag.");
          return;
        }
        // Die API liefert bei 400 eine lesbare Meldung im Feld `error`.
        const data: unknown = await response.json().catch(() => null);
        setError(
          data !== null && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Bitte prüfen Sie Ihre Eingaben.",
        );
        return;
      }

      toast.success(kind === "stay" ? "Aufenthalt eingetragen." : "Zeitraum gesperrt.");
      form.reset();
      setRange(undefined);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold">Zeitraum eintragen</h2>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-track p-1">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => changeKind(option.value)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
              kind === option.value
                ? "bg-muschel text-schlick shadow-sm"
                : "text-schlick-2 hover:text-schlick",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="period">
            {kind === "stay" ? "Anreise / Abreise" : "Erster / letzter gesperrter Tag"}
          </Label>
          <DateRangePicker
            id="period"
            occupancy={occupancy}
            range={range}
            onRangeChange={setRange}
            kind={kind}
            allowPast
          />
        </div>

        {kind === "block" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="note">
              Notiz <span className="font-normal text-schlick-3">(optional)</span>
            </Label>
            <Input id="note" name="note" placeholder="z. B. Eigennutzung, Wartung" />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="guestName">Gastname</Label>
            <Input
              id="guestName"
              name="guestName"
              required
              placeholder="z. B. Familie Janssen"
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="mt-1">
          {pending
            ? "Wird gespeichert …"
            : kind === "stay"
              ? "Aufenthalt eintragen"
              : "Sperrzeitraum hinzufügen"}
        </Button>
      </div>
    </form>
  );
}
