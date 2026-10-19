"use client";

import { Download } from "lucide-react";
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
import { formatBerlinDateTime, formatDate, formatDateRange, formatEuro } from "@/lib/format";
import { postalAddressLines } from "@/lib/invoice";
import {
  CLEANING_FEE,
  EXTRAS,
  GUEST_TAX_SEASON_NAMES,
  SERVICE_FEE,
  bookingCharges,
  extrasTotal,
  nightsBetween,
  priceBreakdown,
  stayTotal,
} from "@/lib/pricing";
import { guestsUnder14Note, stayChargesView } from "@/lib/quoteView";
import { adminDeletionDecision, berlinDay } from "@/lib/retention";
import {
  RENTAL_TERMS_FILE_NAME,
  RENTAL_TERMS_PDF_PATH,
  formatTermsVersion,
} from "@/lib/rentalTerms";

/**
 * Alles zu einem bestätigten Aufenthalt an einer Stelle: Kontaktdaten,
 * Personenzahl, bestellte Wäsche, Nachricht, Mietpreis und Kurtaxe.
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
  // Mit Anfrage wie auf der Rechnung (`bookingCharges`); Altbestand ohne
  // Anfrage kennt keine Personenzahl, dort steht nur der Mietpreis.
  const charges = request ? bookingCharges(request) : null;
  const posten = charges?.breakdown ?? priceBreakdown(stay.startDate, stay.endDate);
  const miete = charges?.rent ?? stayTotal(stay.startDate, stay.endDate);
  // Maßgeblich ist eine vorhandene Rechnung: Ist sie vor BDS-006 ohne
  // Kurtaxe ausgestellt, bleibt sie bar vor Ort (`stayChargesView`).
  const ansicht = charges ? stayChargesView(charges, invoice) : null;
  // Nur mit Kurtaxe-Posten auf der Rechnung bekommt die Tabelle den
  // zweiten Block.
  const gaestebeitrag =
    ansicht && ansicht.invoiceGuestTaxLines.length > 0 ? ansicht : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{stay.guestName}</DialogTitle>
          <DialogDescription>
            {formatDateRange(stay.startDate, stay.endDate)} · {naechte}{" "}
            {naechte === 1 ? "Nacht" : "Nächte"}
            {stay.source === "manual" && " · manuell eingetragen"}
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
            <Zeile label="Anschrift">
              <AnschriftZeilen lines={postalAddressLines(request)} />
            </Zeile>
            <Zeile label="Personen">
              {request.guests}
              {guestsUnder14Note(request.guestsUnder14) && (
                <span className="text-schlick-2">, {guestsUnder14Note(request.guestsUnder14)}</span>
              )}
            </Zeile>
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
            <Zeile label={request.source === "manual" ? "Eingetragen am" : "Angefragt am"}>
              {formatDate(request.createdAt)}
            </Zeile>
            {request.message && <Zeile label="Nachricht">{request.message}</Zeile>}
            {/* Online bestätigt der Gast die Mietbedingungen im Formular und
                bekommt sie mit der Zusage; manuelle Buchungen haben keinen
                Haken und keine Mail – hier liegt das PDF zum Weitergeben. */}
            <Zeile label="Mietbedingungen">
              {request.termsAcceptedAt ? (
                <span className="block">
                  bestätigt am {formatBerlinDateTime(request.termsAcceptedAt)}
                  {request.termsVersion && ` (Stand ${formatTermsVersion(request.termsVersion)})`}
                </span>
              ) : (
                <span className="block text-schlick-3">nicht online bestätigt</span>
              )}
              {/* Mobil 44px hoch wie die übrigen Tippziele im Admin. */}
              <a
                href={RENTAL_TERMS_PDF_PATH}
                download={RENTAL_TERMS_FILE_NAME}
                className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-2 sm:min-h-0"
              >
                <Download aria-hidden="true" className="size-3.5 shrink-0" />
                Mietbedingungen (PDF)
              </a>
            </Zeile>
          </dl>
        ) : (
          <p className="text-[13px] text-schlick-2">
            Manuell eingetragener Aufenthalt aus dem Altbestand – zu ihm gibt es
            keine Anfrage und damit auch keine Kontaktdaten. Für eine Rechnung
            bitte als Buchung neu eintragen.
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
                <td className="pt-1.5 font-semibold">
                  {gaestebeitrag
                    ? "Summe Miete"
                    : ansicht?.invoiceBeforeSwitch
                      ? "Summe (Rechnungsbetrag)"
                      : "Summe"}
                </td>
                <td className="pt-1.5 text-right font-semibold tabular-nums">
                  {miete} €
                </td>
              </tr>
              {/* Kurtaxe als eigener Block, Zeilen im selben Muster wie die
                  Miete: Menge × Satz, Klammer mit Saison und Herleitung. */}
              {gaestebeitrag && (
                <>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={2}
                      className="pt-3 pb-0.5 text-left text-[11px] font-bold tracking-[0.06em] text-schlick-2 uppercase"
                    >
                      Kurtaxe
                    </th>
                  </tr>
                  {gaestebeitrag.invoiceGuestTaxLines.map((eintrag) => (
                    <tr key={eintrag.season}>
                      <td className="py-0.5 text-schlick-2">
                        {eintrag.persons * eintrag.nights} × {formatEuro(eintrag.rate)}
                        <span className="text-schlick-3">
                          {" "}
                          ({GUEST_TAX_SEASON_NAMES[eintrag.season]}, {eintrag.persons} ab 14 ×{" "}
                          {eintrag.nights} {eintrag.nights === 1 ? "Nacht" : "Nächte"})
                        </span>
                      </td>
                      <td className="py-0.5 text-right tabular-nums">
                        {formatEuro(eintrag.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-schlick-3">
                    <td className="pt-1.5 font-bold">Mietpreis und Kurtaxe</td>
                    <td className="pt-1.5 text-right font-bold tabular-nums">
                      {formatEuro(gaestebeitrag.invoiceTotal)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11px] text-schlick-2">
            Zusätzlich bar vor Ort: Endreinigung {CLEANING_FEE} €, Servicegebühr {SERVICE_FEE} €
            {extrasTotal(request ?? { linens: 0, towels: 0 }) > 0
              ? `, Wäsche ${extrasTotal(request ?? { linens: 0, towels: 0 })} €`
              : ""}
            {ansicht?.guestTaxOnSite &&
              `, Kurtaxe ${formatEuro(ansicht.guestTaxOnSite.amount)} (laut Rechnung ${ansicht.guestTaxOnSite.invoiceNumber})`}
            .
          </p>
          {ansicht?.invoiceBeforeSwitch && (
            <p className="mt-1.5 text-[11px] font-semibold text-schlick-2">
              Rechnung vor der Umstellung ausgestellt: Die Kurtaxe steht nicht
              auf der Rechnung und wird bar bei der Schlüsselübergabe kassiert.
            </p>
          )}
        </div>

        {request ? (
          <InvoiceSection request={request} invoice={invoice} />
        ) : (
          <p className="text-[11px] text-schlick-2">
            Für manuell eingetragene Aufenthalte aus dem Altbestand lässt sich
            keine Rechnung erstellen – es fehlen Anfrage und Kontaktdaten.
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

/** Rechnungsanschrift mehrzeilig; Deutschland lässt `postalAddressLines` weg. */
function AnschriftZeilen({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return <span className="text-schlick-3">keine Anschrift</span>;
  }
  return (
    <address className="not-italic">
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}
