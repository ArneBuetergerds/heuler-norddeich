/**
 * Legt Beispielbelegungen an, damit im Kalender alle Zustände sichtbar
 * werden: durchgehender Aufenthalt, Anreise, Abreise, Wechseltag und
 * Sperrzeitraum. Dazu eine bestätigte Anfrage mit Kontaktdaten über einen
 * Saisonwechsel hinweg – an ihr lassen sich Detailansicht und Rechnung
 * ausprobieren.
 *
 * Die Anfrage wird direkt in die Datenbank geschrieben, nicht über die API –
 * es werden also keine E-Mails verschickt.
 *
 * Nur für die lokale Entwicklung gedacht – alle Einträge tragen einen Marker
 * und lassen sich damit rückstandsfrei wieder entfernen.
 *
 *   npx tsx --env-file=.env.local scripts/seed-belegung.ts
 *   npx tsx --env-file=.env.local scripts/seed-belegung.ts --weg
 */
import { inArray, like, or } from "drizzle-orm";
import { db } from "../src/db/client";
import { blockedPeriod, bookingRequest, invoice } from "../src/db/schema";

const MARKER = "[TEST]";

/** Erster Tag des übernächsten Monats – liegt immer sicher in der Zukunft. */
function basismonat(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function tag(offset: number): Date {
  const basis = basismonat();
  return new Date(
    Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), basis.getUTCDate() + offset),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--weg")) {
    // Reihenfolge zählt: Rechnungen verweisen ohne Cascade auf die Anfrage
    // (sie müssen normalerweise aufbewahrt werden). Für Testdaten erst die
    // Rechnungen, dann die Anfragen – deren Belegungen gehen per Cascade mit.
    const testAnfragen = await db
      .select({ id: bookingRequest.id })
      .from(bookingRequest)
      .where(like(bookingRequest.name, `${MARKER}%`));
    const ids = testAnfragen.map((a) => a.id);
    if (ids.length > 0) {
      await db.delete(invoice).where(inArray(invoice.bookingRequestId, ids));
      await db.delete(bookingRequest).where(inArray(bookingRequest.id, ids));
    }

    await db
      .delete(blockedPeriod)
      .where(
        or(
          like(blockedPeriod.guestName, `${MARKER}%`),
          like(blockedPeriod.note, `${MARKER}%`),
        ),
      );
    console.log("Testbelegungen entfernt.");
    return;
  }

  await db.insert(blockedPeriod).values([
    // Aufenthalt A – Abreise am selben Tag, an dem B anreist.
    {
      startDate: tag(4),
      endDate: tag(11),
      guestName: `${MARKER} Familie Janssen`,
    },
    // Aufenthalt B – erzeugt zusammen mit A den Wechseltag.
    {
      startDate: tag(11),
      endDate: tag(16),
      guestName: `${MARKER} Familie Meyer`,
    },
    // Sperrzeitraum: Ende ist exklusiv gespeichert, gesperrt sind Tag 19-21.
    {
      startDate: tag(19),
      endDate: tag(22),
      note: `${MARKER} Eigennutzung`,
    },
  ]);

  // Bestätigte Anfrage über den Saisonwechsel 31.08./01.09. – drei Nächte
  // Hochsommer, vier Nächte Herbst. Legt dieselben zwei Datensätze an wie
  // confirmBookingRequest: die Anfrage und die daraus folgende Belegung.
  const [{ id: anfrageId }] = await db
    .insert(bookingRequest)
    .values({
      name: `${MARKER} Erika Musterfrau`,
      email: "erika.musterfrau@beispiel.invalid",
      phone: "0176 12345678",
      startDate: new Date("2027-08-29"),
      endDate: new Date("2027-09-05"),
      message: "Wir reisen mit dem Zug an.",
      guests: 3,
      linens: 3,
      towels: 2,
      status: "confirmed",
    })
    .$returningId();
  await db.insert(blockedPeriod).values({
    startDate: new Date("2027-08-29"),
    endDate: new Date("2027-09-05"),
    bookingRequestId: anfrageId,
  });

  console.log(
    `Testbelegungen angelegt: Aufenthalt ${tag(4).toISOString().slice(0, 10)} bis ` +
      `${tag(11).toISOString().slice(0, 10)}, Anschluss bis ` +
      `${tag(16).toISOString().slice(0, 10)}, Sperrzeitraum ab ` +
      `${tag(19).toISOString().slice(0, 10)}. Bestätigte Anfrage #${anfrageId} ` +
      `vom 29.08. bis 05.09.2027.`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
