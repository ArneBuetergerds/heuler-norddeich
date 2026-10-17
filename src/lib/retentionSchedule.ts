/**
 * Zeitplan der automatischen Löschung: kurz nach dem Start einmal, danach
 * alle 24 Stunden. Wird aus src/instrumentation.ts gestartet.
 *
 * Fehler werden geloggt, beenden aber nie den Prozess – die Website soll auch
 * laufen, wenn die Datenbank kurz nicht erreichbar ist; der nächste Lauf holt
 * nach. Geloggt werden nur Anzahlen.
 */
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/** Abstand nach dem Start: Der Server soll erst Anfragen annehmen können. */
export const FIRST_RUN_DELAY_MS = 60 * 1000;
export const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    // Nur die Meldung, nicht das Fehlerobjekt: Ein Datenbankfehler kann
    // Parameter der Abfrage (und damit Daten) enthalten.
    const message = error instanceof Error ? error.message.split("\n")[0] : "unbekannter Fehler";
    console.error(`Automatische Löschung fehlgeschlagen: ${message}`);
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
