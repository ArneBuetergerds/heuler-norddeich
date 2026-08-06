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

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# TODO (Hardening vor Public-Cutover): Container läuft aktuell als root.
# Beim Umstieg auf USER node: next/image schreibt zur Laufzeit nach
# .next/cache/images - ohne COPY --chown=node:node bzw. chown auf /app
# bricht die Bildoptimierung still.

EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && exec node_modules/.bin/next start"]
