/**
 * Läuft einmal beim Start eines Next.js-Servers (siehe
 * node_modules/next/dist/docs/01-app/02-guides/instrumentation.md), auch im
 * Standalone-Build des Docker-Images.
 *
 * Startet die automatische Löschung nach den Fristen aus
 * src/lib/retention.ts. Nur im Node.js-Runtime: Datenbanktreiber und Timer
 * gibt es im Edge-Runtime nicht. Der dynamische Import hält den Treiber aus
 * dem Edge-Bundle heraus.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRetentionSchedule } = await import("./lib/retentionSchedule");
    startRetentionSchedule();
  }
}
