"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type EntryKind = "block" | "stay";

const KIND_OPTIONS = [
  { value: "block", label: "Sperrzeitraum" },
  { value: "stay", label: "Aufenthalt" },
] as const;

export function ManualBlockedPeriodForm() {
  const router = useRouter();
  const [kind, setKind] = useState<EntryKind>("block");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Referenz vor dem await festhalten: danach ist `currentTarget` null und
    // `reset()` würde werfen.
    const form = event.currentTarget;
    const formData = new FormData(form);

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/blocked-period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: formData.get("startDate"),
          endDate: formData.get("endDate"),
          note: kind === "block" ? formData.get("note") || undefined : undefined,
          guestName: kind === "stay" ? formData.get("guestName") : undefined,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 409
            ? "Der Zeitraum überschneidet sich mit einem bestehenden Eintrag."
            : "Bitte prüfen Sie Ihre Eingaben.",
        );
        return;
      }

      toast.success(kind === "stay" ? "Aufenthalt eingetragen." : "Zeitraum gesperrt.");
      form.reset();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold">Zeitraum eintragen</h2>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
              kind === option.value
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="startDate">Start</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="endDate">Ende</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>

        {kind === "block" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="note">
              Notiz <span className="font-normal text-zinc-400">(optional)</span>
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
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
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
