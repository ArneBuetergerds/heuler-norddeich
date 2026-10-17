import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getInvoice } from "@/db/invoiceQueries";
import { renderInvoicePdf } from "@/lib/invoicePdf";
import { withRouteErrors } from "@/lib/routeErrors";

/**
 * Liefert das PDF zu einer Rechnung – immer aus dem gespeicherten Stand
 * erzeugt, nie aus aktuellen Preisen. Dieselbe Rechnung ergibt so bei jedem
 * Abruf dasselbe Dokument.
 */
export const GET = withRouteErrors("GET /api/admin/invoice/[id]", getInvoicePdf);

async function getInvoicePdf(request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const rechnung = await getInvoice(id);
  if (!rechnung) {
    return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
  }

  const pdf = await renderInvoicePdf(rechnung.snapshot);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung-${rechnung.number}.pdf"`,
      // Rechnungen enthalten personenbezogene Daten – nicht zwischenspeichern.
      "Cache-Control": "private, no-store",
    },
  });
}
