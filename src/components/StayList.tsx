"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Stay } from "@/lib/occupancy";
import { formatDateRange } from "@/lib/format";
import { DecisionDialog } from "./DecisionDialog";

export function StayList({ stays }: { stays: Stay[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<Stay | null>(null);

  async function cancelStay(stay: Stay, reason: string): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/blocked-period?id=${stay.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        toast.error("Der Aufenthalt konnte nicht storniert werden.");
        return;
      }

      toast.success(`Aufenthalt von ${stay.guestName} storniert.`);
      setTarget(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (stays.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-5 text-center text-[13px] text-zinc-400">
        Keine bestätigten Aufenthalte.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {stays.map((stay) => (
          <div
            key={stay.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3.5 py-3"
          >
            <div>
              <div className="text-[13px] font-semibold">{stay.guestName}</div>
              <div className="text-xs text-zinc-500">
                {formatDateRange(stay.startDate, stay.endDate)}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setTarget(stay)}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
            >
              Stornieren
            </Button>
          </div>
        ))}
      </div>

      <DecisionDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Aufenthalt stornieren?"
        description={
          target?.bookingRequestId === null
            ? "Der Aufenthalt wurde manuell eingetragen – es wird niemand benachrichtigt."
            : "Der Gast wird per E-Mail über die Stornierung informiert."
        }
        confirmLabel="Stornieren"
        pending={pending}
        onConfirm={(reason) => target && cancelStay(target, reason)}
      />
    </>
  );
}
