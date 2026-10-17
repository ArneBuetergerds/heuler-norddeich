import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
  sendGuestConfirmation,
  sendGuestDecline,
  sendOperatorDigest,
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
  guests: 2,
  linens: 0,
  towels: 0,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
  decidedAt: null,
  anonymizedAt: null,
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

  // Absender ist der noreply-Alias. Die Gast-Mails fordern aber ausdrücklich
  // zum Antworten auf, deshalb muss das Antwortziel auf dem gelesenen Postfach
  // liegen - sonst sieht der Gast im Client "noreply@" und antwortet nicht.
  it.each([
    ["Eingangsbestätigung", sendGuestRequestReceived],
    ["Zusage", sendGuestConfirmation],
    ["Absage", sendGuestDecline],
  ])("lenkt Antworten auf die %s an das gelesene Postfach", async (_label, sendMailFn) => {
    await sendMailFn(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "kontakt@norddeich-heuler.de" }),
    );
  });

  it("schickt die Sammelmeldung an die Betreiberin, mit Anzahl und Link, ohne Gastdaten", async () => {
    await sendOperatorDigest(17, { limit: 40, windowHours: 24 });

    const mail = sendMail.mock.calls[0]?.[0] as {
      to: string;
      replyTo?: string;
      subject: string;
      text: string;
    };
    expect(mail.to).toBe("kontakt@example.invalid");
    expect(mail.replyTo).toBeUndefined();
    expect(mail.subject).toContain("17 weitere");
    expect(mail.text).toContain("sind 17 weitere Buchungsanfragen eingegangen");
    expect(mail.text).toContain("mehr als 40 Anfragen in 24 Stunden");
    expect(mail.text).toContain("https://norddeich-heuler.de/admin");
  });

  it("schreibt die Sammelmeldung für eine einzelne Anfrage im Singular", async () => {
    await sendOperatorDigest(1, { limit: 40, windowHours: 24 });

    const mail = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).toContain("ist eine weitere Buchungsanfrage eingegangen");
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

  it("listet bestellte Wäsche mit Summe auf", async () => {
    await sendBookingRequestNotification({ ...request, linens: 2, towels: 1 });

    const text = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(text.text).toContain("Bettwäsche: 2 × 10 €");
    expect(text.text).toContain("Handtücher: 1 × 5 €");
    expect(text.text).toContain("Summe: 25 €");
  });

  it("erwähnt Wäsche gar nicht, wenn keine bestellt wurde", async () => {
    await sendBookingRequestNotification(request);

    const text = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(text.text).not.toContain("Bettwäsche");
    expect(text.text).toContain("Personen: 2");
  });

  // Die Mails hatten lange eine eigene, schlechtere Datumsformatierung:
  // ohne führende Null und ohne Zeitzone. Letzteres hätte auf einem Server
  // westlich von UTC den Vortag gezeigt.
  it("schreibt Daten zweistellig und in UTC", async () => {
    await sendGuestConfirmation(request);

    const mail = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).toContain("01.05.2027 bis 08.05.2027");
  });

  it("weist in der Zusage Mietpreis, Anzahlung und Restbetrag aus", async () => {
    // 01.05.–08.05.2027: sieben Nächte in der Saison 01.04.–30.06. zu 74 €.
    await sendGuestConfirmation(request);

    const mail = sendMail.mock.calls[0]?.[0] as { text: string };
    // Intl.NumberFormat setzt vor das €-Zeichen ein geschütztes Leerzeichen
    // (U+00A0). Für den Vergleich hier auf ein normales normalisieren.
    const text = mail.text.replaceAll("\u00a0", " ");

    expect(text).toContain("7 Nächte × 74 €");
    expect(text).toContain("Summe: 518,00 €");
    expect(text).toContain("Anzahlung 30 %: 155,40 €");
    expect(text).toContain("Restbetrag: 362,60 €");
  });

  it("erfindet keine Bankverbindung, wenn keine hinterlegt ist", async () => {
    delete process.env.BANK_TRANSFER_DETAILS;
    await sendGuestConfirmation(request);

    const mail = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).toContain("senden wir Ihnen gesondert zu");
    expect(mail.text).not.toContain("IBAN");
  });

  it("nimmt eine hinterlegte Bankverbindung in die Zusage auf", async () => {
    process.env.BANK_TRANSFER_DETAILS = "Sabrina Rönne\nIBAN DE00 0000";
    try {
      await sendGuestConfirmation(request);

      const mail = sendMail.mock.calls[0]?.[0] as { text: string };
      expect(mail.text).toContain("IBAN DE00 0000");
    } finally {
      delete process.env.BANK_TRANSFER_DETAILS;
    }
  });

  it("nennt den Preis in der Eingangsbestätigung als unverbindlich", async () => {
    await sendGuestRequestReceived(request);

    const mail = sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).toContain("unverbindliche Vorschau");
    expect(mail.text).not.toContain("Anzahlung");
  });
});

describe("Mietbedingungen in den Gast-Mails", () => {
  it("nennen Anzahlungsfrist, Parken und Stornobedingungen in der Bestätigung", async () => {
    const { buildGuestConfirmation } = await import("./email");
    const { text } = buildGuestConfirmation(request);
    expect(text).toContain("innerhalb von 7 Tagen überweisen");
    expect(text).toContain("Eigener Stellplatz");
    expect(text).toContain("Stornobedingungen:");
    expect(text).toContain("bis 42 Tage vor Anreise: kostenfrei");
  });

  it("sagen in der Eingangsbestätigung eine Antwort binnen 48 Stunden zu", async () => {
    const { buildGuestRequestReceived } = await import("./email");
    expect(buildGuestRequestReceived(request).text).toContain("innerhalb von 48 Stunden");
  });
});
