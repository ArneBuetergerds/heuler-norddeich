/**
 * Gibt alle automatischen E-Mails mit Beispieldaten auf der Konsole aus –
 * ohne SMTP, ohne Datenbank, ohne dass irgendetwas versendet wird.
 *
 * Gedacht zur inhaltlichen Abstimmung: einmal laufen lassen, Ausgabe kopieren,
 * durchlesen lassen.
 *
 *   npx tsx scripts/preview-mails.ts
 */
import type { BookingRequest } from "../src/db/schema";
import {
  MAIL_ABSENDER,
  buildBookingRequestNotification,
  buildGuestConfirmation,
  buildGuestDecline,
  buildGuestRequestReceived,
  type Mail,
} from "../src/lib/email";

const BEISPIEL: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: "erika.musterfrau@beispiel.de",
  phone: "0176 12345678",
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
  country: null,
  startDate: new Date("2027-07-10"),
  endDate: new Date("2027-07-17"),
  message: "Kommen wir mit dem Zug an? Gibt es einen Parkplatz am Haus?",
  guests: 4,
  linens: 4,
  towels: 2,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
  decidedAt: null,
  anonymizedAt: null,
};

/** Zweiter Fall: kleine Anfrage ohne Zusatzbestellung und ohne Nachricht. */
const SCHLICHT: BookingRequest = {
  ...BEISPIEL,
  name: "Jan Petersen",
  email: "jan.petersen@beispiel.de",
  phone: null,
  message: null,
  guests: 2,
  linens: 0,
  towels: 0,
};

function ausgeben(titel: string, wann: string, mail: Mail): void {
  const trenner = "=".repeat(72);
  console.log(`\n${trenner}\n${titel}\n${trenner}`);
  console.log(`Wird ausgelöst: ${wann}`);
  console.log(`Von:      ${MAIL_ABSENDER.from}`);
  console.log(`An:       ${mail.to}`);
  console.log(`Antwort an: ${mail.replyTo ?? "(nicht gesetzt)"}`);
  console.log(`Betreff:  ${mail.subject}`);
  for (const anhang of mail.attachments ?? []) {
    console.log(`Anhang:   ${anhang.filename} (${anhang.contentType}, ${anhang.content.length} Byte)`);
  }
  console.log("-".repeat(72));
  console.log(mail.text);
}

const betreiberin = "kontakt@norddeich-heuler.de";

ausgeben(
  "1. An die Vermieterin – neue Anfrage",
  "sobald ein Gast das Formular abschickt",
  buildBookingRequestNotification(BEISPIEL, betreiberin),
);

ausgeben(
  "2. An den Gast – Eingangsbestätigung",
  "sobald ein Gast das Formular abschickt",
  buildGuestRequestReceived(BEISPIEL),
);

// Ohne Datenbank und ohne PDF-Erzeugung: Ein Platzhalter steht für das PDF,
// gezeigt werden Text und Anhangname. Das echte PDF verschickt
// scripts/send-test-mails.ts.
ausgeben(
  "3. An den Gast – Zusage mit Rechnung im Anhang",
  'wenn im Admin auf "Bestätigen" geklickt wird',
  buildGuestConfirmation(BEISPIEL, {
    number: "RE-2027-0001",
    pdf: new TextEncoder().encode("%PDF- Platzhalter"),
  }),
);

ausgeben(
  "3b. Dieselbe Zusage, wenn die Rechnung nicht erstellt werden konnte",
  "die Betreiberin erstellt die Rechnung dann im Detaildialog und schickt sie nach",
  buildGuestConfirmation(BEISPIEL),
);

ausgeben(
  "4. An den Gast – Absage oder Storno",
  'wenn im Admin abgelehnt oder ein Aufenthalt storniert wird',
  buildGuestDecline(BEISPIEL, "Der Zeitraum ist inzwischen anderweitig vergeben."),
);

ausgeben(
  "4b. Dieselbe Absage ohne angegebenen Grund",
  "der Grund ist im Admin ein Freitextfeld und darf leer bleiben",
  buildGuestDecline(BEISPIEL),
);

ausgeben(
  "5. Eingangsbestätigung ohne Wäschebestellung",
  "zum Vergleich: so sieht die Mail ohne Zusatzposten aus",
  buildGuestRequestReceived(SCHLICHT),
);

console.log(
  "\nHinweis: Alle Mails gehen als reiner Text raus, ohne HTML und ohne Bilder; die Zusage mit der Rechnung als PDF-Anhang.\n",
);
