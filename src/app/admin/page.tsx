import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { getBookingRequests, getOccupancy } from "@/db/queries";
import { deriveConflict, conflictMessage } from "@/lib/occupancy";
import { formatDateRange } from "@/lib/format";
import { AdminRequestActions } from "@/components/AdminRequestActions";
import { OccupancyCalendar } from "@/components/OccupancyCalendar";
import { StayList } from "@/components/StayList";
import { StatusBadge } from "@/components/StatusBadge";

export default async function AdminPage() {
  const session = await auth();
  if (!session) {
    redirect("/admin/login");
  }

  const [occupancy, requests] = await Promise.all([getOccupancy(), getBookingRequests()]);

  const pending = requests.filter((request) => request.status === "pending");
  const history = requests.filter((request) => request.status !== "pending");
  const stays = [...occupancy.stays].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  return (
    <section className="mx-auto max-w-[900px] px-6 pt-12 pb-20">
      <h1 className="mb-6 text-2xl font-extrabold">Belegungsübersicht</h1>

      <div className="mb-10 grid items-start gap-6 md:grid-cols-[1.1fr_1fr]">
        <OccupancyCalendar occupancy={occupancy} />
        <div>
          <h2 className="mb-2.5 text-[13px] font-bold text-zinc-500">Wer ist wann da</h2>
          <StayList stays={stays} />
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Offene Buchungsanfragen</h1>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
          {pending.length} ausstehend
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-zinc-400">
          Keine offenen Anfragen.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {pending.map((request) => {
            const conflict = deriveConflict(request, occupancy, pending);
            return (
              <div key={request.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[15px] font-bold">{request.name}</p>
                    <p className="text-[13px] text-zinc-500">
                      {request.email}
                      {request.phone ? ` · ${request.phone}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={conflict ? "conflict" : "pending"} />
                </div>

                <p className="my-3 text-[13px] font-semibold">
                  {formatDateRange(request.startDate, request.endDate)}
                </p>

                {conflict && (
                  <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
                    <TriangleAlert className="size-4 shrink-0" />
                    {conflictMessage(conflict)}
                  </div>
                )}

                {request.message && (
                  <p className="mb-3.5 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-[13px] text-zinc-700">
                    {request.message}
                  </p>
                )}

                <AdminRequestActions requestId={request.id} guestName={request.name} />
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-zinc-500">Kürzlich bearbeitet</h2>
          <div className="flex flex-col gap-2">
            {history.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-card px-4 py-3"
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
