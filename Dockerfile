# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Platzhalter, nur für den Build-Schritt: src/db/client.ts wirft beim Import,
# wenn DATABASE_URL fehlt, und "next build" importiert beim Sammeln der
# Seiten-/Routendaten transitiv dieses Modul. mysql.createPool() verbindet
# erst bei der ersten Query, daher genügt hier ein Fake-Wert.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN npm run build

# Abhängigkeiten des Migrationsskripts (scripts/migrate.mjs): drizzle-orm und
# mysql2 samt allem, was sie brauchen. Das Standalone-Tracing nimmt nur auf,
# was die App importiert – den Migrator (drizzle-orm/mysql2/migrator) nicht.
# Deshalb werden genau diese Pakete aus dem per `npm ci` installierten Baum
# kopiert, in den Versionen aus package-lock.json und ohne Netzzugriff.
# Verworfen: `npm ci --omit=dev` in einer eigenen Stage – das holte alle
# Laufzeitpakete (next samt SWC-Binaries, react, pdf-lib, …) zurück ins Image,
# und das Standalone-Output wäre umsonst.
RUN mkdir -p /migrate \
 && npm query ':is(#drizzle-orm, #mysql2), :is(#drizzle-orm, #mysql2) *' \
  | node -e 'const fs = require("node:fs"); for (const { location } of JSON.parse(fs.readFileSync(0, "utf8"))) fs.cpSync(location, `/migrate/${location}`, { recursive: true });' \
 && cd /migrate \
 && node --input-type=module -e 'await import("drizzle-orm/mysql2/migrator"); await import("mysql2/promise");'

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# server.js lauscht auf HOSTNAME:PORT. Docker setzt HOSTNAME auf die
# Container-ID; der Server hörte dann nur auf deren Adresse statt wie bisher
# `next start` auf allen. PORT wie bisher 3000, von außen überschreibbar.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Als unprivilegierter Nutzer "node" laufen lassen. Die Dateien gehören ihm,
# weil next/image zur Laufzeit nach .next/cache/images schreibt – ohne das
# würde die Bildoptimierung still scheitern.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Standalone enthält weder .next/static noch public; server.js liefert beide
# aus, wenn sie neben ihm liegen.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Migration: Skript mit eigenen node_modules unter /app/migrate, die
# Migrationsdateien unter /app/drizzle (das Skript sucht sie in ../drizzle).
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/scripts/migrate.mjs ./migrate/migrate.mjs
COPY --from=builder --chown=node:node /migrate/node_modules ./migrate/node_modules

USER node

EXPOSE 3000
# Erst migrieren, dann starten; schlägt die Migration fehl, startet der Server
# nicht. `exec`, damit SIGTERM beim Herunterfahren direkt bei Node ankommt
# und offene `after()`-Arbeit noch abgeschlossen wird.
CMD ["sh", "-c", "node migrate/migrate.mjs && exec node server.js"]
