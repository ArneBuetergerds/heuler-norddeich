"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminRequestActions({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleAction(action: "confirm" | "decline") {
    setPending(true);
    await fetch(`/api/admin/booking-request/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction("confirm")}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Bestätigen
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction("decline")}
        className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Ablehnen
      </button>
    </div>
  );
}
