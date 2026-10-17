import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { getOccupancy } from "@/db/queries";
import { formatDateRange } from "@/lib/format";
import { ManualBlockedPeriodForm } from "@/components/ManualBlockedPeriodForm";
import { DeleteBlockedPeriodButton } from "@/components/DeleteBlockedPeriodButton";

/**
 * `block.endDate` ist intern exklusiv gespeichert (siehe
 * `createMaintenanceBlock`), damit Kalender-Highlighting und
 * Konfliktprüfung dieselbe Konvention wie Gastaufenthalte nutzen. Für die
 * Anzeige hier soll aber wieder der Tag erscheinen, den der Admin beim
 * Anlegen als Ende eingetragen hat – daher ein Tag zurückrechnen.
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

export default async function SperrzeitraeumePage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  // Nur Sperrzeiträume ohne Gast: Belegungen werden über die Storno-Aktion der
  // Belegungsübersicht entfernt, damit der Gast eine Absage erhält und die
  // zugehörige Anfrage nicht verwaist zurückbleibt.
  const occupancy = await getOccupancy();
  const blocks = [...occupancy.maintenance].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  return (
    <section className="mx-auto max-w-[900px] px-6 pt-12 pb-20">
      <h1 className="mb-6 text-2xl font-extrabold">Manuelle Sperrzeiträume</h1>

      <div className="grid items-start gap-6 md:grid-cols-[1fr_1.4fr]">
        <ManualBlockedPeriodForm occupancy={occupancy} />

        <div className="flex flex-col gap-2.5">
          {blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-7 text-center text-sm text-schlick-3">
              Keine Sperrzeiträume angelegt.
            </div>
          ) : (
            blocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3.5"
              >
                <div>
                  <p className="text-sm font-bold">
                    {formatDateRange(block.startDate, lastBlockedDay(block.endDate))}
                  </p>
                  {block.note && (
                    <p className="text-[13px] text-schlick-2">{block.note}</p>
                  )}
                </div>
                <DeleteBlockedPeriodButton id={block.id} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
