"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ADDRESS_REQUIRED_CODE, CONFIRM_WARNING } from "@/lib/invoice";
import { DecisionDialog } from "./DecisionDialog";
import { ConfirmAddressDialog, type ConfirmAddress } from "./ConfirmAddressDialog";
import type { Fehler } from "./FormFields";

type Props = {
  requestId: number;
  guestName: string;
};

/** Antwort von PATCH /api/admin/booking-request/[id], soweit sie hier gelesen wird. */
type DecisionResponse = {
  error?: unknown;
  field?: unknown;
  code?: unknown;
  invoice?: { number?: unknown } | null;
  warning?: unknown;
  warningCode?: unknown;
};

const ADDRESS_FIELDS = new Set(["street", "postalCode", "city", "country"]);

export function AdminRequestActions({ requestId, guestName }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressFehler, setAddressFehler] = useState<Fehler | null>(null);

  async function decide(
    action: "confirm" | "decline",
    reason?: string,
    address?: ConfirmAddress,
  ): Promise<void> {
    setPending(true);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/admin/booking-request/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason, address }),
        });
      } catch {
        toast.error("Keine Verbindung. Bitte die Internetverbindung prüfen und erneut versuchen.");
        return;
      }
      const data = (await response.json().catch(() => null)) as DecisionResponse | null;

      // Ein 409 bedeutet, dass der Zeitraum zwischenzeitlich belegt wurde. Ohne
      // Rückmeldung sähe der Admin nur, dass sich nichts tut.
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Die Aktion konnte nicht ausgeführt werden.";

        // Anfrage ohne Anschrift: Es wurde nichts bestätigt. Erst die
        // Anschrift abfragen, dann mit ihr erneut bestätigen.
        if (action === "confirm" && data?.code === ADDRESS_REQUIRED_CODE) {
          setAddressFehler(null);
          setAddressOpen(true);
          return;
        }
        // Ungültige Anschrift aus dem Dialog: Meldung am Feld im Dialog.
        if (address && response.status === 400) {
          const feld =
            typeof data?.field === "string" && ADDRESS_FIELDS.has(data.field) ? data.field : null;
          setAddressFehler({ feld, text: message });
          return;
        }
        toast.error(message);
        return;
      }

      if (action === "confirm") {
        const number = typeof data?.invoice?.number === "string" ? data.invoice.number : null;
        const warning = typeof data?.warning === "string" ? data.warning : null;
        // Nur Wortlaut: Mit Warnung hängt die Rechnung nicht an der Mail (oder
        // die Mail ging gar nicht raus), dann verspricht die Erfolgsmeldung
        // das auch nicht.
        toast.success(`Aufenthalt von ${guestName} bestätigt`, {
          description: number
            ? warning
              ? `Rechnung ${number} ist erstellt.`
              : `Rechnung ${number} ging als PDF mit der Bestätigungsmail an den Gast.`
            : undefined,
        });
        // Was von Hand nachzuholen ist – bleibt stehen, bis es weggeklickt
        // wird. Nur Rechnung nicht erstellt (Mail ging raus): dafür der kurze
        // Wortlaut hier; in allen anderen Fällen (nicht angehängt, Mail nicht
        // verschickt) nennt der Server, was zu tun ist.
        if (warning) {
          toast.warning(
            data?.warningCode === CONFIRM_WARNING.invoiceFailed
              ? "Die Bestätigung ist raus, die Rechnung konnte nicht erstellt werden – bitte im Detaildialog erstellen und selbst senden."
              : warning,
            { duration: Infinity, closeButton: true },
          );
        }
      } else {
        toast.success(`Anfrage von ${guestName} abgelehnt.`);
      }
      setDialogOpen(false);
      setAddressOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Mobil volle Breite und 44px hoch: Am Handy ist das das Tippziel
          für die wichtigste Entscheidung im Admin. */}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => decide("confirm")}
          className="h-11 flex-1 sm:h-8 sm:flex-none"
        >
          Bestätigen
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setDialogOpen(true)}
          className="h-11 flex-1 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive sm:h-8 sm:flex-none"
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

      <ConfirmAddressDialog
        requestId={requestId}
        guestName={guestName}
        open={addressOpen}
        onOpenChange={(open) => {
          setAddressOpen(open);
          if (!open) setAddressFehler(null);
        }}
        pending={pending}
        fehler={addressFehler}
        onConfirm={(address) => decide("confirm", undefined, address)}
      />
    </>
  );
}
