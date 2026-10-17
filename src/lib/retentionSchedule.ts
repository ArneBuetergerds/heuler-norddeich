/**
 * Zeitplan der automatischen Löschung: kurz nach dem Start einmal, danach
 * alle 24 Stunden. Wird aus src/instrumentation.ts gestartet.
 *
 * Fehler werden geloggt, beenden aber nie den Prozess – die Website soll auch
 * laufen, wenn die Datenbank kurz nicht erreichbar ist; der nächste Lauf holt
 * nach. Geloggt werden nur Anzahlen.
 */
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { safeError } from "./safeError";

/** Abstand nach dem Start: Der Server soll erst Anfragen annehmen können. */
export const FIRST_RUN_DELAY_MS = 60 * 1000;
export const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Liegt der letzte Lauf länger zurück, läuft die Löschung nicht wie erwartet
 * (zwei verpasste Tage statt einem: ein Neustart verschiebt den Takt).
 */
export const PURGE_STALE_AFTER_MS = 2 * RUN_INTERVAL_MS;

/** Ob die Admin-Seite warnen soll: kein Lauf protokolliert oder zu lange her. */
export function purgeRunOverdue(lastRunAt: Date | null, now: Date): boolean {
  return lastRunAt === null || now.getTime() - lastRunAt.getTime() > PURGE_STALE_AFTER_MS;
}

const STARTED = Symbol.for("heuler.retentionSchedule");

/** Ein Lauf der automatischen Löschung. Wirft nie. */
export async function runRetention(): Promise<void> {
  try {
    // Erst hier geladen: Der DB-Client wirft beim Import ohne DATABASE_URL.
    const [{ db }, { purgeExpiredData, purgeLogMessage }] = await Promise.all([
      import("../db/client"),
      import("../db/retentionQueries"),
    ]);
    const counts = await purgeExpiredData(db);
    console.info(purgeLogMessage(counts));
  } catch (error) {
    // Nicht das Fehlerobjekt: Ein Datenbankfehler kann Parameter der Abfrage
    // (und damit Daten) enthalten. `safeError` nimmt nur die erste Zeile der
    // Meldung, maskiert und ohne Stacktrace.
    console.error(`Automatische Löschung fehlgeschlagen: ${safeError(error)}`);
  }
}

/**
 * Startet den Zeitplan einmal je Prozess. Timer mit `unref()`: Sie halten den
 * Prozess nicht am Leben, ein normales Herunterfahren wartet nicht auf sie.
 */
export function startRetentionSchedule(): void {
  // Next.js ruft `register` beim Build nicht auf; die Prüfung sichert das
  // zusätzlich ab, falls sich das ändert.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }
  const state = globalThis as typeof globalThis & { [STARTED]?: boolean };
  if (state[STARTED]) {
    return;
  }
  state[STARTED] = true;

  setTimeout(() => {
    void runRetention();
    setInterval(() => void runRetention(), RUN_INTERVAL_MS).unref();
  }, FIRST_RUN_DELAY_MS).unref();
}
