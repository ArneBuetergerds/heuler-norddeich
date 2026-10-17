import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { safeError } from "./safeError";

/**
 * Unerwartete Fehler in Route-Handlern: maskiert loggen, 500 ohne Details.
 *
 * Ein ungefangener Fehler landet sonst vollständig im Server-Log – Next.js
 * loggt ihn im Produktionsbetrieb selbst (`NextNodeServer.
 * instrumentationOnRequestError` → `logError`), und zwar zusätzlich zu einem
 * `onRequestError` aus `instrumentation.ts`, nicht an dessen Stelle. Ein
 * `DrizzleQueryError` trägt in seiner Meldung `params: <Name>,<E-Mail>,…`.
 * Abhilfe gibt es deshalb nur an der Quelle: jeden Handler hiermit umhüllen.
 *
 * Fachliche Fehler (400, 404, 409 …) beantwortet der Handler wie bisher
 * selbst; hier kommt nur an, was er nicht kennt. Steuerfehler von Next.js
 * (`redirect()`, `notFound()`, dynamische APIs) werden weitergeworfen.
 *
 *   export const POST = withRouteErrors("POST /api/beispiel", async (request) => { … });
 */

/** Antworttext bei einem unerwarteten Fehler, wenn der Aufrufer keinen eigenen nennt. */
export const UNEXPECTED_ERROR_MESSAGE =
  "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es später erneut.";

export function withRouteErrors<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response>,
  { message = UNEXPECTED_ERROR_MESSAGE }: { message?: string } = {},
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      unstable_rethrow(error);
      console.error(`Unerwarteter Fehler in ${route}`, safeError(error));
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
