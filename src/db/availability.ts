import { and, gt, lt, type SQL } from "drizzle-orm";
import { blockedPeriod } from "./schema";

/**
 * SQL-Bedingung: Der Sperrzeitraum überschneidet sich mit [start, end).
 *
 * Dieselbe Semantik wie `rangesOverlap` (`src/lib/dateRange.ts`): Alle
 * Zeiträume sind halboffen, das Ende ist exklusiv. Deshalb strikt `<` und `>`:
 * Ein Aufenthalt, der am Anreisetag des nächsten endet (Abreisetag =
 * Anreisetag), überschneidet sich nicht. Mit `<=`/`>=` wäre jeder Wechseltag
 * belegt.
 *
 * Gefiltert wird in SQL, damit nicht für jede Prüfung die ganze Tabelle
 * geladen wird.
 */
export function overlapsRange(start: Date, end: Date): SQL {
  // `and()` liefert nur bei lauter leeren Argumenten `undefined`.
  return and(lt(blockedPeriod.startDate, end), gt(blockedPeriod.endDate, start))!;
}

/**
 * SQL-Bedingung: Der Sperrzeitraum reicht über `today` hinaus, sperrt also
 * heute oder später noch mindestens einen Tag. Ein Zeitraum, der heute endet,
 * ist heute schon wieder frei (exklusives Ende) und fällt heraus.
 */
export function endsAfter(today: Date): SQL {
  return gt(blockedPeriod.endDate, today);
}
