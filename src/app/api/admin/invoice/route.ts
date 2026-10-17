import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/adminAuth";
import {
  createInvoice,
  INVOICE_EXISTS_ERROR,
  INVOICE_NUMBER_CONFLICT_ERROR,
  NOT_CONFIRMED_ERROR,
} from "@/db/invoiceQueries";
import { parseAddress } from "@/lib/invoice";
import { withRouteErrors } from "@/lib/routeErrors";

const createSchema = z.object({
  bookingRequestId: z.coerce.number().int().positive(),
  recipientName: z.string().trim().min(1, "Name des Rechnungsempfängers fehlt"),
  // Mehrzeilig aus dem Textfeld. Mindestens Straße und Ort – eine Rechnung
  // über 250 € braucht die vollständige Anschrift des Empfängers.
  recipientAddress: z
    .string()
    .transform(parseAddress)
    .refine((zeilen) => zeilen.length >= 2, "Bitte Straße und PLZ/Ort angeben"),
});

/** Bekannte Fehler aus der Rechnungserstellung und ihr HTTP-Status. */
const FEHLER: Record<string, number> = {
  [INVOICE_EXISTS_ERROR]: 409,
  [INVOICE_NUMBER_CONFLICT_ERROR]: 409,
  [NOT_CONFIRMED_ERROR]: 409,
};

export const POST = withRouteErrors("POST /api/admin/invoice", postInvoice);

async function postInvoice(request: Request) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Anfragekörper (kein valides JSON)" },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingaben" },
      { status: 400 },
    );
  }

  try {
    const created = await createInvoice({ ...parsed.data, actor: authorized.actor });
    return NextResponse.json({ id: created.id, number: created.number }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message in FEHLER) {
      return NextResponse.json({ error: error.message }, { status: FEHLER[error.message] });
    }
    throw error;
  }
}
