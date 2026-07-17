/**
 * Einmaliger End-to-End-Check des Buchungsablaufs gegen die echte Datenbank.
 * Legt eigene Testdaten an und räumt sie am Ende wieder ab.
 *
 * Aufruf: npx tsx --env-file=.env.local scripts/verify-booking-flow.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { bookingRequest, blockedPeriod } from "../src/db/schema";
import {
  confirmBookingRequest,
  declineBookingRequest,
  createManualStay,
  cancelStay,
} from "../src/db/adminQueries";
import { getOccupancy } from "../src/db/queries";

const results: string[] = [];

function check(label: string, ok: boolean): void {
  results.push(`${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [request] = await db
    .insert(bookingRequest)
    .values({
      name: "E2E Pruefgast",
      email: "e2e@example.invalid",
      startDate: new Date("2027-05-01"),
      endDate: new Date("2027-05-08"),
    })
    .returning();

  try {
    // 1. Bestätigen verknüpft den Sperrzeitraum mit der Anfrage.
    await confirmBookingRequest(db, request.id);
    let blocks = await db
      .select()
      .from(blockedPeriod)
      .where(eq(blockedPeriod.bookingRequestId, request.id));
    check("Bestaetigen legt genau eine verknuepfte Belegung an", blocks.length === 1);
    check("Belegung traegt keinen Magic-String mehr", blocks[0]?.note === null);

    let occupancy = await getOccupancy();
    const stay = occupancy.stays.find((s) => s.bookingRequestId === request.id);
    check(
      "Belegung erscheint mit Gastnamen aus der Anfrage",
      stay?.guestName === "E2E Pruefgast",
    );
    check(
      "Belegung zaehlt nicht als Sperrzeitraum",
      !occupancy.maintenance.some((m) => m.id === stay?.id),
    );

    // 2. Der Kern des Bugfixes: Ablehnen gibt den Zeitraum wieder frei.
    await declineBookingRequest(db, request.id, "E2E-Test");
    blocks = await db
      .select()
      .from(blockedPeriod)
      .where(eq(blockedPeriod.bookingRequestId, request.id));
    check(
      "Ablehnen entfernt die Belegung (Regression: Zeitraum blieb dauerhaft gesperrt)",
      blocks.length === 0,
    );

    const [after] = await db
      .select()
      .from(bookingRequest)
      .where(eq(bookingRequest.id, request.id));
    check(
      "Ablehnen speichert Status und Grund",
      after.status === "declined" && after.reasonNote === "E2E-Test",
    );

    // 3. Manueller Aufenthalt ohne Anfrage.
    await createManualStay(db, {
      guestName: "E2E Familie",
      startDate: new Date("2027-06-01"),
      endDate: new Date("2027-06-05"),
    });
    occupancy = await getOccupancy();
    const manual = occupancy.stays.find((s) => s.guestName === "E2E Familie");
    check(
      "Manueller Aufenthalt erscheint als Belegung ohne Anfrage",
      manual?.bookingRequestId === null,
    );

    if (manual) {
      await cancelStay(db, manual.id);
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
        bookingRequestId: request.id,
      })
      .then(() => false)
      .catch(() => true);
    check("Datenbank lehnt Gastname UND Anfrage gleichzeitig ab", violated);
  } finally {
    await db.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, request.id));
    await db.delete(bookingRequest).where(eq(bookingRequest.id, request.id));
  }

  console.log(results.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
