/**
 * Wendet die Migrationen aus `drizzle/` an – im Container vor dem Serverstart
 * (siehe Dockerfile), ohne drizzle-kit: Das ist eine Dev-Abhängigkeit und
 * nicht im Image.
 *
 * Gleiches Verfahren wie `drizzle-kit migrate`, das intern ebenfalls
 * `drizzle-orm/mysql2/migrator` aufruft: dieselbe Tabelle
 * `__drizzle_migrations`, dieselben Hashes. Bereits angewendete Migrationen
 * werden übersprungen, alle neuen laufen in einer Transaktion.
 *
 * Schlägt etwas fehl, endet der Prozess mit Fehlercode – das Startkommando
 * startet den Server dann nicht.
 *
 * Lokal: `node --env-file=.env.local scripts/migrate.mjs` (oder weiterhin
 * `npx drizzle-kit migrate`).
 */
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ist nicht gesetzt");
  process.exit(1);
}

// Relativ zum Skript, nicht zum Arbeitsverzeichnis: im Repo
// scripts/../drizzle, im Image /app/migrate/../drizzle.
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const connection = await mysql.createConnection(url);
try {
  await migrate(drizzle({ client: connection }), { migrationsFolder });
  console.log("Datenbank-Migrationen angewendet");
} finally {
  await connection.end();
}
