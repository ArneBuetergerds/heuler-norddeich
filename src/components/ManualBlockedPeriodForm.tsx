"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ManualBlockedPeriodForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);

    await fetch("/api/admin/blocked-period", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        note: formData.get("note"),
      }),
    });

    setPending(false);
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="startDate" className="block text-sm">Von</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className="rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="endDate" className="block text-sm">Bis</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          required
          className="rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="note" className="block text-sm">Notiz</label>
        <input id="note" name="note" className="rounded border p-2" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        Hinzufügen
      </button>
    </form>
  );
}
