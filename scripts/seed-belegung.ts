/**
 * Legt Beispielbelegungen an, damit im Kalender alle Zustände sichtbar
 * werden: durchgehender Aufenthalt, Anreise, Abreise, Wechseltag, interne
 * Belegung, Sperrzeitraum und ein Altbestands-Aufenthalt. Dazu eine
 * bestätigte Anfrage mit Kontaktdaten über einen Saisonwechsel hinweg – an
 * ihr lassen sich Detailansicht und Rechnung ausprobieren, ebenso an den
 * beiden manuellen Buchungen.
 *
 * Die Einträge werden direkt in die Datenbank geschrieben, nicht über die
 * API – es werden also keine E-Mails verschickt und keine Admin-Aktionen
 * protokolliert. Alle Einträge entstehen in einer Transaktion: Bricht ein
 * Insert ab, bleibt nichts halb angelegt zurück.
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Legt dieselben zwei Datensätze an wie createManualBooking: eine bestätigte
 * Anfrage mit Herkunft `manual` und die zugehörige Belegung. `endDate` ist
 * der Abreisetag.
 */
async function manuelleBuchung(
  tx: Tx,
  buchung: {
    name: string;
    email: string;
    startDate: Date;
    endDate: Date;
    guests: number;
    /** Davon unter 14 Jahren; ohne Angabe 0 (Default der Spalte). */
    guestsUnder14?: number;
    /** Rechnungsanschrift, bei manuellen Buchungen freiwillig. */
    anschrift?: { street: string; postalCode: string; city: string; country?: string };
  },
): Promise<number> {
  const [{ id }] = await tx
    .insert(bookingRequest)
    .values({
      name: buchung.name,
      email: buchung.email,
      startDate: buchung.startDate,
      endDate: buchung.endDate,
      guests: buchung.guests,
      guestsUnder14: buchung.guestsUnder14 ?? 0,
      street: buchung.anschrift?.street ?? null,
      postalCode: buchung.anschrift?.postalCode ?? null,
      city: buchung.anschrift?.city ?? null,
      country: buchung.anschrift?.country ?? null,
      status: "confirmed",
      source: "manual",
      decidedAt: new Date(),
    })
    .$returningId();
  await tx.insert(blockedPeriod).values({
    startDate: buchung.startDate,
    endDate: buchung.endDate,
    kind: "booking",
    bookingRequestId: id,
  });
  return id;
}

async function main(): Promise<void> {
  if (process.argv.includes("--weg")) {
    // Reihenfolge zählt: Rechnungen verweisen ohne Cascade auf die Anfrage
    // (sie müssen normalerweise aufbewahrt werden). Für Testdaten erst die
    // Rechnungen, dann die Belegungen, dann die Anfragen (online wie manuell).
    // Danach die Einträge ohne Anfrage: Altbestand (Gastname), interne
    // Belegung und Sperrzeitraum (Notiz).
    await db.transaction(async (tx) => {
      const testAnfragen = await tx
        .select({ id: bookingRequest.id })
        .from(bookingRequest)
        .where(like(bookingRequest.name, `${MARKER}%`));
      const ids = testAnfragen.map((a) => a.id);
      if (ids.length > 0) {
        await tx.delete(invoice).where(inArray(invoice.bookingRequestId, ids));
        await tx.delete(blockedPeriod).where(inArray(blockedPeriod.bookingRequestId, ids));
        await tx.delete(bookingRequest).where(inArray(bookingRequest.id, ids));
      }

      await tx
        .delete(blockedPeriod)
        .where(
          or(
            like(blockedPeriod.guestName, `${MARKER}%`),
            like(blockedPeriod.note, `${MARKER}%`),
          ),
        );
    });
    console.log("Testbelegungen entfernt.");
    return;
  }

  const anfrageId = await db.transaction(async (tx) => {
    // Manuelle Buchung A – Abreise am selben Tag, an dem B anreist.
    await manuelleBuchung(tx, {
      name: `${MARKER} Familie Janssen`,
      email: "janssen@beispiel.invalid",
      startDate: tag(4),
      endDate: tag(11),
      guests: 4,
      // Zwei Kinder: Kurtaxe für zwei Personen auf der Rechnung.
      guestsUnder14: 2,
      // Mit Anschrift: Im Detaildialog ist die Rechnung damit vorbelegt.
      anschrift: { street: "Deichweg 12", postalCode: "26506", city: "Norden" },
    });
    // Manuelle Buchung B – erzeugt zusammen mit A den Wechseltag.
    await manuelleBuchung(tx, {
      name: `${MARKER} Familie Meyer`,
      email: "meyer@beispiel.invalid",
      startDate: tag(11),
      endDate: tag(16),
      guests: 2,
      // Ohne Anschrift: Sie ist bei manuellen Buchungen freiwillig.
    });

    await tx.insert(blockedPeriod).values([
      // Interne Belegung wie createInternalStay: Ende ist der Abreisetag
      // (zählt nicht mit), belegt sind die Nächte von Tag 19 bis 21.
      {
        startDate: tag(19),
        endDate: tag(22),
        kind: "internal",
        note: `${MARKER} Eigennutzung`,
      },
      // Altbestand: früher manuell eingetragener Aufenthalt nur mit
      // Gastnamen. Wird nicht mehr neu angelegt, muss aber anzeigbar bleiben.
      {
        startDate: tag(24),
        endDate: tag(27),
        kind: "legacy_stay",
        guestName: `${MARKER} Familie Ahrends (Altbestand)`,
      },
      // Sperrzeitraum wie createMaintenanceBlock: Ende ist exklusiv
      // gespeichert, gesperrt sind Tag 29 und 30.
      {
        startDate: tag(29),
        endDate: tag(31),
        kind: "block",
        note: `${MARKER} Wartung Heizung`,
      },
    ]);

    // Bestätigte Anfrage über den Saisonwechsel 31.08./01.09. – drei Nächte
    // Hochsommer, vier Nächte Herbst. Legt dieselben zwei Datensätze an wie
    // confirmBookingRequest: die Anfrage und die daraus folgende Belegung.
    const [{ id }] = await tx
      .insert(bookingRequest)
      .values({
        name: `${MARKER} Erika Musterfrau`,
        email: "erika.musterfrau@beispiel.invalid",
        phone: "0176 12345678",
        street: "Hauptstraße 3",
        postalCode: "1010",
        city: "Wien",
        country: "Österreich",
        startDate: new Date("2027-08-29"),
        endDate: new Date("2027-09-05"),
        message: "Wir reisen mit dem Zug an.",
        guests: 3,
        // Saisonwechsel beim Mietpreis, ein Kind ohne Kurtaxe.
        guestsUnder14: 1,
        linens: 3,
        towels: 2,
        status: "confirmed",
        decidedAt: new Date(),
      })
      .$returningId();
    await tx.insert(blockedPeriod).values({
      startDate: new Date("2027-08-29"),
      endDate: new Date("2027-09-05"),
      kind: "booking",
      bookingRequestId: id,
    });
    return id;
  });

  console.log(
    `Testbelegungen angelegt: manuelle Buchung ${iso(tag(4))} bis ${iso(tag(11))}, ` +
      `Anschluss bis ${iso(tag(16))}, Eigennutzung ab ${iso(tag(19))}, ` +
      `Altbestand ab ${iso(tag(24))}, Sperrzeitraum ab ${iso(tag(29))}. ` +
      `Bestätigte Anfrage #${anfrageId} vom 29.08. bis 05.09.2027.`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
