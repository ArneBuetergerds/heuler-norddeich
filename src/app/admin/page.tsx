import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { isAdmin } from "@/lib/adminAuth";
import { getBookingRequests, getOccupancy } from "@/db/queries";
import { getInvoices } from "@/db/invoiceQueries";
import { deriveConflict, conflictMessage } from "@/lib/occupancy";
import { formatDateRange } from "@/lib/format";
import { EXTRAS, extrasTotal } from "@/lib/pricing";
import { vapidConfig } from "@/lib/push";
import { AdminPushSettings } from "@/components/AdminPushSettings";
import { AdminRequestActions } from "@/components/AdminRequestActions";
import { OccupancyCalendar } from "@/components/OccupancyCalendar";
import { StayList } from "@/components/StayList";
import { StatusBadge } from "@/components/StatusBadge";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const [occupancy, requests, invoices] = await Promise.all([
    getOccupancy(),
    getBookingRequests(),
    getInvoices(),
  ]);

  const pending = requests.filter((request) => request.status === "pending");
  const history = requests.filter((request) => request.status !== "pending");
  const stays = [...occupancy.stays].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

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
            const conflict = deriveConflict(request, occupancy, pending);
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
              </div>
            );
          })}
        </div>
      )}

      {/* Erst die offenen Anfragen – sie brauchen eine Entscheidung. Die
          Belegung ist Nachschlagewerk und darf darunter stehen. */}
      <div className="mt-12">
        <h2 className="mb-6 text-2xl font-extrabold">Belegungsübersicht</h2>

        <div className="grid items-start gap-6 md:grid-cols-[1.1fr_1fr]">
          <OccupancyCalendar occupancy={occupancy} />
          <div>
            <h3 className="mb-2.5 text-[13px] font-bold text-schlick-2">Wer ist wann da</h3>
            <StayList stays={stays} requests={requests} invoices={invoices} />
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-schlick-2">Kürzlich bearbeitet</h2>
          <div className="flex flex-col gap-2">
            {history.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-linie bg-card px-4 py-3"
              >
                <span className="text-[13px] font-semibold">
                  {request.name} · {formatDateRange(request.startDate, request.endDate)}
                </span>
                <StatusBadge status={request.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
