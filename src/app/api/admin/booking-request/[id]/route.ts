import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { bookingRequest, type BookingRequest, type Invoice } from "@/db/schema";
import {
  confirmBookingRequest,
  declineBookingRequest,
  RANGE_TAKEN_ERROR,
  NOT_PENDING_ERROR,
} from "@/db/adminQueries";
import {
  createInvoice,
  getInvoiceForBookingRequest,
  INVOICE_EXISTS_ERROR,
} from "@/db/invoiceQueries";
import {
  deleteBookingRequest,
  REQUEST_ALREADY_ANONYMIZED_ERROR,
  REQUEST_NOT_FOUND_ERROR,
  STAY_AHEAD_ERROR,
} from "@/db/retentionQueries";
import { berlinDay } from "@/lib/retention";
import {
  ADDRESS_REQUIRED_CODE,
  CONFIRM_WARNING,
  type ConfirmWarningCode,
  hasPostalAddress,
  postalAddressLines,
} from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/invoicePdf";
import { sendGuestConfirmation, sendGuestDecline, type InvoiceForMail } from "@/lib/email";
import { postalAddressSchema } from "@/lib/validation";
import { safeError } from "@/lib/safeError";
import { withRouteErrors } from "@/lib/routeErrors";

const patchSchema = z.object({
  action: z.enum(["confirm", "decline"]),
  reason: z.string().optional(),
  // Nur beim Bestätigen einer Anfrage ohne Anschrift (vor dem Pflichtfeld
  // eingegangen): Der Dialog im Admin fragt sie ab, sie wird an der Anfrage
  // gespeichert und ist Empfänger der Rechnung.
  address: postalAddressSchema.optional(),
});

const ADDRESS_REQUIRED_MESSAGE =
  "Für die Rechnung fehlt die Anschrift des Gasts. Bitte Straße, PLZ und Ort angeben – erst dann wird bestätigt.";

const INVOICE_FAILED_WARNING =
  "Die Buchung ist bestätigt, die Rechnung konnte aber nicht erstellt werden. Die Bestätigungsmail ging ohne Rechnung raus. Bitte die Rechnung im Detaildialog der Buchung erstellen und dem Gast schicken.";

function attachmentFailedWarning(number: string): string {
  return `Die Buchung ist bestätigt und die Rechnung ${number} erstellt, sie konnte aber nicht an die Bestätigungsmail angehängt werden. Bitte das PDF im Detaildialog der Buchung herunterladen und dem Gast schicken.`;
}

function mailFailedWarning(number: string): string {
  return `Die Buchung ist bestätigt und die Rechnung ${number} erstellt, aber die E-Mail an den Gast konnte nicht verschickt werden. Bitte die Rechnung im Detaildialog der Buchung herunterladen und dem Gast selbst mit der Bestätigung senden.`;
}

const INVOICE_AND_MAIL_FAILED_WARNING =
  "Die Buchung ist bestätigt, aber die Rechnung konnte nicht erstellt und die E-Mail an den Gast nicht verschickt werden. Bitte die Rechnung im Detaildialog der Buchung erstellen und dem Gast selbst mit der Bestätigung senden.";

type ConfirmWarning = { code: ConfirmWarningCode; message: string };

export const PATCH = withRouteErrors("PATCH /api/admin/booking-request/[id]", patchBookingRequest);

/**
 * Bestätigt oder lehnt eine Anfrage ab.
 *
 * Beim Bestätigen einer Online-Anfrage entsteht danach automatisch die
 * Rechnung (Empfänger: Name und Anschrift der Anfrage) und geht als PDF mit
 * der Bestätigungsmail an den Gast. Fehlt die Anschrift an der Anfrage und im
 * Body, wird nichts bestätigt: 400 mit `code: "address_required"`.
 *
 * Antwort beim Bestätigen:
 * `{ ok, invoice: { id, number } | null, warning?, warningCode? }`.
 * `warning` sagt dem Admin, was von Hand nachzuholen ist (Rechnung nicht
 * erstellt oder nicht angehängt, Mail nicht verschickt); `warningCode`
 * (CONFIRM_WARNING in src/lib/invoice.ts) unterscheidet die Fälle für die
 * Oberfläche. Die Bestätigung bleibt in jedem Fall.
 */
async function patchBookingRequest(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Anfragekörper (kein valides JSON)" },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    // Anschriftsfehler mit Meldung und Feld, damit der Dialog sie am Feld
    // zeigt; alles andere ist ein Fehler der Oberfläche, nicht der Eingabe.
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "address") {
      return NextResponse.json(
        {
          error: issue.message,
          field: typeof issue.path[1] === "string" ? issue.path[1] : null,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const { action, reason, address } = parsed.data;

  if (action === "confirm" && !address) {
    // Vor der Bestätigung prüfen: Ohne Anschrift gäbe es keine Rechnung, und
    // der Gast bekäme die Zusage ohne sie. Nur offene Anfragen – für alle
    // anderen meldet confirmBookingRequest den passenden Fehler.
    const current = await db.query.bookingRequest.findFirst({
      where: eq(bookingRequest.id, id),
    });
    if (current?.status === "pending" && !hasPostalAddress(current)) {
      return NextResponse.json(
        { error: ADDRESS_REQUIRED_MESSAGE, code: ADDRESS_REQUIRED_CODE },
        { status: 400 },
      );
    }
  }

  try {
    if (action === "confirm") {
      await confirmBookingRequest(db, id, authorized.actor, address);
    } else {
      await declineBookingRequest(db, id, authorized.actor, reason);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === RANGE_TAKEN_ERROR || error.message === NOT_PENDING_ERROR)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  if (action === "decline") {
    await notifyGuestOfDecline(id, reason);
    return NextResponse.json({ ok: true });
  }

  const { invoice, warning } = await invoiceAndConfirmGuest(id, authorized.actor);
  return NextResponse.json({
    ok: true,
    invoice: invoice ? { id: invoice.id, number: invoice.number } : null,
    ...(warning ? { warning: warning.message, warningCode: warning.code } : {}),
  });
}

/**
 * Löscht eine Anfrage von Hand – oder anonymisiert sie, wenn eine Rechnung
 * aufbewahrt werden muss. Die Regeln stehen in `adminDeletionDecision`
 * (src/lib/retention.ts); geprüft wird hier auf dem Server, egal was die
 * Oberfläche anbietet.
 *
 * 404: unbekannt · 409: (noch) nicht löschbar, z. B. bestätigte Buchung mit
 * Abreise in der Zukunft.
 */
export const DELETE = withRouteErrors("DELETE /api/admin/booking-request/[id]", deleteBookingRequestRoute);

async function deleteBookingRequestRoute(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  try {
    const result = await deleteBookingRequest(db, id, authorized.actor, berlinDay(new Date()));
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === REQUEST_NOT_FOUND_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message === STAY_AHEAD_ERROR || error.message === REQUEST_ALREADY_ANONYMIZED_ERROR)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

/** Die Anfrage für die Mail an den Gast – `undefined` bei manuellen Buchungen. */
async function loadGuest(id: number): Promise<BookingRequest | undefined> {
  const guest = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  // Manuelle Buchungen bekommen keine automatischen Mails (siehe
  // POST /api/admin/manual-booking).
  return guest && guest.source !== "manual" ? guest : undefined;
}

/**
 * Die Entscheidung ist zu diesem Zeitpunkt bereits gespeichert – ein Mailfehler
 * darf sie nicht zurückdrehen, sonst stünde der Admin vor einer Anfrage, deren
 * Bestätigung scheinbar nicht funktioniert.
 */
async function notifyGuestOfDecline(id: number, reason?: string): Promise<void> {
  const guest = await loadGuest(id);
  if (!guest) {
    return;
  }
  try {
    await sendGuestDecline(guest, reason);
  } catch (error) {
    console.error("Benachrichtigung des Gasts konnte nicht gesendet werden", safeError(error));
  }
}

/**
 * Nach der Bestätigung: Rechnung erstellen, als PDF an die Bestätigungsmail
 * hängen und diese verschicken. Jeder Schritt darf scheitern, ohne die
 * Bestätigung zurückzudrehen:
 *
 * - Rechnung scheitert → Mail ohne Anhang (sie kündigt die Rechnung an),
 *   Warnung an den Admin.
 * - PDF scheitert → Rechnung bleibt, Mail ohne Anhang, Warnung.
 * - Mail scheitert → Rechnung bleibt, Warnung (mit oder ohne Rechnung), damit
 *   die Oberfläche den Versand nicht behauptet.
 *
 * Die Rechnung entsteht in einer eigenen Transaktion nach der Bestätigung,
 * weil `createInvoice` eine bestätigte Buchung verlangt. Gibt es schon eine
 * (Doppelklick, zweites Gerät), wird diese angehängt.
 */
async function invoiceAndConfirmGuest(
  id: number,
  actor: string,
): Promise<{ invoice: Invoice | null; warning?: ConfirmWarning }> {
  const guest = await loadGuest(id);
  if (!guest) {
    return { invoice: null };
  }

  let invoice: Invoice | null = null;
  let warning: ConfirmWarning | undefined;
  try {
    invoice = await invoiceFor(guest, actor);
  } catch (error) {
    console.error("Rechnung zur Bestätigung konnte nicht erstellt werden", id, safeError(error));
    warning = { code: CONFIRM_WARNING.invoiceFailed, message: INVOICE_FAILED_WARNING };
  }

  let forMail: InvoiceForMail | undefined;
  if (invoice) {
    try {
      forMail = { number: invoice.number, pdf: await renderInvoicePdf(invoice.snapshot) };
    } catch (error) {
      console.error("Rechnungs-PDF zur Bestätigung konnte nicht erzeugt werden", id, safeError(error));
      warning = {
        code: CONFIRM_WARNING.attachmentFailed,
        message: attachmentFailedWarning(invoice.number),
      };
    }
  }

  try {
    await sendGuestConfirmation(guest, forMail);
  } catch (error) {
    console.error("Benachrichtigung des Gasts konnte nicht gesendet werden", safeError(error));
    // Ersetzt eine frühere Warnung: Ohne Mail ist egal, ob die Rechnung
    // angehängt gewesen wäre – der Gast hat nichts bekommen.
    warning = invoice
      ? { code: CONFIRM_WARNING.mailFailed, message: mailFailedWarning(invoice.number) }
      : { code: CONFIRM_WARNING.invoiceAndMailFailed, message: INVOICE_AND_MAIL_FAILED_WARNING };
  }

  return { invoice, warning };
}

async function invoiceFor(guest: BookingRequest, actor: string): Promise<Invoice> {
  if (!hasPostalAddress(guest)) {
    // Nach der Prüfung vor der Bestätigung nicht zu erwarten – höchstens,
    // wenn die Anschrift dazwischen verschwunden ist.
    throw new Error("Anfrage ohne Rechnungsanschrift");
  }
  try {
    return await createInvoice({
      bookingRequestId: guest.id,
      recipientName: guest.name,
      recipientAddress: postalAddressLines(guest),
      actor,
    });
  } catch (error) {
    if (error instanceof Error && error.message === INVOICE_EXISTS_ERROR) {
      const existing = await getInvoiceForBookingRequest(guest.id);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}
