"use client";

import { useState, type FormEvent } from "react";

export function BookingRequestForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      message: formData.get("message"),
    };

    const response = await fetch("/api/booking-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setStatus("success");
      event.currentTarget.reset();
    } else {
      const data = await response.json();
      setErrorMessage(
        typeof data.error === "string"
          ? data.error
          : "Bitte prüfen Sie Ihre Eingaben.",
      );
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="rounded bg-green-50 p-4 text-green-700">
        Vielen Dank für Ihre Anfrage! Wir melden uns zeitnah bei Ihnen.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input id="name" name="name" required className="w-full rounded border p-2" />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Telefon (optional)
        </label>
        <input id="phone" name="phone" className="w-full rounded border p-2" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="startDate" className="block text-sm font-medium">
            Anreise
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            className="w-full rounded border p-2"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="endDate" className="block text-sm font-medium">
            Abreise
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            className="w-full rounded border p-2"
          />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium">
          Nachricht (optional)
        </label>
        <textarea id="message" name="message" className="w-full rounded border p-2" />
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {status === "sending" ? "Wird gesendet…" : "Anfrage senden"}
      </button>
    </form>
  );
}
