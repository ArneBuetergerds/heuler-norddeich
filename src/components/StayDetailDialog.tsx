"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookingRequest } from "@/db/schema";
import type { InvoiceSummary } from "@/db/invoiceQueries";
import { InvoiceSection } from "./InvoiceSection";
import { DeleteRequestButton } from "./DeleteRequestButton";
import type { Stay } from "@/lib/occupancy";
import { formatDate, formatDateRange } from "@/lib/format";
import { EXTRAS, extrasTotal, nightsBetween, priceBreakdown, stayTotal } from "@/lib/pricing";
import { adminDeletionDecision, berlinDay } from "@/lib/retention";

/**
 * Alles zu einem bestätigten Aufenthalt an einer Stelle: Kontaktdaten,
 * Personenzahl, bestellte Wäsche, Nachricht und der Mietpreis.
 *
 * Der Preis wird hier **pro Nacht** aufgeschlüsselt, nicht mit dem Saisonpreis
 * des Anreisetags hochgerechnet – bei einem Aufenthalt über einen
 * Saisonwechsel hinweg wären das sonst zweistellige Beträge Unterschied.
 */
export function StayDetailDialog({
  stay,
  request,
  invoice,
  onOpenChange,
}: {
  stay: Stay | null;
  request: BookingRequest | undefined;
  invoice: InvoiceSummary | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  if (!stay) {
    return null;
  }

  const naechte = nightsBetween(stay.startDate, stay.endDate);
  const posten = priceBreakdown(stay.startDate, stay.endDate);
  const miete = stayTotal(stay.startDate, stay.endDate);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{stay.guestName}</DialogTitle>
          <DialogDescription>
            {formatDateRange(stay.startDate, stay.endDate)} · {naechte}{" "}
            {naechte === 1 ? "Nacht" : "Nächte"}
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            <Zeile label="E-Mail">
              <a
                href={`mailto:${request.email}`}
                className="underline underline-offset-2"
              >
                {request.email}
              </a>
            </Zeile>
            <Zeile label="Telefon">
              {request.phone ? (
                <a href={`tel:${request.phone}`} className="underline underline-offset-2">
                  {request.phone}
                </a>
              ) : (
                <span className="text-schlick-3">nicht angegeben</span>
              )}
            </Zeile>
            <Zeile label="Personen">{request.guests}</Zeile>
            <Zeile label="Wäsche">
              {extrasTotal(request) > 0 ? (
                <>
                  {(["linens", "towels"] as const)
                    .filter((key) => request[key] > 0)
                    .map((key) => `${EXTRAS[key].label}: ${request[key]}`)
                    .join(" · ")}
                  {" · "}
                  {extrasTotal(request)} € bar vor Ort
                </>
              ) : (
                <span className="text-schlick-3">nichts bestellt</span>
              )}
            </Zeile>
            <Zeile label="Angefragt am">{formatDate(request.createdAt)}</Zeile>
            {request.message && <Zeile label="Nachricht">{request.message}</Zeile>}
          </dl>
        ) : (
          <p className="text-[13px] text-schlick-2">
            Manuell eingetragener Aufenthalt – zu ihm gibt es keine Anfrage und
            damit auch keine Kontaktdaten.
          </p>
        )}

        <div className="rounded-lg border border-linie bg-sand p-4">
          <p className="text-[11px] font-bold tracking-[0.06em] text-schlick-2 uppercase">
            Mietpreis
          </p>
          <table className="mt-2 w-full text-[13px]">
            <tbody>
              {posten.map((eintrag) => (
                <tr key={eintrag.season.label}>
                  <td className="py-0.5 text-schlick-2">
                    {eintrag.nights} × {eintrag.pricePerNight} €
                    <span className="text-schlick-3"> ({eintrag.season.name})</span>
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{eintrag.total} €</td>
                </tr>
              ))}
              <tr className="border-t border-linie">
                <td className="pt-1.5 font-semibold">Summe</td>
                <td className="pt-1.5 text-right font-semibold tabular-nums">
                  {miete} €
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px] text-schlick-2">
            Zusätzlich bar vor Ort: Endreinigung 55 €, Servicegebühr 30 €,
            Gästebeitrag
            {extrasTotal(request ?? { linens: 0, towels: 0 }) > 0
              ? `, Wäsche ${extrasTotal(request ?? { linens: 0, towels: 0 })} €`
              : ""}
            .
          </p>
        </div>

        {request ? (
          <InvoiceSection request={request} invoice={invoice} />
        ) : (
          <p className="text-[11px] text-schlick-2">
            Für manuell eingetragene Aufenthalte lässt sich keine Rechnung
            erstellen – es fehlen Anfrage und Kontaktdaten.
          </p>
        )}

        {/* Der Dialog öffnet erst auf Klick, „heute“ aus dem Browser passt
            also ohne Hydrationsabgleich; der Server prüft beim Löschen selbst. */}
        {request && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-linie pt-3">
            <DeleteRequestButton
              requestId={request.id}
              decision={adminDeletionDecision(
                request,
                invoice !== undefined,
                berlinDay(new Date()),
              )}
              onDone={() => onOpenChange(false)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-bold tracking-[0.06em] text-schlick-2 uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd className="text-[13px] break-words">{children}</dd>
    </>
  );
}
