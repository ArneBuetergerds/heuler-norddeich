"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookingRequest, Invoice } from "@/db/schema";
import { formatDate } from "@/lib/format";

/**
 * Rechnung zu einer bestätigten Buchung: ausstellen oder herunterladen.
 *
 * Die Anschrift wird erst hier erfasst, nicht schon im Anfrageformular. Sie
 * ist nur für bestätigte Buchungen nötig – jede Anfrage danach zu fragen,
 * hieße, sie von allen Anfragenden zu erheben, auch von denen, die nie
 * buchen.
 */
export function InvoiceSection({
  request,
  invoice,
}: {
  request: BookingRequest;
  invoice: Invoice | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (invoice) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linie p-4">
        <div>
          <p className="text-[13px] font-semibold">Rechnung {invoice.number}</p>
          <p className="text-xs text-schlick-2">
            ausgestellt am {formatDate(new Date(invoice.snapshot.issuedAt))}
          </p>
        </div>
        <Button asChild size="sm">
          <a href={`/api/admin/invoice/${invoice.id}`}>PDF herunterladen</a>
        </Button>
      </div>
    );
  }

  if (request.status !== "confirmed") {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRequestId: request.id,
          recipientName: formData.get("recipientName"),
          recipientAddress: formData.get("recipientAddress"),
        }),
      });

      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          data !== null && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Die Rechnung konnte nicht erstellt werden.";
        setError(message);
        return;
      }

      const number =
        data !== null && typeof data === "object" && "number" in data
          ? String((data as { number: unknown }).number)
          : "";
      toast.success(`Rechnung ${number} erstellt.`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-linie p-4">
      <p className="text-[13px] font-semibold">Rechnung erstellen</p>

      <div className="grid gap-1.5">
        <Label htmlFor="recipientName">Rechnungsempfänger</Label>
        <Input id="recipientName" name="recipientName" defaultValue={request.name} required />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="recipientAddress">Anschrift</Label>
        <Textarea
          id="recipientAddress"
          name="recipientAddress"
          rows={3}
          required
          placeholder={"Musterweg 1\n12345 Musterstadt"}
        />
        <p className="text-[11px] text-schlick-2">
          Pflichtangabe auf der Rechnung. Straße und PLZ/Ort in eigenen Zeilen.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <p className="text-[11px] text-schlick-2">
        Eine ausgestellte Rechnung lässt sich nicht mehr ändern. Bitte die
        Anschrift vorher prüfen.
      </p>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Wird erstellt …" : "Rechnung ausstellen"}
      </Button>
    </form>
  );
}
