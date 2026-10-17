/**
 * Löschfristen und ihre Berechnung – reine Funktionen ohne Datenbank.
 *
 * Grundlage ist das Löschkonzept in
 * docs/datenschutz/verzeichnis-roenne-art30-1.md, Abschnitt 6.
 * ACHTUNG: Die Fristen sind noch NICHT mit der Steuerberatung abgestimmt.
 * Ändert sich eine Frist, ändert sich die Datenschutzerklärung (Abschnitt 9)
 * automatisch mit, weil ihr Text aus diesen Konstanten erzeugt wird
 * (`retentionNotice`).
 *
 * Alle Tage sind UTC-Mitternacht des Kalenderdatums, wie die `date`-Spalten.
 * Zeitpunkte (`created_at`, `decided_at`) werden vorher auf ihren Kalendertag
 * nach deutscher Zeit gebracht.
 */
import type { BookingRequest } from "../db/schema";
import { berlinIsoDate } from "./format";

/** Abgelehnte oder stornierte Anfragen: Monate nach der Absage bzw. Stornierung. */
export const DECLINED_RETENTION_MONTHS = 6;
/** Anfragen ohne Reaktion (`pending`): Monate nach Eingang. */
export const PENDING_RETENTION_MONTHS = 6;
/**
 * Zustande gekommene Buchungen: bis zum Ende dieses Kalenderjahres nach dem
 * Aufenthalt (maßgeblich ist der Abreisetag). Regelmäßige Verjährung,
 * §§ 195, 199 BGB.
 */
export const BOOKING_RETENTION_YEARS = 3;
/**
 * Rechnungen: Jahre, gerechnet ab Ende des Kalenderjahres der Ausstellung
 * (wie § 147 Abs. 4 AO).
 */
export const INVOICE_RETENTION_YEARS = 10;
/** Protokoll administrativer Aktionen: Jahre nach dem Eintrag. */
export const ACTION_LOG_RETENTION_YEARS = 3;

/**
 * Platzhalter für Pflichtfelder (Name, E-Mail) einer anonymisierten Anfrage.
 * Die Spalten sind NOT NULL; ein fester Text statt leerer Zeichenkette macht
 * den Zustand in der Oberfläche erkennbar.
 */
export const ANONYMIZED_PLACEHOLDER = "gelöscht";

type Status = BookingRequest["status"];

/** Kalendertag eines Zeitpunkts nach deutscher Zeit, als UTC-Mitternacht. */
export function berlinDay(instant: Date): Date {
  return new Date(`${berlinIsoDate(instant)}T00:00:00Z`);
}

/**
 * Tag plus `months` Monate. Gibt es den Tag im Zielmonat nicht (31.8. plus
 * sechs Monate), gilt der letzte Tag des Monats (28. bzw. 29.2.).
 */
export function addMonths(day: Date, months: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() + months;
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), lastOfMonth)));
}

function firstDayOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

/** Was die Fristberechnung von einer Anfrage braucht – keine Gastdaten. */
export type RetentionRequest = {
  id: number;
  status: Status;
  createdAt: Date;
  decidedAt: Date | null;
  endDate: Date;
  anonymizedAt: Date | null;
};

/** Erster Tag, an dem eine zustande gekommene Buchung gelöscht werden darf. */
export function bookingDeletionDate(endDate: Date): Date {
  // Abreise 2027 → aufbewahren bis 31.12.2030 → löschbar ab 1.1.2031.
  return firstDayOfYear(endDate.getUTCFullYear() + BOOKING_RETENTION_YEARS + 1);
}

/** Erster Tag, an dem die Anfrage gelöscht (oder anonymisiert) werden darf. */
export function requestDeletionDate(request: RetentionRequest): Date {
  switch (request.status) {
    case "pending":
      return addMonths(berlinDay(request.createdAt), PENDING_RETENTION_MONTHS);
    case "declined":
      // Ohne `decided_at` (Zeilen von vor dieser Spalte) zählt der Eingang –
      // die Frist endet damit eher früher als zu spät.
      return addMonths(
        berlinDay(request.decidedAt ?? request.createdAt),
        DECLINED_RETENTION_MONTHS,
      );
    case "confirmed":
      return bookingDeletionDate(request.endDate);
  }
}

/** Erster Tag, an dem eine im Jahr `issuedYear` ausgestellte Rechnung gelöscht werden darf. */
export function invoiceDeletionDate(issuedYear: number): Date {
  // Ausgestellt 2027 → Frist beginnt mit Ablauf des 31.12.2027 → löschbar ab 1.1.2038.
  return firstDayOfYear(issuedYear + INVOICE_RETENTION_YEARS + 1);
}

/** Protokolleinträge vor diesem Zeitpunkt sind abgelaufen. */
export function actionLogCutoff(today: Date): Date {
  return addMonths(today, -12 * ACTION_LOG_RETENTION_YEARS);
}

export type RetentionInvoice = { id: number; bookingRequestId: number; year: number };
/** Manuell eingetragener Aufenthalt (Gastname ohne Anfrage). */
export type RetentionManualStay = { id: number; endDate: Date };

export type RetentionPlan = {
  /** Rechnungen, deren Frist abgelaufen ist – vor ihren Anfragen zu löschen. */
  deleteInvoiceIds: number[];
  deleteRequestIds: number[];
  anonymizeRequestIds: number[];
  deleteManualStayIds: number[];
  actionLogCutoff: Date;
};

/**
 * Was die automatische Löschung am Stichtag `today` zu tun hat.
 *
 * - Anfrage fällig, keine Rechnung → löschen.
 * - Anfrage fällig, Rechnung noch in ihrer Frist → anonymisieren (einmal).
 * - Anfrage fällig, Rechnung abgelaufen → Rechnung und Anfrage löschen.
 * - Rechnungen nicht fälliger Anfragen bleiben unberührt.
 * - Manuell eingetragene Aufenthalte tragen einen Gastnamen und laufen wie
 *   eine zustande gekommene Buchung ab.
 */
export function planRetention(
  {
    requests,
    invoices,
    manualStays,
  }: {
    requests: RetentionRequest[];
    invoices: RetentionInvoice[];
    manualStays: RetentionManualStay[];
  },
  today: Date,
): RetentionPlan {
  const invoiceByRequest = new Map(invoices.map((entry) => [entry.bookingRequestId, entry]));
  const plan: RetentionPlan = {
    deleteInvoiceIds: [],
    deleteRequestIds: [],
    anonymizeRequestIds: [],
    deleteManualStayIds: [],
    actionLogCutoff: actionLogCutoff(today),
  };

  for (const request of requests) {
    if (today < requestDeletionDate(request)) {
      continue;
    }
    const invoice = invoiceByRequest.get(request.id);
    if (!invoice) {
      plan.deleteRequestIds.push(request.id);
    } else if (today >= invoiceDeletionDate(invoice.year)) {
      plan.deleteInvoiceIds.push(invoice.id);
      plan.deleteRequestIds.push(request.id);
    } else if (request.anonymizedAt === null) {
      plan.anonymizeRequestIds.push(request.id);
    }
  }

  for (const stay of manualStays) {
    if (today >= bookingDeletionDate(stay.endDate)) {
      plan.deleteManualStayIds.push(stay.id);
    }
  }

  return plan;
}

/**
 * Was „Löschen“ im Admin mit einer Anfrage tut:
 * - `stay_ahead`: bestätigt und die Abreise liegt noch vor uns – nicht
 *   löschbar, sonst verschwände per Cascade der Kalendereintrag. Erst stornieren.
 * - `anonymize`: es gibt eine Rechnung, die aufbewahrt werden muss.
 * - `already_anonymized`: schon anonymisiert, mehr geht bis zum Ablauf der
 *   Rechnungsfrist nicht.
 * - `delete`: offen, abgelehnt, storniert oder vergangen ohne Rechnung.
 */
export type AdminDeletion = "delete" | "anonymize" | "stay_ahead" | "already_anonymized";

export function adminDeletionDecision(
  request: { status: Status; endDate: Date; anonymizedAt: Date | null },
  hasInvoice: boolean,
  today: Date,
): AdminDeletion {
  // Abreise heute zählt als vergangen: Der Abreisetag sperrt nichts mehr.
  if (request.status === "confirmed" && request.endDate > today) {
    return "stay_ahead";
  }
  if (hasInvoice) {
    return request.anonymizedAt === null ? "anonymize" : "already_anonymized";
  }
  return "delete";
}

function months(count: number): string {
  return count === 1 ? "einem Monat" : `${count} Monaten`;
}

function years(count: number): string {
  return count === 1 ? "ein Jahr" : `${count} Jahre`;
}

/**
 * Text für Abschnitt 9 der Datenschutzerklärung, aus den Konstanten oben
 * erzeugt, damit Erklärung und Code nicht auseinanderlaufen.
 */
export function retentionNotice(): string {
  return [
    "Wir löschen Anfragedaten automatisch, sobald sie nicht mehr erforderlich sind:",
    `Abgelehnte oder stornierte Anfragen nach ${months(DECLINED_RETENTION_MONTHS)} ab der Absage bzw. Stornierung,`,
    `unbeantwortete Anfragen nach ${months(PENDING_RETENTION_MONTHS)} ab Eingang,`,
    `zustande gekommene Buchungen mit Ablauf des ${BOOKING_RETENTION_YEARS}. Kalenderjahres nach dem Abreisetag.`,
    `Rechnungen bewahren wir ${years(INVOICE_RETENTION_YEARS)} auf, gerechnet ab dem Ende des Kalenderjahres ihrer Ausstellung.`,
    "Solange zu einer Buchung eine Rechnung aufbewahrt wird, löschen wir nach Ablauf der oben genannten Frist Name, E-Mail-Adresse, Telefonnummer und Nachricht der Anfrage;",
    "die Rechnung selbst einschließlich Name und Anschrift des Rechnungsempfängers bleibt bis zum Ablauf ihrer Aufbewahrungsfrist erhalten und wird danach gelöscht.",
  ].join(" ");
}
