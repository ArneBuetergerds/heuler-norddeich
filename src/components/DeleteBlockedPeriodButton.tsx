"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Nur für Sperrzeiträume ohne Gast – daher ohne Rückfrage und ohne Begründung.
 * Belegungen werden stattdessen über die Storno-Aktion der Aufenthaltsliste
 * entfernt, weil dort ein Gast zu benachrichtigen ist.
 */
export function DeleteBlockedPeriodButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/blocked-period?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error("Der Sperrzeitraum konnte nicht entfernt werden.");
        return;
      }

      toast.success("Sperrzeitraum entfernt.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={handleDelete}
      className="h-11 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive sm:h-8"
    >
      Entfernen
    </Button>
  );
}
