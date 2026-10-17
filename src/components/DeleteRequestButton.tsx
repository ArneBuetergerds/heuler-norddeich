"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AdminDeletion } from "@/lib/retention";

const TEXTS: Record<"delete" | "anonymize", { title: string; description: string; label: string }> = {
  delete: {
    title: "Anfrage löschen?",
    description:
      "Die Anfrage wird mit allen Kontaktdaten endgültig gelöscht, bei einer vergangenen Buchung auch ihr Eintrag in der Belegung. Das lässt sich nicht rückgängig machen.",
    label: "Endgültig löschen",
  },
  anonymize: {
    title: "Anfrage löschen?",
    description:
      "Zu dieser Buchung gibt es eine Rechnung, die aufbewahrt werden muss. Die Anfrage wird deshalb nicht gelöscht, sondern anonymisiert: Entfernt werden Name, E-Mail, Telefon und Nachricht; die Rechnung bleibt bis zum Ablauf ihrer Aufbewahrungsfrist erhalten. Das lässt sich nicht rückgängig machen.",
    label: "Anonymisieren",
  },
};

/**
 * „Löschen“ für eine Anfrage, mit Rückfrage. Was möglich ist, entscheidet
 * `adminDeletionDecision` (src/lib/retention.ts); der Server prüft dasselbe
 * noch einmal.
 */
export function DeleteRequestButton({
  requestId,
  decision,
  onDone,
}: {
  requestId: number;
  decision: AdminDeletion;
  /** Nach erfolgreichem Löschen, z. B. um einen umgebenden Dialog zu schließen. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (decision === "already_anonymized") {
    return <span className="text-[11px] text-schlick-3">Anonymisiert</span>;
  }

  if (decision === "stay_ahead") {
    return (
      <p className="text-[11px] text-schlick-2">
        Löschen erst nach der Abreise möglich – vorher den Aufenthalt stornieren.
      </p>
    );
  }

  const text = TEXTS[decision];

  async function remove(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/booking-request/${requestId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message =
          data !== null && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Die Anfrage konnte nicht gelöscht werden.";
        toast.error(message);
        return;
      }

      toast.success(decision === "anonymize" ? "Anfrage anonymisiert." : "Anfrage gelöscht.");
      setOpen(false);
      onDone?.();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="h-11 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive sm:h-8"
      >
        Löschen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Wird gelöscht …" : text.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
