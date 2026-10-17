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
  createManualStay,
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

    // 3. Manueller Aufenthalt ohne Anfrage.
    await createManualStay(
      db,
      {
        guestName: "E2E Familie",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2027-06-05"),
      },
      ACTOR,
    );
    occupancy = await getOccupancy();
    const manual = occupancy.stays.find((s) => s.guestName === "E2E Familie");
    check(
      "Manueller Aufenthalt erscheint als Belegung ohne Anfrage",
      manual?.bookingRequestId === null,
    );

    if (manual) {
      await cancelStay(db, manual.id, ACTOR);
      occupancy = await getOccupancy();
      check(
        "Storno entfernt den manuellen Aufenthalt",
        !occupancy.stays.some((s) => s.id === manual.id),
      );
    }

    // 4. Check-Constraint: Gastname und Anfrage schliessen sich aus.
    const violated = await db
      .insert(blockedPeriod)
      .values({
        startDate: new Date("2027-07-01"),
        endDate: new Date("2027-07-02"),
        guestName: "Ungueltig",
        bookingRequestId: id,
      })
      .then(() => false)
      .catch(() => true);
    check("Datenbank lehnt Gastname UND Anfrage gleichzeitig ab", violated);
  } finally {
    await db.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, id));
    await db.delete(bookingRequest).where(eq(bookingRequest.id, id));
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
