/**
 * Verschickt alle automatischen E-Mails mit Beispieldaten über den echten
 * SMTP-Zugang – aber ausnahmslos an die eine angegebene Adresse, jeweils mit
 * „[TEST]“ vor dem Betreff. Keine Datenbank, keine echten Gäste.
 *
 * Gedacht, um nach einer Änderung an SMTP-Zugang, Absender oder Texten zu
 * prüfen, ob die Mails wirklich ankommen und wie sie im Postfach aussehen
 * (Absender, Antwort-an, Umlaute, Zeilenumbrüche).
 *
 *   npx tsx --env-file=.env.local scripts/send-test-mails.ts <empfänger>
 *
 * Gebraucht werden aus der Umgebung (siehe src/lib/email.ts): SMTP_HOST,
 * SMTP_USER, SMTP_PASS, optional SMTP_PORT (Standard 587) und
 * BANK_TRANSFER_DETAILS. OWNER_NOTIFICATION_EMAIL wird nicht gebraucht – auch
 * die Mail an die Betreiberin geht an die angegebene Adresse.
 *
 * Die Zusage geht wie im Betrieb mit zwei PDF-Anhängen raus: Rechnung und
 * Mietbedingungen. Die Rechnung ist ein Beispiel (Nummer RE-0000-0000),
 * erzeugt aus der Beispielanfrage mit denselben Funktionen wie im Betrieb,
 * aber ohne Datenbank und ohne Nummernkreis; die Mietbedingungen sind die
 * echten (renderRentalTermsPdf).
 *
 * Texte und Versand sind dieselben wie im Betrieb: die `build…`-Funktionen und
 * `sendMail` aus src/lib/email.ts. Nur der Empfänger und der Betreff werden vor
 * dem Versand umgeschrieben; die `send…`-Funktionen selbst lassen sich nicht
 * auf eine Testadresse umleiten.
 */
import type { BookingRequest } from "../src/db/schema";
import { buildInvoiceSnapshot, postalAddressLines } from "../src/lib/invoice";
import { renderInvoicePdf } from "../src/lib/invoicePdf";
import { renderRentalTermsPdf } from "../src/lib/rentalTermsPdf";
import { RENTAL_TERMS_VERSION } from "../src/lib/rentalTerms";
import {
  buildBookingRequestNotification,
  buildGuestConfirmation,
  buildGuestDecline,
  buildGuestRequestReceived,
  buildOperatorDigest,
  closeMailTransport,
  sendMail,
  type Mail,
} from "../src/lib/email";

/** Empfänger aus der Kommandozeile; ohne gültige Adresse bricht das Skript ab, bevor etwas verschickt wird. */
function recipientFromArgs(): string {
  const empfaenger = process.argv[2]?.trim();
  if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
    console.error(
      [
        "Bitte eine Empfängeradresse angeben – alle Testmails gehen nur an sie:",
        "",
        "  npx tsx --env-file=.env.local scripts/send-test-mails.ts test@example.de",
      ].join("\n"),
    );
    process.exit(1);
  }
  return empfaenger;
}

const empfaenger = recipientFromArgs();

/** Beispielanfrage; die Gastadresse ist die Testadresse, damit auch Antwort-an dorthin zeigt. */
const BEISPIEL: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: empfaenger,
  phone: "0176 12345678",
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
  country: null,
  startDate: new Date("2027-07-10"),
  endDate: new Date("2027-07-17"),
  message: "Kommen wir mit dem Zug an? Gibt es einen Parkplatz am Haus?",
  guests: 4,
  // Zwei Kinder: Kurtaxe nur für zwei Personen ab 14 Jahren.
  guestsUnder14: 2,
  linens: 4,
  towels: 2,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
  decidedAt: null,
  anonymizedAt: null,
  termsAcceptedAt: new Date("2027-02-03T09:15:00Z"),
  termsVersion: RENTAL_TERMS_VERSION,
};

/** Beispielrechnung zur Beispielanfrage, wie sie beim Bestätigen entstünde. */
async function beispielRechnung(): Promise<{ number: string; pdf: Uint8Array }> {
  const number = "RE-0000-0000";
  const bank = process.env.BANK_TRANSFER_DETAILS?.trim();
  const snapshot = buildInvoiceSnapshot({
    request: { ...BEISPIEL, status: "confirmed" },
    number,
    issuedAt: new Date(),
    recipientName: BEISPIEL.name,
    recipientAddress: postalAddressLines(BEISPIEL),
    bankDetails: bank ? bank.split("\n").map((zeile) => zeile.trim()) : null,
  });
  return { number, pdf: await renderInvoicePdf(snapshot) };
}

async function testMails(): Promise<Array<[string, Mail]>> {
  return [
    ["Eingangsbestätigung an den Gast", buildGuestRequestReceived(BEISPIEL)],
    ["Info an die Betreiberin", buildBookingRequestNotification(BEISPIEL, empfaenger)],
    [
      "Zusage an den Gast (mit Beispielrechnung und Mietbedingungen im Anhang)",
      buildGuestConfirmation(
        { ...BEISPIEL, status: "confirmed" },
        await beispielRechnung(),
        await renderRentalTermsPdf(),
      ),
    ],
    [
      "Absage an den Gast",
      buildGuestDecline(
        { ...BEISPIEL, status: "declined" },
        "Der Zeitraum ist inzwischen anderweitig vergeben.",
      ),
    ],
    [
      "Sammelmeldung an die Betreiberin (über dem Gesamtlimit)",
      buildOperatorDigest(12, empfaenger, { limit: 40, windowHours: 24 }),
    ],
  ];
}

async function main(): Promise<void> {
  const mails = await testMails();
  let fehler = 0;
  for (const [titel, mail] of mails) {
    const test: Mail = { ...mail, to: empfaenger, subject: `[TEST] ${mail.subject}` };
    try {
      await sendMail(test);
      console.log(`verschickt: ${titel}`);
    } catch (error) {
      fehler += 1;
      console.error(`FEHLER bei „${titel}“:`, error instanceof Error ? error.message : error);
    }
  }

  closeMailTransport();
  console.log(
    fehler === 0
      ? `\nAlle ${mails.length} Mails an ${empfaenger} verschickt.`
      : `\n${fehler} von ${mails.length} Mails nicht verschickt.`,
  );
  process.exitCode = fehler === 0 ? 0 : 1;
}

void main();
