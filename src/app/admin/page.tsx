import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { isAdmin } from "@/lib/adminAuth";
import {
  getBookingHistory,
  getBookingRequestsByIds,
  getOccupancyInRange,
  getPendingBookingRequests,
} from "@/db/queries";
import { getInvoiceSummaries } from "@/db/invoiceQueries";
import { deriveConflict, conflictMessage, spanOf, type Occupancy } from "@/lib/occupancy";
import { formatDateRange } from "@/lib/format";
import {
  adminMonthLinks,
  adminOverviewHref,
  formatMonthLabel,
  monthWindow,
  resolveMonth,
} from "@/lib/month";
import { EXTRAS, extrasTotal } from "@/lib/pricing";
import { vapidConfig } from "@/lib/push";
import { adminDeletionDecision, berlinDay } from "@/lib/retention";
import { AdminPushSettings } from "@/components/AdminPushSettings";
import { AdminRequestActions } from "@/components/AdminRequestActions";
import { DeleteRequestButton } from "@/components/DeleteRequestButton";
import { OccupancyCalendar } from "@/components/OccupancyCalendar";
import { StayDetailProvider } from "@/components/StayDetailProvider";
import { StayList } from "@/components/StayList";
import { StatusBadge } from "@/components/StatusBadge";

/** So viele bearbeitete Anfragen zeigt die Übersicht, bis „Ältere anzeigen“ gewählt wird. */
const HISTORY_LIMIT = 100;

const NO_OCCUPANCY: Occupancy = { stays: [], maintenance: [] };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  // Ohne Client-State: Die ganze Historie ist ein eigener Link
  // (`?historie=alle`), sonst nur die neuesten Einträge. Ebenso der Monat der
  // Belegungsübersicht (`?monat=JJJJ-MM`, sonst der aktuelle, in UTC wie der
  // Kalender).
  const params = await searchParams;
  const showAllHistory = params.historie === "alle";
  const now = new Date();
  const month = resolveMonth(params.monat, now);
  const monthLabel = formatMonthLabel(month);
  const range = monthWindow(month);

  // Offene Anfragen vollständig, die Historie begrenzt, die Belegung nur für
  // den angezeigten Monat.
  const [occupancy, pending, history] = await Promise.all([
    getOccupancyInRange(range.start, range.end),
    getPendingBookingRequests(),
    getBookingHistory({ limit: showAllHistory ? null : HISTORY_LIMIT }),
  ]);

  const stays = [...occupancy.stays].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  // Anfragen nur zu den Aufenthalten, die die Liste zeigt – die
  // Detailansicht braucht nichts anderes. Rechnungen zusätzlich zur Historie:
  // Sie entscheiden, ob „Löschen“ dort löscht oder anonymisiert.
  const stayRequestIds = stays.flatMap((stay) =>
    stay.bookingRequestId === null ? [] : [stay.bookingRequestId],
  );
  const invoiceRequestIds = [
    ...new Set([...stayRequestIds, ...history.entries.map((entry) => entry.id)]),
  ];
  // Die Konfliktwarnung der offenen Anfragen braucht die Belegung in deren
  // Zeitraum, nicht im angezeigten Monat – sonst verschwiege sie Konflikte in
  // anderen Monaten.
  const pendingSpan = spanOf(pending);
  const [stayRequests, invoices, pendingOccupancy] = await Promise.all([
    getBookingRequestsByIds(stayRequestIds),
    getInvoiceSummaries(invoiceRequestIds),
    pendingSpan
      ? getOccupancyInRange(pendingSpan.startDate, pendingSpan.endDate)
      : NO_OCCUPANCY,
  ]);
  const invoicedRequestIds = new Set(invoices.map((entry) => entry.bookingRequestId));
  const today = berlinDay(new Date());

  return (
    <section className="mx-auto max-w-[900px] px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      {/* Nur der öffentliche Schlüssel geht an den Browser. Er wird zur
          Laufzeit übergeben statt als NEXT_PUBLIC_-Variable eingebacken, damit
          das Docker-Image ohne Schlüssel gebaut werden kann. */}
      <AdminPushSettings vapidPublicKey={vapidConfig()?.publicKey ?? null} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Offene Buchungsanfragen</h1>
        <span className="rounded-full border border-duenengras bg-duenengras/20 px-3 py-1 text-xs font-bold text-schlick">
          {pending.length} ausstehend
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-schlick-3">
          Keine offenen Anfragen.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {pending.map((request) => {
            const conflict = deriveConflict(request, pendingOccupancy, pending);
            return (
              <div key={request.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[15px] font-bold">{request.name}</p>
                    {/* Antippbar: Am Handy ruft Sabrina direkt an oder
                        schreibt zurück, ohne die Nummer abzutippen. */}
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-schlick-2">
                      <a
                        href={`mailto:${request.email}`}
                        className="underline underline-offset-2 hover:text-schlick"
                      >
                        {request.email}
                      </a>
                      {request.phone && (
                        <a
                          href={`tel:${request.phone.replace(/[^0-9+]/g, "")}`}
                          className="underline underline-offset-2 hover:text-schlick"
                        >
                          {request.phone}
                        </a>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={conflict ? "conflict" : "pending"} />
                </div>

                <p className="my-3 text-[13px] font-semibold">
                  {formatDateRange(request.startDate, request.endDate)}
                  <span className="font-normal text-schlick-2">
                    {" · "}
                    {request.guests} {request.guests === 1 ? "Person" : "Personen"}
                  </span>
                </p>

                {/* Wäsche muss eine Woche vor Anreise bestellt sein – sie hier
                    direkt an der Anfrage zu sehen, spart den Rückgriff auf die
                    Mail. */}
                {extrasTotal(request) > 0 && (
                  <p className="mb-3.5 rounded-lg bg-priel-hell px-3 py-2.5 text-[13px] text-priel-tief">
                    {(["linens", "towels"] as const)
                      .filter((key) => request[key] > 0)
                      .map((key) => `${EXTRAS[key].label}: ${request[key]}`)
                      .join(" · ")}
                    {" · "}
                    {extrasTotal(request)} € bar vor Ort
                  </p>
                )}

                {conflict && (
                  <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] font-semibold text-destructive">
                    <TriangleAlert className="size-4 shrink-0" />
                    {conflictMessage(conflict)}
                  </div>
                )}

                {request.message && (
                  <p className="mb-3.5 rounded-lg border border-linie bg-sand px-3 py-2.5 text-[13px] text-schlick">
                    {request.message}
                  </p>
                )}

                <AdminRequestActions requestId={request.id} guestName={request.name} />

                {/* Z. B. für Spam: Offene Anfragen haben nie eine Rechnung.
                    Durch eine Linie von Bestätigen/Ablehnen abgesetzt, damit
                    am Handy niemand aus Versehen löscht statt entscheidet. */}
                <div className="mt-3.5 flex justify-end border-t border-linie pt-3">
                  <DeleteRequestButton requestId={request.id} decision="delete" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Erst die offenen Anfragen – sie brauchen eine Entscheidung. Die
          Belegung ist Nachschlagewerk und darf darunter stehen. */}
      <div className="mt-12">
        <h2 className="mb-6 text-2xl font-extrabold">Belegungsübersicht</h2>

        {/* Ein gemeinsamer Detaildialog für Kalender und Liste: Beide zeigen
            dieselben Aufenthalte (`occupancy.stays`) des angezeigten Monats,
            nur anders sortiert – auch den Gast, der am Ersten abreist. */}
        <StayDetailProvider requests={stayRequests} invoices={invoices}>
          <div className="grid items-start gap-6 md:grid-cols-[1.1fr_1fr]">
            <OccupancyCalendar
              occupancy={occupancy}
              monthLinks={adminMonthLinks(month, now, showAllHistory)}
            />
            <div>
              <h3 className="mb-2.5 text-[13px] font-bold text-schlick-2">
                Wer ist im {monthLabel} da
              </h3>
              <StayList stays={stays} monthLabel={monthLabel} />
            </div>
          </div>
        </StayDetailProvider>
      </div>

      {history.entries.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-schlick-2">
            {showAllHistory ? "Alle bearbeiteten Anfragen" : "Kürzlich bearbeitet"}
          </h2>
          <div className="flex flex-col gap-2">
            {history.entries.map((request) => (
              // Am Handy zweizeilig: Name und Zeitraum oben, Status und
              // Löschen darunter – nebeneinander quetschten sie den Namen.
              <div
                key={request.id}
                className="flex flex-col gap-2 rounded-lg border border-linie bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 text-[13px] font-semibold break-words">
                  {request.name} · {formatDateRange(request.startDate, request.endDate)}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <StatusBadge status={request.status} />
                  <DeleteRequestButton
                    requestId={request.id}
                    decision={adminDeletionDecision(
                      request,
                      invoicedRequestIds.has(request.id),
                      today,
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
          {(history.hasMore || showAllHistory) && (
            <Link
              href={adminOverviewHref({ month, today: now, showAllHistory: !showAllHistory })}
              className="mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-schlick-2 underline underline-offset-2 hover:text-schlick"
            >
              {showAllHistory
                ? `Nur die neuesten ${HISTORY_LIMIT} anzeigen`
                : "Ältere anzeigen"}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
