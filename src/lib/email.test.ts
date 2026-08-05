import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
  sendGuestConfirmation,
  sendGuestDecline,
} from "./email";
import type { BookingRequest } from "@/db/schema";

// email.ts erzeugt den Transporter beim Modul-Import (Top-Level-Aufruf von
// createTransport), noch bevor die restlichen Top-Level-Konstanten dieser
// Testdatei initialisiert sind. vi.hoisted stellt sicher, dass die Mocks
// bereits existieren, wenn der (ebenfalls gehoistete) vi.mock-Factory beim
// Import von "./email" ausgeführt wird.
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn((_config: unknown) => ({
    sendMail: (...args: unknown[]) => sendMail(...args),
  }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

const request: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  startDate: new Date("2027-05-01"),
  endDate: new Date("2027-05-08"),
  message: null,
  status: "pending",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
};

describe("email", () => {
  // Der Transporter wird beim Modul-Import einmalig erzeugt (vor jedem
  // beforeEach), daher prüfen wir hier nur die statische Sicherheits-
  // konfiguration und nicht den zur Importzeit noch ungesetzten SMTP_HOST.
  it("konfiguriert den SMTP-Transport mit STARTTLS-Erzwingung", () => {
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    );
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    process.env.SMTP_HOST = "smtp.example.invalid";
    process.env.SMTP_USER = "noreply@example.invalid";
    process.env.SMTP_PASS = "secret";
    process.env.OWNER_NOTIFICATION_EMAIL = "kontakt@example.invalid";
  });

  it("benachrichtigt den Betreiber unter der konfigurierten Adresse", async () => {
    await sendBookingRequestNotification(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Ferienwohnung Heuler <noreply@norddeich-heuler.de>",
        to: "kontakt@example.invalid",
        replyTo: request.email,
      }),
    );
  });

  it("bestätigt dem Gast den Eingang unter dessen eigener Adresse", async () => {
    await sendGuestRequestReceived(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: request.email }),
    );
  });

  it("sendet die Zusage an den Gast", async () => {
    await sendGuestConfirmation(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: request.email, subject: expect.stringContaining("bestätigt") }),
    );
  });

  it("wirft, wenn OWNER_NOTIFICATION_EMAIL fehlt", async () => {
    delete process.env.OWNER_NOTIFICATION_EMAIL;

    await expect(sendBookingRequestNotification(request)).rejects.toThrow(
      "OWNER_NOTIFICATION_EMAIL",
    );
  });

  it("wirft eine Exception, wenn der SMTP-Versand fehlschlägt", async () => {
    sendMail.mockRejectedValue(new Error("Verbindung abgelehnt"));

    await expect(sendGuestDecline(request)).rejects.toThrow("Verbindung abgelehnt");
  });
});
