import { redirect } from "next/navigation";
import { EyeOff, Trash2, TriangleAlert } from "lucide-react";
import { isAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { getLastPurgeRun, getRetentionPreview, type PurgeCounts } from "@/db/retentionQueries";
import { formatBerlinDateTime, formatDateRange } from "@/lib/format";
import { groupByDay } from "@/lib/groupByDay";
import {
  berlinDay,
  RETENTION_PREVIEW_DAYS,
  RETENTION_PREVIEW_KIND_LABELS,
  retentionOverview,
  type RetentionPreviewKind,
} from "@/lib/retention";
import { purgeRunOverdue } from "@/lib/retentionSchedule";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Effect = "delete" | "anonymize";

const EFFECT_LABELS: Record<Effect, string> = { delete: "löschen", anonymize: "anonymisieren" };

/** Löschen und Anonymisieren auf einen Blick unterscheidbar: Farbe, Symbol und Wort. */
function EffectBadge({ effect }: { effect: Effect }) {
  return effect === "delete" ? (
    <Badge variant="destructive">
      <Trash2 data-icon="inline-start" aria-hidden="true" />
      {EFFECT_LABELS.delete}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <EyeOff data-icon="inline-start" aria-hidden="true" />
      {EFFECT_LABELS.anonymize}
    </Badge>
  );
}

function previewEffect(kind: RetentionPreviewKind): Effect {
  return kind === "anonymize_request" ? "anonymize" : "delete";
}

/** Kalendertag mit Wochentag, z. B. „Sa., 24.10.2026“ (UTC wie `formatDate`). */
function formatDayHeading(day: Date): string {
  return day.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const COUNT_LABELS: [keyof PurgeCounts, string][] = [
  ["requestsDeleted", "Anfragen gelöscht"],
  ["requestsAnonymized", "Buchungen anonymisiert"],
  ["invoicesDeleted", "Rechnungen gelöscht"],
  ["internalStaysDeleted", "Interne Belegungen gelöscht"],
  ["manualStaysDeleted", "Altbestand-Aufenthalte gelöscht"],
  ["logEntriesDeleted", "Protokolleinträge gelöscht"],
];

/**
 * Löschfristen, anstehende Löschungen und der letzte Lauf der automatischen
 * Löschung (src/db/retentionQueries.ts). Beschreibung: docs/loeschlauf.md.
 */
export default async function LoeschfristenPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const now = new Date();
  const today = berlinDay(now);
  const [preview, lastRun] = await Promise.all([
    getRetentionPreview(db, today),
    getLastPurgeRun(db),
  ]);
  const overdue = purgeRunOverdue(lastRun?.at ?? null, now);
  const days = groupByDay(preview, today);
  const nothingDeleted = lastRun !== null && COUNT_LABELS.every(([key]) => lastRun.counts[key] === 0);

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      <h1 className="mb-2 text-2xl font-extrabold">Löschfristen</h1>
      <p className="mb-10 text-sm text-pretty text-schlick-2">
        Personenbezogene Daten werden nach festen Fristen automatisch gelöscht oder
        anonymisiert. Hier sehen Sie die Fristen, was in den nächsten {RETENTION_PREVIEW_DAYS}{" "}
        Tagen ansteht und was der letzte Löschlauf entfernt hat.
      </p>

      <section aria-labelledby="fristen">
        <h2 id="fristen" className="mb-2 text-lg font-bold">
          Fristen
        </h2>
        <p className="mb-3 text-sm text-pretty text-schlick-2">
          Die automatische Löschung läuft kurz nach jedem Start der Website und danach alle 24
          Stunden.
        </p>
        <ul className="flex flex-col gap-2">
          {retentionOverview().map((rule) => (
            <li key={rule.dataType} className="rounded-lg border bg-card px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <p className="min-w-0 text-sm font-bold text-pretty">{rule.dataType}</p>
                <EffectBadge effect={rule.effect} />
              </div>
              <p className="mt-1 text-[13px] text-schlick-2">
                {rule.period} {rule.start}, dann {EFFECT_LABELS[rule.effect]}
              </p>
              {rule.note && <p className="mt-0.5 text-xs text-schlick-3">{rule.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-schlick-3">
          Sperrzeiträume ohne Personenbezug (z. B. Wartung) werden nicht automatisch gelöscht.
        </p>
      </section>

      <section aria-labelledby="naechste" className="mt-12">
        <h2 id="naechste" className="mb-3 text-lg font-bold">
          Nächste {RETENTION_PREVIEW_DAYS} Tage
        </h2>
        {days.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-7 text-center text-sm text-schlick-3">
            Nichts zu tun: In den nächsten {RETENTION_PREVIEW_DAYS} Tagen wird nichts gelöscht
            oder anonymisiert.
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {days.map((day) => (
              <li
                key={day.date.toISOString()}
                className={cn(
                  "rounded-xl border bg-card p-4 shadow-sm sm:p-5",
                  day.isToday && "border-schlick",
                )}
              >
                <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold tabular-nums">
                  {day.isToday && <Badge>Heute</Badge>}
                  {formatDayHeading(day.date)}
                </h3>
                {day.isToday && (
                  <p className="mt-1 text-xs text-schlick-3">
                    Fällig – wird beim nächsten Lauf erledigt.
                  </p>
                )}
                <ul className="mt-3 flex flex-col divide-y divide-linie">
                  {day.entries.map((entry) => (
                    <li
                      key={`${entry.kind}-${entry.source}-${entry.id}`}
                      className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <EffectBadge effect={previewEffect(entry.kind)} />
                        <span className="text-sm font-semibold">
                          {RETENTION_PREVIEW_KIND_LABELS[entry.kind]}
                        </span>
                      </div>
                      <p className="text-[13px] break-words text-schlick-2">
                        <span className="font-medium text-schlick">
                          {entry.label ??
                            (entry.kind === "delete_internal_stay" ? "ohne Notiz" : "ohne Namen")}
                        </span>
                        {" · "}
                        <span className="tabular-nums">
                          {formatDateRange(entry.startDate, entry.endDate)}
                        </span>
                        <span className="text-schlick-3">
                          {" · "}
                          {entry.source === "request" ? "Anfrage" : "Belegung"} #{entry.id}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="letzter-lauf" className="mt-12">
        <h2 id="letzter-lauf" className="mb-3 text-lg font-bold">
          Letzter Löschlauf
        </h2>
        {overdue && (
          // Kein `role="alert"`: Der Hinweis steht beim Laden schon da und
          // soll nicht wie ein akuter Fehler vorgelesen werden.
          <Alert role="status" className="mb-3">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              {lastRun
                ? "Der letzte Löschlauf liegt mehr als 48 Stunden zurück"
                : "Es ist noch kein Löschlauf protokolliert"}
            </AlertTitle>
            <AlertDescription>
              Normalerweise läuft die Löschung alle 24 Stunden, die erste etwa eine Minute nach
              einem Neustart der Website. Bleibt dieser Hinweis länger stehen, lassen Sie bitte
              die Website bzw. ihre Protokolle prüfen.
            </AlertDescription>
          </Alert>
        )}
        {lastRun && (
          <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <p className="text-xs text-schlick-3">Zeitpunkt</p>
            <p className="mb-3 text-[15px] font-bold tabular-nums">
              {formatBerlinDateTime(lastRun.at)}
            </p>
            {nothingDeleted ? (
              <p className="text-[13px] text-schlick-2">Es war nichts fällig.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                {COUNT_LABELS.map(([key, label]) => (
                  <div key={key} className="contents">
                    <dt
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        lastRun.counts[key] === 0 && "font-normal text-schlick-3",
                      )}
                    >
                      {lastRun.counts[key]}
                    </dt>
                    <dd
                      className={cn(
                        "text-schlick-2",
                        lastRun.counts[key] === 0 && "text-schlick-3",
                      )}
                    >
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
