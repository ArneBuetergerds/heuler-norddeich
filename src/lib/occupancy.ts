import { rangesOverlap } from "./dateRange";

/**
 * Ein `blocked_period`-Datensatz samt Gastname der verknüpften Anfrage (Join).
 * `requestName` ist nur gesetzt, wenn `bookingRequestId` auf eine Anfrage zeigt.
 */
export type OccupancyRow = {
  id: number;
  startDate: Date;
  endDate: Date;
  note: string | null;
  guestName: string | null;
  bookingRequestId: number | null;
  requestName: string | null;
};

/** Belegter Zeitraum mit Gast – aus bestätigter Anfrage oder manuell eingetragen. */
export type Stay = {
  id: number;
  startDate: Date;
  endDate: Date;
  guestName: string;
  /** null = manuell eingetragener Aufenthalt ohne zugrundeliegende Anfrage. */
  bookingRequestId: number | null;
};

/** Gesperrter Zeitraum ohne Gast: Wartung, Eigennutzung, … */
export type Maintenance = {
  id: number;
  startDate: Date;
  endDate: Date;
  note: string | null;
};

export type Occupancy = {
  stays: Stay[];
  maintenance: Maintenance[];
};

function toStay(row: OccupancyRow): Stay | null {
  const guestName = row.requestName ?? row.guestName;
  if (guestName === null) {
    return null;
  }
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    guestName,
    bookingRequestId: row.bookingRequestId,
  };
}

/**
 * Trennt die Sperrzeiträume in Belegungen (mit Gast) und reine Sperrzeiträume.
 * Beide sperren die Verfügbarkeit gleichermaßen – der Unterschied ist rein
 * darstellend: Belegungen erscheinen rot mit Gastnamen, Sperrzeiträume grau
 * mit Notiz.
 */
export function splitOccupancy(rows: OccupancyRow[]): Occupancy {
  const stays: Stay[] = [];
  const maintenance: Maintenance[] = [];

  for (const row of rows) {
    const stay = toStay(row);
    if (stay) {
      stays.push(stay);
    } else {
      maintenance.push({
        id: row.id,
        startDate: row.startDate,
        endDate: row.endDate,
        note: row.note,
      });
    }
  }

  return { stays, maintenance };
}

export type ConflictKind = "stay" | "maintenance" | "pending";

const CONFLICT_MESSAGES: Record<ConflictKind, string> = {
  stay: "Überschneidet sich mit einem bereits bestätigten Aufenthalt.",
  maintenance: "Überschneidet sich mit einem gesperrten Zeitraum.",
  pending: "Überschneidet sich mit einer anderen offenen Anfrage.",
};

export function conflictMessage(kind: ConflictKind): string {
  return CONFLICT_MESSAGES[kind];
}

type DateRange = { startDate: Date; endDate: Date };
type IdentifiedRange = DateRange & { id: number };

/**
 * Leitet den Konflikt einer offenen Anfrage aus dem aktuellen Belegungsstand ab,
 * statt ihn zu speichern: Ein Konflikt ist kein Zustand der Anfrage, sondern
 * eine Beziehung zu anderen Zeiträumen, die sich jederzeit ändern kann.
 *
 * Die Reihenfolge entspricht der Dringlichkeit: eine bestätigte Belegung wiegt
 * schwerer als ein Sperrzeitraum, dieser schwerer als eine konkurrierende Anfrage.
 */
export function deriveConflict(
  request: IdentifiedRange,
  occupancy: Occupancy,
  otherPending: IdentifiedRange[],
): ConflictKind | null {
  const overlaps = (other: DateRange): boolean =>
    rangesOverlap(request.startDate, request.endDate, other.startDate, other.endDate);

  if (occupancy.stays.some(overlaps)) {
    return "stay";
  }
  if (occupancy.maintenance.some(overlaps)) {
    return "maintenance";
  }
  if (otherPending.some((other) => other.id !== request.id && overlaps(other))) {
    return "pending";
  }
  return null;
}
