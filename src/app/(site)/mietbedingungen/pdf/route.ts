import { NextResponse } from "next/server";
import { renderRentalTermsPdf } from "@/lib/rentalTermsPdf";
import { RENTAL_TERMS_FILE_NAME } from "@/lib/rentalTerms";
import { withRouteErrors } from "@/lib/routeErrors";

/**
 * Die Mietbedingungen als PDF, öffentlich: dieselben Daten wie die Seite
 * /mietbedingungen. Keine personenbezogenen Daten, deshalb darf der Browser
 * (und ein Proxy) eine Stunde zwischenspeichern; danach wird neu erzeugt, ein
 * neuer Stand ist also spätestens nach einer Stunde überall angekommen.
 *
 * Bewusst dynamisch (Route Handler sind es ohne Segment-Konfiguration): Das
 * PDF entsteht in wenigen Millisekunden, und ein Fehler bei der Erzeugung
 * soll eine 500 mit Meldung geben statt einen Build-Abbruch.
 */
export const GET = withRouteErrors("GET /mietbedingungen/pdf", getRentalTermsPdf, {
  message:
    "Die Mietbedingungen konnten gerade nicht als PDF erzeugt werden. Sie stehen vollständig unter /mietbedingungen; bitte versuchen Sie den Download später erneut.",
});

async function getRentalTermsPdf() {
  const pdf = await renderRentalTermsPdf();

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${RENTAL_TERMS_FILE_NAME}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
