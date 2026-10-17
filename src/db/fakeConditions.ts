/**
 * Nur für Tests: wertet Drizzle-Bedingungen gegen Zeilen im Speicher aus, damit
 * die Fake-DBs in `*.test.ts` wirklich filtern statt alles zurückzugeben.
 *
 * Die Bedingung wird mit dem echten MySQL-Dialekt zu SQL übersetzt und dann
 * gelesen. Unterstützt sind nur Vergleiche (`=`, `<>`, `<`, `>`, `<=`, `>=`,
 * `in (…)`) zwischen Spalte und Parameter, verknüpft mit `and`. Alles andere
 * wirft – ein Test soll nie still an einer nicht verstandenen Bedingung
 * vorbeilaufen.
 *
 * Verglichen wird in der Form, die auch an MySQL ginge: Der Zeilenwert läuft
 * durch `mapToDriverValue` der Spalte (ein `date` wird so zu "YYYY-MM-DD"),
 * die Parameter liegen nach dem Übersetzen schon so vor.
 */
import { getTableColumns, getTableName, type SQL, type Table } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const dialect = new MySqlDialect();

const PREDICATE = /`(\w+)`\.`(\w+)` (=|<>|<=|>=|<|>|in) (\?|\((?:\?, )*\?\))/g;

type Row = Record<string, unknown>;

function columnFor(table: Table, tableName: string, columnName: string) {
  if (tableName !== getTableName(table)) {
    throw new Error(`Bedingung auf fremder Tabelle: ${tableName}`);
  }
  const entry = Object.entries(getTableColumns(table)).find(
    ([, column]) => column.name === columnName,
  );
  if (!entry) {
    throw new Error(`Unbekannte Spalte ${tableName}.${columnName}`);
  }
  const [key, column] = entry;
  return { key, column };
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  switch (operator) {
    case "=":
      return left === right;
    case "<>":
      return left !== right;
    case "<":
      return (left as string | number) < (right as string | number);
    case ">":
      return (left as string | number) > (right as string | number);
    case "<=":
      return (left as string | number) <= (right as string | number);
    case ">=":
      return (left as string | number) >= (right as string | number);
    default:
      throw new Error(`Operator ${operator} nicht unterstützt`);
  }
}

/** Ein Prädikat je Vergleich; die Zeile passt, wenn alle zutreffen. */
export function compileCondition(
  table: Table,
  condition: SQL | undefined,
): (row: Row) => boolean {
  if (!condition) {
    return () => true;
  }
  const { sql, params } = dialect.sqlToQuery(condition);

  const rest = sql.replace(PREDICATE, "").replace(/\band\b|[()\s]/g, "");
  if (rest !== "") {
    throw new Error(`Bedingung nicht unterstützt: ${sql}`);
  }

  const checks: ((row: Row) => boolean)[] = [];
  let next = 0;
  for (const [, tableName, columnName, operator, placeholders] of sql.matchAll(PREDICATE)) {
    const { key, column } = columnFor(table, tableName, columnName);
    const count = placeholders.split("?").length - 1;
    const values = params.slice(next, next + count);
    next += count;

    const driverValue = (row: Row) =>
      row[key] === null || row[key] === undefined ? null : column.mapToDriverValue(row[key]);

    checks.push(
      operator === "in"
        ? (row) => values.includes(driverValue(row))
        : (row) => {
            const value = driverValue(row);
            return value !== null && compare(value, operator, values[0]);
          },
    );
  }

  return (row) => checks.every((check) => check(row));
}

const ORDER = /^`(\w+)`\.`(\w+)`(?: (asc|desc))?$/;

/** Vergleichsfunktion für `orderBy(asc(…), desc(…))`. */
export function compileOrder(table: Table, order: SQL[]): (a: Row, b: Row) => number {
  const keys = order.map((entry) => {
    const { sql } = dialect.sqlToQuery(entry);
    const match = ORDER.exec(sql);
    if (!match) {
      throw new Error(`Sortierung nicht unterstützt: ${sql}`);
    }
    const { key, column } = columnFor(table, match[1], match[2]);
    return { key, column, direction: match[3] === "desc" ? -1 : 1 };
  });

  return (a, b) => {
    for (const { key, column, direction } of keys) {
      const left = column.mapToDriverValue(a[key]) as string | number;
      const right = column.mapToDriverValue(b[key]) as string | number;
      if (left !== right) {
        return (left < right ? -1 : 1) * direction;
      }
    }
    return 0;
  };
}
