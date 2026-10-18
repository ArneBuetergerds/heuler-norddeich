/**
 * Einmaliger End-to-End-Check des Buchungsablaufs gegen die echte Datenbank.
 * Legt eigene Testdaten an und räumt sie am Ende wieder ab.
 *
 * Aufruf: npx tsx --env-file=.env.local scripts/verify-booking-flow.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { adminActionLog, bookingRequest, blockedPeriod } from "../src/db/schema";
import {
  confirmBookingRequest,
  declineBookingRequest,
  createInternalStay,
  createManualBooking,
  cancelStay,
} from "../src/db/adminQueries";
import { getOccupancy } from "../src/db/queries";

const results: string[] = [];

/** Akteur im Protokoll administrativer Aktionen; die Einträge räumt der Check wieder ab. */
const ACTOR = "e2e-check";

function check(label: string, ok: boolean): void {
  results.push(`${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [{ id }] = await db
    .insert(bookingRequest)
    .values({
      name: "E2E Pruefgast",
      email: "e2e@example.invalid",
      startDate: new Date("2027-05-01"),
      endDate: new Date("2027-05-08"),
    })
    .$returningId();
  let manualRequestId: number | null = null;

  try {
    // 1. Bestätigen verknüpft den Sperrzeitraum mit der Anfrage.
    await confirmBookingRequest(db, id, ACTOR);
    let blocks = await db
      .select()
      .from(blockedPeriod)
      .where(eq(blockedPeriod.bookingRequestId, id));
    check("Bestaetigen legt genau eine verknuepfte Belegung an", blocks.length === 1);
    check("Belegung traegt keinen Magic-String mehr", blocks[0]?.note === null);

    let occupancy = await getOccupancy();
    const stay = occupancy.stays.find((s) => s.bookingRequestId === id);
    check(
      "Belegung erscheint mit Gastnamen aus der Anfrage",
      stay?.guestName === "E2E Pruefgast",
    );
    check(
      "Belegung zaehlt nicht als Sperrzeitraum",
      !occupancy.maintenance.some((m) => m.id === stay?.id),
    );

    // 2. Der Kern des Bugfixes: Ablehnen gibt den Zeitraum wieder frei.
    await declineBookingRequest(db, id, ACTOR, "E2E-Test");
    blocks = await db
      .select()
      .from(blockedPeriod)
      .where(eq(blockedPeriod.bookingRequestId, id));
    check(
      "Ablehnen entfernt die Belegung (Regression: Zeitraum blieb dauerhaft gesperrt)",
      blocks.length === 0,
    );

    const [after] = await db
      .select()
      .from(bookingRequest)
      .where(eq(bookingRequest.id, id));
    check(
      "Ablehnen speichert Status und Grund",
      after.status === "declined" && after.reasonNote === "E2E-Test",
    );

    // 3. Interne Belegung ohne Gastdaten.
    await createInternalStay(
      db,
      {
        startDate: new Date("2027-06-01"),
        endDate: new Date("2027-06-05"),
        note: "E2E intern",
      },
      ACTOR,
    );
    occupancy = await getOccupancy();
    const internal = occupancy.maintenance.find((m) => m.note === "E2E intern");
    check("Interne Belegung erscheint als Sperrzeitraum der Art intern", internal?.kind === "internal");

    if (internal) {
      await cancelStay(db, internal.id, ACTOR);
      occupancy = await getOccupancy();
      check(
        "Entfernen löscht die interne Belegung",
        !occupancy.maintenance.some((m) => m.id === internal.id),
      );
    }

    // 3b. Manuelle Buchung: bestätigte Anfrage mit Herkunft "manual".
    manualRequestId = (
      await createManualBooking(
        db,
        {
          name: "E2E Telefongast",
          email: "e2e-manuell@example.invalid",
          startDate: new Date("2027-06-10"),
          endDate: new Date("2027-06-15"),
          guests: 2,
          guestsUnder14: 1,
          linens: 0,
          towels: 0,
        },
        ACTOR,
      )
    ).bookingRequestId;
    occupancy = await getOccupancy();
    const manual = occupancy.stays.find((s) => s.bookingRequestId === manualRequestId);
    check("Manuelle Buchung erscheint als Belegung mit Herkunft manual", manual?.source === "manual");

    // 3c. Kinder unter 14 (BDS-006): gespeichert bei der manuellen Buchung,
    // Default 0 ohne Angabe, und die Datenbank lehnt „alle unter 14“ ab.
    const [manualRow] = await db
      .select({ guestsUnder14: bookingRequest.guestsUnder14 })
      .from(bookingRequest)
      .where(eq(bookingRequest.id, manualRequestId));
    check("Manuelle Buchung speichert die Kinder unter 14", manualRow?.guestsUnder14 === 1);
    const [firstRow] = await db
      .select({ guestsUnder14: bookingRequest.guestsUnder14 })
      .from(bookingRequest)
      .where(eq(bookingRequest.id, id));
    check("Anfrage ohne Angabe zählt 0 Kinder unter 14", firstRow?.guestsUnder14 === 0);
    const under14Violated = await db
      .insert(bookingRequest)
      .values({
        name: "E2E Ungueltig",
        email: "e2e-ungueltig@example.invalid",
        startDate: new Date("2027-07-01"),
        endDate: new Date("2027-07-02"),
        guests: 1,
        guestsUnder14: 1,
      })
      .$returningId()
      .then(async ([row]) => {
        if (row) {
          await db.delete(bookingRequest).where(eq(bookingRequest.id, row.id));
        }
        return false;
      })
      .catch(() => true);
    check("Datenbank lehnt mehr Kinder unter 14 als Personen − 1 ab", under14Violated);

    // 4. Check-Constraint: Gastname und Anfrage schliessen sich aus. Die Art
    // passt zur Anfrage (`booking`), damit allein der Gastname die Zeile
    // ungültig macht (blocked_period_guest_source, blocked_period_kind_legacy_stay).
    const violated = await db
      .insert(blockedPeriod)
      .values({
        startDate: new Date("2027-07-01"),
        endDate: new Date("2027-07-02"),
        kind: "booking",
        guestName: "Ungueltig",
        bookingRequestId: id,
      })
      .then(() => false)
      .catch(() => true);
    check("Datenbank lehnt Gastname UND Anfrage gleichzeitig ab", violated);
  } finally {
    await db.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, id));
    await db.delete(bookingRequest).where(eq(bookingRequest.id, id));
    await db.delete(blockedPeriod).where(eq(blockedPeriod.note, "E2E intern"));
    if (manualRequestId !== null) {
      await db.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, manualRequestId));
      await db.delete(bookingRequest).where(eq(bookingRequest.id, manualRequestId));
    }
    await db.delete(adminActionLog).where(eq(adminActionLog.actor, ACTOR));
  }

  console.log(results.join("\n"));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
