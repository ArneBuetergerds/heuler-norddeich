import { Resend } from "resend";
import type { BookingRequest } from "@/db/schema";

const FROM = "Ferienwohnung Heuler <onboarding@resend.dev>";

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

function formatRange(request: Pick<BookingRequest, "startDate" | "endDate">): string {
  return `${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`;
}

type Mail = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

async function send(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY ist nicht konfiguriert");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, ...mail });

  // Resend meldet Zustellfehler im Ergebnis statt per Exception. Ohne diese
  // Prüfung würde ein fehlgeschlagener Versand als Erfolg durchgehen.
  if (error) {
    throw new Error(`E-Mail-Versand fehlgeschlagen: ${error.message}`);
  }
}

/** Benachrichtigt den Betreiber über eine neu eingegangene Anfrage. */
export async function sendBookingRequestNotification(
  request: BookingRequest,
): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!ownerEmail) {
    throw new Error("OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert");
  }

  await send({
    to: ownerEmail,
    replyTo: request.email,
    subject: `Neue Buchungsanfrage von ${request.name}`,
    text: [
      `Name: ${request.name}`,
      `E-Mail: ${request.email}`,
      `Telefon: ${request.phone ?? "-"}`,
      `Zeitraum: ${formatRange(request)}`,
      `Nachricht: ${request.message ?? "-"}`,
    ].join("\n"),
  });
}

/** Bestätigt dem Gast den Eingang seiner Anfrage. */
export async function sendGuestRequestReceived(request: BookingRequest): Promise<void> {
  await send({
    to: request.email,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `vielen Dank für Ihre Anfrage für den Zeitraum ${formatRange(request)}.`,
      "Wir haben sie erhalten und melden uns in Kürze bei Ihnen.",
      "",
      "Diese E-Mail ist noch keine Buchungsbestätigung.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}

/** Sagt dem Gast den Aufenthalt verbindlich zu. */
export async function sendGuestConfirmation(request: BookingRequest): Promise<void> {
  await send({
    to: request.email,
    subject: "Ihre Buchung für die Ferienwohnung Heuler ist bestätigt",
    text: [
      `Hallo ${request.name},`,
      "",
      `Ihre Buchung für den Zeitraum ${formatRange(request)} ist bestätigt.`,
      "Wir freuen uns auf Ihren Besuch in Norddeich.",
      "",
      "Bei Fragen antworten Sie einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}

/**
 * Informiert den Gast über eine Ablehnung oder eine Stornierung. Beide Fälle
 * teilen denselben Text – aus Sicht des Gasts ist das Ergebnis dasselbe: der
 * Zeitraum kommt nicht zustande.
 */
export async function sendGuestDecline(
  request: BookingRequest,
  reason?: string | null,
): Promise<void> {
  const reasonLines = reason?.trim() ? [`Grund: ${reason.trim()}`, ""] : [];

  await send({
    to: request.email,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `leider können wir Ihnen den Zeitraum ${formatRange(request)} nicht anbieten.`,
      "",
      ...reasonLines,
      "Gerne prüfen wir einen anderen Termin – antworten Sie dazu einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}
