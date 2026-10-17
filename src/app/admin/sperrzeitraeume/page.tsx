import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { getOccupancy } from "@/db/queries";
import { formatDate, formatDateRange } from "@/lib/format";
import { internalStayDeletionDate } from "@/lib/retention";
import { Badge } from "@/components/ui/badge";
import { ManualBlockedPeriodForm } from "@/components/ManualBlockedPeriodForm";
import { DeleteBlockedPeriodButton } from "@/components/DeleteBlockedPeriodButton";

/**
 * `block.endDate` ist intern exklusiv gespeichert (siehe
 * `createMaintenanceBlock`), damit Kalender-Highlighting und
 * Konfliktprüfung dieselbe Konvention wie Gastaufenthalte nutzen. Für die
 * Anzeige hier soll aber wieder der Tag erscheinen, den der Admin beim
 * Anlegen als Ende eingetragen hat – daher ein Tag zurückrechnen.
 * Interne Belegungen speichern den Abreisetag (`createInternalStay`) und
 * werden unverändert angezeigt.
 */
function lastBlockedDay(exclusiveEndDate: Date): Date {
  return new Date(
    Date.UTC(
      exclusiveEndDate.getUTCFullYear(),
      exclusiveEndDate.getUTCMonth(),
      exclusiveEndDate.getUTCDate() - 1,
    ),
  );
}

/** Adresse bleibt `/admin/sperrzeitraeume`; die Seite heißt im Admin „Eintragen“. */
export default async function SperrzeitraeumePage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  // Nur Sperrzeiträume und interne Belegungen (ohne Gastdaten): Buchungen
  // werden über die Storno-Aktion der Belegungsübersicht entfernt, damit die
  // zugehörige Anfrage nicht verwaist zurückbleibt.
  const occupancy = await getOccupancy();
  const blocks = [...occupancy.maintenance].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  return (
    <section className="mx-auto max-w-[900px] px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      <h1 className="mb-2 text-2xl font-extrabold">Belegung eintragen</h1>
      <p className="mb-6 text-sm text-pretty text-schlick-2">
        Telefonisch vereinbarte Buchungen, interne Belegungen und Sperrzeiträume. Alle drei
        sperren den Zeitraum im Kalender der Website.
      </p>

      <div className="grid items-start gap-8 md:grid-cols-[1fr_1.2fr] md:gap-6">
        <ManualBlockedPeriodForm occupancy={occupancy} />

        <div>
          <h2 className="mb-1 text-lg font-bold">Interne Belegungen und Sperrzeiträume</h2>
          <p className="mb-3 text-xs text-schlick-3">
            Eingetragene Buchungen stehen in der Belegungsübersicht unter „Anfragen“.
          </p>
          {blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-7 text-center text-sm text-schlick-3">
              Noch keine internen Belegungen oder Sperrzeiträume eingetragen.
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {blocks.map((block) => (
                <li
                  key={block.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3.5"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold tabular-nums">
                        {block.kind === "internal"
                          ? formatDateRange(block.startDate, block.endDate)
                          : formatDateRange(block.startDate, lastBlockedDay(block.endDate))}
                      </p>
                      <Badge variant={block.kind === "internal" ? "secondary" : "outline"}>
                        {block.kind === "internal" ? "Intern" : "Sperrzeitraum"}
                      </Badge>
                    </div>
                    {block.note && (
                      <p className="text-[13px] break-words text-schlick-2">{block.note}</p>
                    )}
                    {block.kind === "internal" && (
                      <p className="text-xs text-schlick-3">
                        Wird am {formatDate(internalStayDeletionDate(block.endDate))} automatisch
                        gelöscht.
                      </p>
                    )}
                  </div>
                  <DeleteBlockedPeriodButton id={block.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
