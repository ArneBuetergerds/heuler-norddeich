/**
 * Löschfristen und ihre Berechnung – reine Funktionen ohne Datenbank.
 *
 * Grundlage ist das Löschkonzept in
 * docs/datenschutz/verzeichnis-roenne-art30-1.md, Abschnitt 6.
 * ACHTUNG: Die Fristen sind noch NICHT mit der Steuerberatung abgestimmt.
 * Ändert sich eine Frist, ändert sich die Datenschutzerklärung (Abschnitte
 * „Speicherdauer“ und „Protokoll der Bearbeitung“) automatisch mit, weil ihr
 * Text aus diesen Konstanten erzeugt wird (`retentionNotice`,
 * `actionLogRetentionNotice`).
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
/**
 * Interne Belegungen (Eigennutzung, Familie, Freunde): Monate nach dem Ende
 * des Zeitraums (Abreisetag). Ihre Notiz kann Personen nennen; nach dem
 * Aufenthalt wird sie nicht mehr gebraucht.
 */
export const INTERNAL_RETENTION_MONTHS = 6;
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

/** Tag plus `days` Tage (negativ: zurück), als UTC-Mitternacht. */
export function addDays(day: Date, days: number): Date {
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + days),
  );
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

/**
 * Erster Tag, an dem eine interne Belegung gelöscht werden darf. `endDate` ist
 * der Abreisetag aus der `date`-Spalte, also schon ein Kalendertag.
 */
export function internalStayDeletionDate(endDate: Date): Date {
  return addMonths(endDate, INTERNAL_RETENTION_MONTHS);
}

/** Protokolleinträge vor diesem Zeitpunkt sind abgelaufen. */
export function actionLogCutoff(today: Date): Date {
  return addMonths(today, -12 * ACTION_LOG_RETENTION_YEARS);
}

export type RetentionInvoice = { id: number; bookingRequestId: number; year: number };
/**
 * ALTBESTAND: früher manuell eingetragener Aufenthalt (Gastname ohne Anfrage,
 * `kind = legacy_stay`). Neue telefonische Buchungen sind volle Buchungen und
 * laufen über `requests`.
 */
export type RetentionManualStay = { id: number; endDate: Date };
/** Interne Belegung (`kind = internal`). */
export type RetentionInternalStay = { id: number; endDate: Date };

export type RetentionPlan = {
  /** Rechnungen, deren Frist abgelaufen ist – vor ihren Anfragen zu löschen. */
  deleteInvoiceIds: number[];
  deleteRequestIds: number[];
  anonymizeRequestIds: number[];
  /** Altbestand manueller Aufenthalte, siehe `RetentionManualStay`. */
  deleteManualStayIds: number[];
  deleteInternalStayIds: number[];
  actionLogCutoff: Date;
};

/**
 * Was die automatische Löschung am Stichtag `today` zu tun hat.
 *
 * - Anfrage fällig, keine Rechnung → löschen.
 * - Anfrage fällig, Rechnung noch in ihrer Frist → anonymisieren (einmal).
 * - Anfrage fällig, Rechnung abgelaufen → Rechnung und Anfrage löschen.
 * - Rechnungen nicht fälliger Anfragen bleiben unberührt.
 * - Manuelle Buchungen sind Anfragen (`source = manual`) und laufen wie
 *   Online-Buchungen ab.
 * - Altbestand manueller Aufenthalte (nur Gastname) läuft wie eine zustande
 *   gekommene Buchung ab.
 * - Interne Belegungen werden INTERNAL_RETENTION_MONTHS nach ihrem Ende
 *   gelöscht.
 * - Sperrzeiträume ohne Personenbezug (`kind = block`) kommen hier nicht vor
 *   und bleiben.
 */
export function planRetention(
  {
    requests,
    invoices,
    manualStays,
    internalStays,
  }: {
    requests: RetentionRequest[];
    invoices: RetentionInvoice[];
    manualStays: RetentionManualStay[];
    internalStays: RetentionInternalStay[];
  },
  today: Date,
): RetentionPlan {
  const invoiceByRequest = new Map(invoices.map((entry) => [entry.bookingRequestId, entry]));
  const plan: RetentionPlan = {
    deleteInvoiceIds: [],
    deleteRequestIds: [],
    anonymizeRequestIds: [],
    deleteManualStayIds: [],
    deleteInternalStayIds: [],
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

  for (const stay of internalStays) {
    if (today >= internalStayDeletionDate(stay.endDate)) {
      plan.deleteInternalStayIds.push(stay.id);
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
 * Text für den Abschnitt „Speicherdauer“ der Datenschutzerklärung, aus den Konstanten oben
 * erzeugt, damit Erklärung und Code nicht auseinanderlaufen.
 */
export function retentionNotice(): string {
  return [
    "Wir löschen Anfragedaten automatisch, sobald sie nicht mehr erforderlich sind:",
    `Abgelehnte oder stornierte Anfragen nach ${months(DECLINED_RETENTION_MONTHS)} ab der Absage bzw. Stornierung,`,
    `unbeantwortete Anfragen nach ${months(PENDING_RETENTION_MONTHS)} ab Eingang,`,
    `zustande gekommene Buchungen mit Ablauf des ${BOOKING_RETENTION_YEARS}. Kalenderjahres nach dem Abreisetag.`,
    `Interne Belegungen (Eigennutzung, Aufenthalte von Familie und Freunden) löschen wir nach ${months(INTERNAL_RETENTION_MONTHS)} ab dem Abreisetag.`,
    `Rechnungen bewahren wir ${years(INVOICE_RETENTION_YEARS)} auf, gerechnet ab dem Ende des Kalenderjahres ihrer Ausstellung.`,
    "Solange zu einer Buchung eine Rechnung aufbewahrt wird, löschen wir nach Ablauf der oben genannten Frist Name, E-Mail-Adresse, Telefonnummer, Anschrift und Nachricht der Anfrage;",
    "die Rechnung selbst einschließlich Name und Anschrift des Rechnungsempfängers bleibt bis zum Ablauf ihrer Aufbewahrungsfrist erhalten und wird danach gelöscht.",
  ].join(" ");
}

/**
 * Speicherdauer des Protokolls administrativer Aktionen für die
 * Datenschutzerklärung, aus `ACTION_LOG_RETENTION_YEARS` erzeugt.
 */
export function actionLogRetentionNotice(): string {
  return `Die Protokolleinträge werden ${years(ACTION_LOG_RETENTION_YEARS)} nach ihrer Erstellung automatisch gelöscht.`;
}

/**
 * Sicherheitsabstand der Vorfilter (`retentionPrefilter`) bei Fristen in
 * Monaten, in Tagen. Großzügig gewählt: Die Kappung auf das Monatsende in
 * `addMonths` verschiebt die Grenze um bis zu 3 Tage, der Kalendertag nach
 * deutscher Zeit (`berlinDay`) und die Zeitzone der Datenbankverbindung bei
 * `timestamp`-Spalten um je bis zu einen Tag. Zu viel gelesene Zeilen
 * verwirft `planRetention`; zu wenig gelesene würden nie gelöscht.
 */
export const PREFILTER_MARGIN_DAYS = 7;

/**
 * Obergrenzen (jeweils ausschließlich, `<`), mit denen die Datenbank die
 * Kandidaten der Löschung am Stichtag `day` vorfiltert. Jede Zeile, die
 * `planRetention` an diesem Tag anfassen würde, liegt unter der Grenze; die
 * genaue Entscheidung trifft weiterhin `planRetention`.
 *
 * - `pendingCreatedBefore`: `created_at` offener Anfragen
 * - `declinedBefore`: `decided_at` abgelehnter oder stornierter Anfragen,
 *   ersatzweise `created_at` (Altbestand ohne `decided_at`)
 * - `bookingEndBefore`: `end_date` bestätigter Anfragen und des Altbestands
 *   manueller Aufenthalte – genau, weil die Frist am Jahreswechsel endet
 * - `internalEndBefore`: `end_date` interner Belegungen
 */
export type RetentionPrefilter = {
  pendingCreatedBefore: Date;
  declinedBefore: Date;
  bookingEndBefore: Date;
  internalEndBefore: Date;
};

export function retentionPrefilter(day: Date): RetentionPrefilter {
  const monthsBefore = (count: number) =>
    addDays(addMonths(day, -count), PREFILTER_MARGIN_DAYS);
  return {
    pendingCreatedBefore: monthsBefore(PENDING_RETENTION_MONTHS),
    declinedBefore: monthsBefore(DECLINED_RETENTION_MONTHS),
    // Abreise im Jahr Y → löschbar ab 1.1.(Y + BOOKING_RETENTION_YEARS + 1).
    bookingEndBefore: firstDayOfYear(day.getUTCFullYear() - BOOKING_RETENTION_YEARS),
    internalEndBefore: monthsBefore(INTERNAL_RETENTION_MONTHS),
  };
}

/** So weit schaut die Vorschau „nächste Löschungen“ im Admin voraus. */
export const RETENTION_PREVIEW_DAYS = 90;

export type RetentionPreviewKind =
  | "delete_request"
  | "anonymize_request"
  | "delete_invoice_and_request"
  | "delete_internal_stay"
  | "delete_legacy_stay";

export const RETENTION_PREVIEW_KIND_LABELS: Record<RetentionPreviewKind, string> = {
  delete_request: "Anfrage löschen",
  anonymize_request: "Buchung anonymisieren",
  delete_invoice_and_request: "Rechnung und Anfrage löschen",
  delete_internal_stay: "Interne Belegung löschen",
  delete_legacy_stay: "Altbestand-Aufenthalt löschen",
};

/** Eine anstehende Löschung oder Anonymisierung. */
export type RetentionPreviewEntry = {
  /** Tag, an dem der Lauf sie ausführt; schon Fälliges steht auf `today`. */
  date: Date;
  kind: RetentionPreviewKind;
  /** Worauf sich `id` bezieht: Anfrage oder Eintrag in `blocked_period`. */
  source: "request" | "blocked_period";
  id: number;
  /** Gastname der Anfrage bzw. des Altbestands, Notiz der internen Belegung. */
  label: string | null;
  startDate: Date;
  endDate: Date;
};

export type PreviewRequest = RetentionRequest & { name: string; startDate: Date };
export type PreviewStay = { id: number; startDate: Date; endDate: Date; label: string | null };

/**
 * Was die automatische Löschung von `today` bis einschließlich
 * `today + horizonDays` tun wird, nach Datum sortiert. Dieselben
 * Fristfunktionen und Regeln wie `planRetention`:
 *
 * - Anfrage ohne Rechnung → am Fristende löschen.
 * - Anfrage mit Rechnung → am Fristende anonymisieren (sofern noch nicht
 *   geschehen), mit Ablauf der Rechnungsfrist Rechnung und Anfrage löschen;
 *   endet die Rechnungsfrist zuerst, gleich beides löschen.
 * - Interne Belegungen und Altbestand am Fristende löschen.
 *
 * Schon Fälliges (Datum vor `today`, etwa weil der Lauf noch aussteht)
 * erscheint mit `today`: Es fällt beim nächsten Lauf.
 */
export function previewRetention(
  {
    requests,
    invoices,
    legacyStays,
    internalStays,
  }: {
    requests: PreviewRequest[];
    invoices: RetentionInvoice[];
    legacyStays: PreviewStay[];
    internalStays: PreviewStay[];
  },
  today: Date,
  horizonDays: number = RETENTION_PREVIEW_DAYS,
): RetentionPreviewEntry[] {
  const horizon = addDays(today, horizonDays);
  const at = (due: Date) => (due < today ? today : due);
  const invoiceByRequest = new Map(invoices.map((entry) => [entry.bookingRequestId, entry]));
  const entries: RetentionPreviewEntry[] = [];

  for (const request of requests) {
    const base = {
      source: "request" as const,
      id: request.id,
      label: request.name,
      startDate: request.startDate,
      endDate: request.endDate,
    };
    const due = requestDeletionDate(request);
    const invoice = invoiceByRequest.get(request.id);
    if (!invoice) {
      entries.push({ ...base, date: at(due), kind: "delete_request" });
      continue;
    }
    const invoiceDue = invoiceDeletionDate(invoice.year);
    const deleteAt = at(invoiceDue > due ? invoiceDue : due);
    const anonymizeAt = at(due);
    if (request.anonymizedAt === null && anonymizeAt < deleteAt) {
      entries.push({ ...base, date: anonymizeAt, kind: "anonymize_request" });
    }
    entries.push({ ...base, date: deleteAt, kind: "delete_invoice_and_request" });
  }

  for (const stay of legacyStays) {
    entries.push({
      ...stay,
      source: "blocked_period",
      date: at(bookingDeletionDate(stay.endDate)),
      kind: "delete_legacy_stay",
    });
  }

  for (const stay of internalStays) {
    entries.push({
      ...stay,
      source: "blocked_period",
      date: at(internalStayDeletionDate(stay.endDate)),
      kind: "delete_internal_stay",
    });
  }

  return entries
    .filter((entry) => entry.date <= horizon)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);
}

/** Eine Zeile der Fristen-Übersicht im Admin. */
export type RetentionRule = {
  dataType: string;
  period: string;
  start: string;
  effect: "delete" | "anonymize";
  note?: string;
};

function monthsPeriod(count: number): string {
  return count === 1 ? "1 Monat" : `${count} Monate`;
}

function yearsPeriod(count: number, unit = "Jahre"): string {
  return count === 1 ? `1 ${unit.replace(/e$/, "")}` : `${count} ${unit}`;
}

/**
 * Fristen je Datenart für die Anzeige im Admin, aus den Konstanten oben
 * erzeugt – wie `retentionNotice` für die Datenschutzerklärung.
 */
export function retentionOverview(): RetentionRule[] {
  const booking = {
    period: yearsPeriod(BOOKING_RETENTION_YEARS, "Kalenderjahre"),
    start: "ab Ende des Jahres der Abreise",
  };
  return [
    {
      dataType: "Anfragen ohne Reaktion",
      period: monthsPeriod(PENDING_RETENTION_MONTHS),
      start: "ab Eingang",
      effect: "delete",
    },
    {
      dataType: "Abgelehnte oder stornierte Anfragen",
      period: monthsPeriod(DECLINED_RETENTION_MONTHS),
      start: "ab Absage bzw. Stornierung",
      effect: "delete",
      note: "Ältere Anfragen ohne erfasstes Absagedatum: ab Eingang.",
    },
    {
      dataType: "Buchungen ohne Rechnung (online und telefonisch eingetragen)",
      ...booking,
      effect: "delete",
    },
    {
      dataType: "Buchungen mit Rechnung (online und telefonisch eingetragen)",
      ...booking,
      effect: "anonymize",
      note: "Name, E-Mail-Adresse, Telefonnummer, Anschrift und Nachricht werden entfernt; die Rechnung bleibt bis zum Ende ihrer Frist.",
    },
    {
      dataType: "Rechnungen",
      period: yearsPeriod(INVOICE_RETENTION_YEARS),
      start: "ab Ende des Jahres der Ausstellung",
      effect: "delete",
      note: "Zusammen mit der zugehörigen Anfrage.",
    },
    {
      dataType: "Interne Belegungen",
      period: monthsPeriod(INTERNAL_RETENTION_MONTHS),
      start: "ab Abreisetag",
      effect: "delete",
    },
    {
      dataType: "Altbestand: früher eingetragene Aufenthalte nur mit Gastname",
      ...booking,
      effect: "delete",
    },
    {
      dataType: "Protokoll administrativer Aktionen",
      period: yearsPeriod(ACTION_LOG_RETENTION_YEARS),
      start: "ab Eintrag",
      effect: "delete",
    },
  ];
}
