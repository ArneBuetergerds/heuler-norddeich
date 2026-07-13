import { Resend } from "resend";
import type { BookingRequest } from "@/db/schema";

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

export async function sendBookingRequestNotification(
  request: BookingRequest,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;

  if (!apiKey || !ownerEmail) {
    throw new Error(
      "RESEND_API_KEY oder OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert",
    );
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Ferienwohnung Heuler <onboarding@resend.dev>",
    to: ownerEmail,
    replyTo: request.email,
    subject: `Neue Buchungsanfrage von ${request.name}`,
    text: [
      `Name: ${request.name}`,
      `E-Mail: ${request.email}`,
      `Telefon: ${request.phone ?? "-"}`,
      `Zeitraum: ${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`,
      `Nachricht: ${request.message ?? "-"}`,
    ].join("\n"),
  });
}
