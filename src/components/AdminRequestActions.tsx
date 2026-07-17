"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DecisionDialog } from "./DecisionDialog";

type Props = {
  requestId: number;
  guestName: string;
};

export function AdminRequestActions({ requestId, guestName }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function decide(action: "confirm" | "decline", reason?: string): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/booking-request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });

      // Ein 409 bedeutet, dass der Zeitraum zwischenzeitlich belegt wurde. Ohne
      // Rückmeldung sähe der Admin nur, dass sich nichts tut.
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data !== null && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Die Aktion konnte nicht ausgeführt werden.";
        toast.error(message);
        return;
      }

      toast.success(
        action === "confirm"
          ? `Aufenthalt von ${guestName} bestätigt.`
          : `Anfrage von ${guestName} abgelehnt.`,
      );
      setDialogOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide("confirm")}>
          Bestätigen
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setDialogOpen(true)}
          className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
        >
          Ablehnen
        </Button>
      </div>

      <DecisionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Anfrage ablehnen?"
        description="Der Gast wird per E-Mail über die Ablehnung informiert."
        confirmLabel="Ablehnen"
        pending={pending}
        onConfirm={(reason) => decide("decline", reason)}
      />
    </>
  );
}
