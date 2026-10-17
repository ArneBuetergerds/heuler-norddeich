import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { UNEXPECTED_ERROR_MESSAGE, withRouteErrors } from "./routeErrors";

/** Wie Drizzle einen fehlgeschlagenen Insert meldet: Parameter in der Meldung. */
function failedInsert(): DrizzleQueryError {
  const cause = Object.assign(new Error("Connection lost: The server closed the connection."), {
    code: "PROTOCOL_CONNECTION_LOST",
  });
  return new DrizzleQueryError(
    "insert into `booking_request` (`name`, `email`, `phone`) values (?, ?, ?)",
    ["Erika Mustermann", "gast@example.org", "0151 2345678"],
    cause,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withRouteErrors", () => {
  it("fängt unerwartete Fehler, loggt sie ohne Parameter und antwortet 500 ohne Details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withRouteErrors("POST /api/beispiel", async () => {
      throw failedInsert();
    });

    const response = await handler();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: UNEXPECTED_ERROR_MESSAGE });

    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("POST /api/beispiel");
    expect(logged).toContain("DrizzleQueryError");
    expect(logged).toContain("PROTOCOL_CONNECTION_LOST");
    for (const secret of ["Erika", "gast@example.org", "0151", "params"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("nimmt einen eigenen Antworttext", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withRouteErrors(
      "POST /api/beispiel",
      async () => {
        throw new Error("kaputt");
      },
      { message: "Bitte später erneut versuchen." },
    );

    const response = await handler();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Bitte später erneut versuchen." });
  });

  it("lässt fachliche Antworten des Handlers unverändert", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const conflict = NextResponse.json({ error: "Zeitraum belegt" }, { status: 409 });
    const handler = withRouteErrors("PATCH /api/beispiel/[id]", async (id: number) =>
      id === 1 ? conflict : NextResponse.json({ ok: true }),
    );

    expect(await handler(1)).toBe(conflict);
    const ok = await handler(2);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(error).not.toHaveBeenCalled();
  });

  it("reicht die Argumente des Handlers durch", async () => {
    const inner = vi.fn(async (request: Request, context: { params: Promise<{ id: string }> }) =>
      NextResponse.json({ id: (await context.params).id, method: request.method }),
    );
    const handler = withRouteErrors("GET /api/beispiel/[id]", inner);

    const response = await handler(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "7" }),
    });

    expect(await response.json()).toEqual({ id: "7", method: "GET" });
  });

  it("wirft redirect() und notFound() weiter, statt sie als 500 zu beantworten", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withRouteErrors("GET /api/beispiel", async () => redirect("/admin/login"))(),
    ).rejects.toThrow("NEXT_REDIRECT");
    await expect(withRouteErrors("GET /api/beispiel", async () => notFound())()).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(error).not.toHaveBeenCalled();
  });
});
