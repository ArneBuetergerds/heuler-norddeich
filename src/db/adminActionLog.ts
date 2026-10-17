import { adminActionLog, type NewAdminActionLogRow } from "./schema";

type Db = typeof import("./client").db;

/**
 * Schreibt einen Eintrag ins Protokoll administrativer Aktionen.
 *
 * Immer mit der Transaktion der Aktion aufrufen (`tx`), nicht mit der
 * Verbindung: Scheitert die Aktion, gibt es auch keinen Eintrag – und
 * umgekehrt.
 */
export async function logAdminAction(
  tx: { insert: Db["insert"] },
  entry: Omit<NewAdminActionLogRow, "id" | "createdAt">,
): Promise<void> {
  await tx.insert(adminActionLog).values({
    actor: entry.actor,
    action: entry.action,
    bookingRequestId: entry.bookingRequestId ?? null,
    blockedPeriodId: entry.blockedPeriodId ?? null,
    details: entry.details ?? null,
  });
}

/** Kalendertag einer `date`-Spalte als "YYYY-MM-DD" für `details`. */
export function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}
