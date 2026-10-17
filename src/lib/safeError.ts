/**
 * Fehler fürs Server-Log, ohne personenbezogene Daten.
 *
 * Komplette Fehlerobjekte gehören nicht ins Log: Ein SMTP-Fehler von
 * nodemailer trägt die Empfängeradresse des Gasts in Meldung, `response` und
 * `rejected`, ein `WebPushError` den Endpoint des Geräts samt Antwort des
 * Push-Dienstes, ein Datenbankfehler die Werte der Abfrage. Übernommen werden
 * deshalb nur unkritische Felder (Fehlerklasse, `code`, `errno`,
 * `responseCode`, `command`, `statusCode`) und die erste Zeile der Meldung –
 * mit maskierten Adressen, URLs und Werten in Anführungszeichen. Kein
 * Stacktrace.
 */

/** Längste geloggte Meldung; der Rest wird abgeschnitten. */
export const SAFE_ERROR_MAX_MESSAGE_LENGTH = 200;

/**
 * So viel der ersten Zeile wird überhaupt maskiert. Die Muster können auf
 * sehr langen Zeilen ohne Treffer quadratisch laufen; gekappt wird deshalb vor
 * dem Maskieren, gekürzt auf SAFE_ERROR_MAX_MESSAGE_LENGTH danach.
 */
export const SAFE_ERROR_MAX_SCAN_LENGTH = 2000;

/** Felder, die nur Art und Ort des Fehlers beschreiben, keine Daten. */
const SAFE_FIELDS = ["code", "errno", "responseCode", "command", "statusCode"] as const;

// Reihenfolge zählt: erst URLs (können ein @ enthalten), dann Adressen.
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi;
const EMAIL_PATTERN = /<?[^\s<>"'(),;:]+@[^\s<>"'(),;:]+>?/g;
const DOUBLE_QUOTED = /"[^"\n]*"/g;
// Nicht nach einem Buchstaben oder einer Ziffer: Apostrophe („Can't“) bleiben.
// (Ohne Lookbehind: tsconfig zielt auf ES2017.)
const SINGLE_QUOTED = /(^|[^A-Za-z0-9À-ɏ])'[^'\n]*'/g;

/**
 * Maskiert in einem Text E-Mail-Adressen (`<adresse>`), URLs (`<url>`) und
 * Werte in Anführungszeichen (`'<wert>'`) – mysql2 und nodemailer setzen
 * eingegebene Werte so in ihre Meldungen („Duplicate entry '…'“,
 * „Invalid recipient "…"“). Nur die erste Zeile, gekürzt.
 */
export function maskSensitive(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0].trim().slice(0, SAFE_ERROR_MAX_SCAN_LENGTH);
  const masked = firstLine
    .replace(URL_PATTERN, "<url>")
    .replace(EMAIL_PATTERN, "<adresse>")
    .replace(DOUBLE_QUOTED, '"<wert>"')
    .replace(SINGLE_QUOTED, "$1'<wert>'");
  return masked.length > SAFE_ERROR_MAX_MESSAGE_LENGTH
    ? `${masked.slice(0, SAFE_ERROR_MAX_MESSAGE_LENGTH)}…`
    : masked;
}

function errorName(error: Error): string {
  // DrizzleQueryError setzt `name` nicht und hieße sonst nur „Error“.
  if (error.name && error.name !== "Error") return error.name;
  return error.constructor?.name || "Error";
}

function safeFields(error: object): string {
  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of SAFE_FIELDS) {
    const value = record[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      parts.push(`${field}=${value}`);
    } else if (typeof value === "string" && value !== "") {
      parts.push(`${field}=${maskSensitive(value)}`);
    }
  }
  return parts.length > 0 ? ` [${parts.join(" ")}]` : "";
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const message = maskSensitive(error.message);
    return `${errorName(error)}${safeFields(error)}${message ? `: ${message}` : ""}`;
  }
  if (typeof error === "string") {
    return `Fehler ohne Fehlerobjekt: ${maskSensitive(error)}`;
  }
  if (typeof error === "object" && error !== null) {
    return `Fehler ohne Fehlerobjekt (object)${safeFields(error)}`;
  }
  return `Fehler ohne Fehlerobjekt (${typeof error})`;
}

/**
 * Einzeilige, unbedenkliche Beschreibung eines beliebigen Fehlers fürs Log.
 * Bei einer `cause` (etwa der mysql2-Fehler hinter einem `DrizzleQueryError`)
 * wird diese eine Ebene tief mit beschrieben.
 */
export function safeError(error: unknown): string {
  const text = describe(error);
  if (error instanceof Error && error.cause !== undefined) {
    return `${text} (Ursache: ${describe(error.cause)})`;
  }
  return text;
}
