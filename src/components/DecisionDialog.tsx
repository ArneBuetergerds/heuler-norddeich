"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
};

/**
 * Gemeinsamer Dialog für Ablehnung und Storno: Beide sind aus Sicht des Gasts
 * dieselbe Nachricht – eine Absage mit optionaler Begründung.
 */
export function DecisionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  function handleOpenChange(next: boolean): void {
    if (!next) {
      setReason("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="decision-reason">
            Grund{" "}
            <span className="font-normal text-zinc-400">
              (optional, erscheint in der Benachrichtigungsmail)
            </span>
          </Label>
          <Textarea
            id="decision-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="z. B. Termin ist leider bereits vergeben …"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(reason)}
          >
            {pending ? "Wird gesendet …" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
