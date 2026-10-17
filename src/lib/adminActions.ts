/**
 * Aktionen, die im Protokoll administrativer Aktionen (`admin_action_log`)
 * landen. Gespeichert als varchar; die Liste hier ist die einzige Quelle.
 */
export const ADMIN_ACTIONS = [
  "confirm",
  "decline",
  "cancel",
  "manual_stay",
  "block_create",
  "block_delete",
  "invoice_create",
  "request_delete",
  "request_anonymize",
  "purge",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/**
 * Zusatzangaben zu einem Protokolleintrag. Nur Zeiträume, Status, Nummern und
 * Anzahlen – nie Name, E-Mail, Telefon, Nachricht oder Begründungstext.
 */
export type AdminActionDetails = Record<string, string | number | boolean | null>;

/** Akteur der automatischen Löschung. */
export const SYSTEM_ACTOR = "system";
