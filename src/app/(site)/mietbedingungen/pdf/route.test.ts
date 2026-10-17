import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock wird nach oben gezogen; die Attrappe muss es mit ihm.
const pdf = vi.hoisted(() => ({ renderRentalTermsPdf: vi.fn() }));

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration). Die
// echten Module über relative Pfade; das PDF entsteht echt (pdf-lib), außer
// im Fehlerfall.
vi.mock("@/lib/rentalTerms", () => import("../../../../lib/rentalTerms"));
vi.mock("@/lib/rentalTermsPdf", () => pdf);
vi.mock("@/lib/safeError", () => import("../../../../lib/safeError"));
vi.mock("@/lib/routeErrors", () => import("../../../../lib/routeErrors"));

import { GET } from "./route";
import { renderRentalTermsPdf } from "../../../../lib/rentalTermsPdf";

afterEach(() => {
  vi.restoreAllMocks();
  pdf.renderRentalTermsPdf.mockReset();
});

describe("GET /mietbedingungen/pdf", () => {
  it("liefert das PDF als Download mit festem Dateinamen und Cache-Header", async () => {
    pdf.renderRentalTermsPdf.mockImplementation(renderRentalTermsPdf);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Mietbedingungen-Heuler.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("antwortet bei einem Fehler mit 500 und Verweis auf die Seite", async () => {
    pdf.renderRentalTermsPdf.mockRejectedValue(new Error("Schrift fehlt"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("/mietbedingungen");
  });
});
