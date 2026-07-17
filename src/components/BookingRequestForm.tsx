"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "sending" | "success";

export function BookingRequestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Referenz vor dem await festhalten: danach ist `currentTarget` null und
    // `reset()` würde werfen.
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus("sending");
    setError(null);

    const response = await fetch("/api/booking-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        message: formData.get("message"),
      }),
    });

    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const message =
        data !== null && typeof data === "object" && "error" in data
          ? (data as { error: unknown }).error
          : null;
      setError(typeof message === "string" ? message : "Bitte prüfen Sie Ihre Eingaben.");
      setStatus("idle");
      return;
    }

    form.reset();
    setStatus("success");
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="mb-1 text-[17px] font-bold">Buchungsanfrage</h2>
      <p className="mb-5 text-[13px] text-zinc-500">
        Unverbindlich – wir melden uns zeitnah bei Ihnen.
      </p>

      {status === "success" ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="mb-1 text-sm font-semibold text-green-800">Anfrage gesendet</p>
          <p className="text-[13px] text-green-800">
            Status: ausstehend – Sie erhalten in Kürze eine Rückmeldung.
          </p>
          <Button
            variant="outline"
            className="mt-3.5 border-green-200 bg-white text-green-800 hover:bg-green-50 hover:text-green-800"
            onClick={() => setStatus("idle")}
          >
            Neue Anfrage stellen
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Vor- und Nachname" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="name@beispiel.de"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="phone">
              Telefon <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Input id="phone" name="phone" placeholder="0176 12345678" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">Anreise</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="endDate">Abreise</Label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="message">
              Nachricht <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Textarea
              id="message"
              name="message"
              rows={3}
              placeholder="Ihre Nachricht an uns …"
            />
          </div>

          <Button type="submit" disabled={status === "sending"} className="mt-1">
            {status === "sending" ? "Wird gesendet …" : "Anfrage senden"}
          </Button>

          <p className="mt-0.5 text-[11px] text-zinc-400">
            Wir prüfen Ihre Anfrage gegen bereits gesperrte Zeiträume und melden uns per
            E-Mail.
          </p>
        </form>
      )}
    </div>
  );
}
