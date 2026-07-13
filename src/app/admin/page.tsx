import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bookingRequest } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AdminRequestActions } from "@/components/AdminRequestActions";

export default async function AdminPage() {
  const session = await auth();
  if (!session) {
    redirect("/admin/login");
  }

  const pendingRequests = await db
    .select()
    .from(bookingRequest)
    .where(eq(bookingRequest.status, "pending"));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Offene Buchungsanfragen</h1>
      {pendingRequests.length === 0 && <p>Keine offenen Anfragen.</p>}
      <ul className="space-y-3">
        {pendingRequests.map((request) => (
          <li key={request.id} className="rounded border p-4">
            <p className="font-medium">{request.name}</p>
            <p className="text-sm text-slate-600">
              {request.email} · {request.phone ?? "-"}
            </p>
            <p className="text-sm">
              {request.startDate.toLocaleDateString("de-DE")} –{" "}
              {request.endDate.toLocaleDateString("de-DE")}
            </p>
            {request.message && <p className="text-sm italic">{request.message}</p>}
            <AdminRequestActions requestId={request.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
