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
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
  country: null,
  startDate: new Date("2027-05-01"),
  endDate: new Date("2027-05-08"),
  message: null,
  guests: 2,
  guestsUnder14: 0,
  linens: 0,
  towels: 0,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
  decidedAt: null,
  anonymizedAt: null,
  termsAcceptedAt: null,
  termsVersion: null,
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
    expect(text.text).toContain("Davon unter 14 Jahren: 0");
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
    expect(text).toContain("Summe Mietpreis: 518,00 €");
    // Kurtaxe: 2 Personen × 7 Nächte × 3,50 € (Hauptsaison ab 15.03.)
    expect(text).toContain("Kurtaxe der Stadt Norden (2 Personen ab 14 Jahren):");
    expect(text).toContain("7 Nächte × 3,50 € × 2 (Hauptsaison): 49,00 €");
    expect(text).toContain("Gesamt Mietpreis und Kurtaxe: 567,00 €");
    // 30 % von 567 €
    expect(text).toContain("Anzahlung 30 %: 170,10 €");
    expect(text).toContain("Restbetrag: 396,90 €");
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

  it("nennen in der Bestätigung An- und Abreisezeit", async () => {
    const { buildGuestConfirmation } = await import("./email");
    expect(buildGuestConfirmation(request).text).toContain(
      "Anreise ab ca. 14 Uhr, Abreise bis 10 Uhr.",
    );
  });

  it("sagen in der Eingangsbestätigung eine Antwort binnen 48 Stunden zu", async () => {
    const { buildGuestRequestReceived } = await import("./email");
    expect(buildGuestRequestReceived(request).text).toContain("innerhalb von 48 Stunden");
  });
});

describe("Rechnung und Mietbedingungen im Anhang der Bestätigung", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 Beispiel");
  const mietbedingungen = new TextEncoder().encode("%PDF-1.7 Mietbedingungen");

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    process.env.SMTP_HOST = "smtp.example.invalid";
    process.env.SMTP_USER = "noreply@example.invalid";
    process.env.SMTP_PASS = "secret";
  });

  it("hängt Rechnung und Mietbedingungen als zwei PDFs an und nennt beide im Text", async () => {
    await sendGuestConfirmation(request, { number: "RE-2027-0001", pdf }, mietbedingungen);

    const mail = sendMail.mock.calls[0]?.[0] as {
      text: string;
      attachments: { filename: string; content: Buffer; contentType: string }[];
    };
    expect(mail.attachments).toHaveLength(2);
    expect(mail.attachments[0]).toMatchObject({
      filename: "Rechnung-RE-2027-0001.pdf",
      contentType: "application/pdf",
    });
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
    expect(mail.attachments[0].content.equals(Buffer.from(pdf))).toBe(true);
    expect(mail.attachments[1]).toMatchObject({
      filename: "Mietbedingungen-Heuler.pdf",
      contentType: "application/pdf",
    });
    expect(mail.attachments[1].content.equals(Buffer.from(mietbedingungen))).toBe(true);
    expect(mail.text).toContain("die Rechnung RE-2027-0001 und unsere");
    expect(mail.text).toContain("Mietbedingungen (Mietbedingungen-Heuler.pdf)");
    expect(mail.text).toContain("https://norddeich-heuler.de/mietbedingungen");
    expect(mail.text).toContain("Ein Widerrufsrecht besteht für die Buchung nicht");
  });

  it("hängt nur die Rechnung an und verlinkt die Mietbedingungen, wenn deren PDF fehlt", async () => {
    await sendGuestConfirmation(request, { number: "RE-2027-0001", pdf });

    const mail = sendMail.mock.calls[0]?.[0] as {
      text: string;
      attachments: { filename: string }[];
    };
    expect(mail.attachments.map((a) => a.filename)).toEqual(["Rechnung-RE-2027-0001.pdf"]);
    expect(mail.text).toContain("Die Rechnung RE-2027-0001 finden Sie im Anhang");
    expect(mail.text).not.toContain("Mietbedingungen-Heuler.pdf");
    expect(mail.text).toContain("https://norddeich-heuler.de/mietbedingungen");
  });

  it("hängt nur die Mietbedingungen an, wenn die Rechnung fehlt, und kündigt diese an", async () => {
    await sendGuestConfirmation(request, undefined, mietbedingungen);

    const mail = sendMail.mock.calls[0]?.[0] as {
      text: string;
      attachments: { filename: string }[];
    };
    expect(mail.attachments.map((a) => a.filename)).toEqual(["Mietbedingungen-Heuler.pdf"]);
    expect(mail.text).toContain("Die Rechnung senden wir Ihnen gesondert zu.");
    expect(mail.text).toContain("Mietbedingungen (Mietbedingungen-Heuler.pdf) finden Sie im Anhang");
  });

  it("kündigt die Rechnung ohne Anhang an, wenn keine mitgeht", async () => {
    await sendGuestConfirmation(request);

    const mail = sendMail.mock.calls[0]?.[0] as { text: string; attachments?: unknown };
    expect(mail.attachments).toBeUndefined();
    expect(mail.text).toContain("Die Rechnung senden wir Ihnen gesondert zu.");
  });
});

describe("Kurtaxe in den Mails (BDS-006)", () => {
  const mitKindern: BookingRequest = { ...request, guests: 4, guestsUnder14: 2 };

  it("nennt die Kurtaxe in der Zusage nicht mehr als Barzahlung vor Ort", async () => {
    const { buildGuestConfirmation } = await import("./email");
    const text = buildGuestConfirmation(mitKindern).text;

    const barZeilen = text.split("\n").filter((zeile) => /\bbar\b/.test(zeile));
    expect(barZeilen.length).toBeGreaterThan(0);
    for (const zeile of barZeilen) {
      expect(zeile).not.toContain("Kurtaxe");
      expect(zeile).not.toContain("Gästebeitrag");
    }
    expect(text).not.toContain("3,50 € je Person");
    expect(text).toContain("Die Kurtaxe bezahlen Sie mit der Rechnung");
  });

  it("rechnet die Kurtaxe nur für Personen ab 14 Jahren und nimmt sie in die Anzahlung", async () => {
    const { buildGuestConfirmation } = await import("./email");
    const text = buildGuestConfirmation(mitKindern).text.replaceAll("\u00a0", " ");

    // 2 zahlende Personen × 7 Nächte × 3,50 € = 49 €; Miete 518 €.
    expect(text).toContain("(2 Personen ab 14 Jahren)");
    expect(text).toContain("Summe Kurtaxe: 49,00 €");
    expect(text).toContain("Anzahlung 30 %: 170,10 €");
  });

  it("nennt Personen und Kinder unter 14 in Eingangsbestätigung und Betreiberin-Mail", async () => {
    const { buildGuestRequestReceived, buildBookingRequestNotification } = await import("./email");

    const gast = buildGuestRequestReceived(mitKindern).text.replaceAll("\u00a0", " ");
    expect(gast).toContain("für 4 Personen, davon 2 unter 14 Jahren.");
    expect(gast).toContain("Summe Kurtaxe: 49,00 €");

    const betreiberin = buildBookingRequestNotification(mitKindern, "owner@example.invalid").text;
    expect(betreiberin).toContain("Personen: 4");
    expect(betreiberin).toContain("Davon unter 14 Jahren: 2");
    expect(betreiberin).toContain("Kurtaxe der Stadt Norden");
  });

  it("nennt in der Eingangsbestätigung ohne Kinder nur die Personenzahl", async () => {
    const { buildGuestRequestReceived } = await import("./email");
    expect(buildGuestRequestReceived(request).text).toContain("für 2 Personen.");
  });

  it("sagt in keiner Mail mehr „Gästebeitrag“", async () => {
    const {
      buildBookingRequestNotification,
      buildGuestConfirmation,
      buildGuestDecline,
      buildGuestRequestReceived,
      buildOperatorDigest,
    } = await import("./email");
    const mails = [
      buildBookingRequestNotification(mitKindern, "owner@example.invalid"),
      buildGuestRequestReceived(mitKindern),
      buildGuestConfirmation(mitKindern),
      buildGuestDecline(mitKindern, "Zeitraum belegt"),
      buildOperatorDigest(3, "owner@example.invalid", { limit: 10, windowHours: 24 }),
    ];
    for (const mail of mails) {
      expect(`${mail.subject}\n${mail.text}`).not.toContain("Gästebeitrag");
    }
    expect(buildGuestConfirmation(mitKindern).text).toContain("Kurtaxe");
  });

  it("sagt in den Stornobedingungen, dass die Kurtaxe erstattet wird", async () => {
    const { buildGuestConfirmation } = await import("./email");
    expect(buildGuestConfirmation(request).text).toContain(
      "Die Kurtaxe der Stadt Norden wird bei einer Stornierung vollständig erstattet",
    );
  });
});
