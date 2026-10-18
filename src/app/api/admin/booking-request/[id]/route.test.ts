import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingRequest, Invoice } from "../../../../../db/schema";
import type { BookingAddress } from "../../../../../db/adminQueries";

// vi.mock wird nach oben gezogen; die Attrappen müssen es mit ihm.
const state = vi.hoisted(() => ({
  request: undefined as BookingRequest | undefined,
}));
const adminQueries = vi.hoisted(() => ({
  confirmBookingRequest: vi.fn(),
  declineBookingRequest: vi.fn(),
}));
const invoiceQueries = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  getInvoiceForBookingRequest: vi.fn(),
  INVOICE_EXISTS_ERROR: "Für diese Buchung gibt es bereits eine Rechnung",
}));
const mails = vi.hoisted(() => ({
  sendGuestConfirmation: vi.fn(),
  sendGuestDecline: vi.fn(),
}));
const pdf = vi.hoisted(() => ({ renderInvoicePdf: vi.fn() }));
const termsPdf = vi.hoisted(() => ({ renderRentalTermsPdf: vi.fn() }));

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration). Die
// echten Module über relative Pfade; Datenbank, Anmeldung, Rechnungsablage
// und Mailversand sind Attrappen. Das PDF entsteht echt (pdf-lib).
vi.mock("@/db/schema", () => import("../../../../../db/schema"));
vi.mock("@/lib/validation", () => import("../../../../../lib/validation"));
vi.mock("@/lib/invoice", () => import("../../../../../lib/invoice"));
vi.mock("@/lib/invoicePdf", () => pdf);
vi.mock("@/lib/rentalTermsPdf", () => termsPdf);
vi.mock("@/lib/rentalTerms", () => import("../../../../../lib/rentalTerms"));
vi.mock("@/lib/safeError", () => import("../../../../../lib/safeError"));
vi.mock("@/lib/routeErrors", () => import("../../../../../lib/routeErrors"));
vi.mock("@/lib/retention", () => ({ berlinDay: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({
  authorizeAdmin: vi.fn(async () => ({ actor: "admin@example.invalid" })),
}));
vi.mock("@/lib/email", () => mails);
vi.mock("@/db/client", () => ({
  db: { query: { bookingRequest: { findFirst: async () => state.request } } },
}));
vi.mock("@/db/adminQueries", async () => ({
  ...(await import("../../../../../db/adminQueries")),
  ...adminQueries,
}));
vi.mock("@/db/invoiceQueries", () => invoiceQueries);
vi.mock("@/db/retentionQueries", () => ({
  deleteBookingRequest: vi.fn(),
  REQUEST_ALREADY_ANONYMIZED_ERROR: "anonymisiert",
  REQUEST_NOT_FOUND_ERROR: "nicht gefunden",
  STAY_AHEAD_ERROR: "Abreise in der Zukunft",
}));

import { PATCH } from "./route";
import { NOT_PENDING_ERROR } from "../../../../../db/adminQueries";
import { buildInvoiceSnapshot, formatInvoiceNumber } from "../../../../../lib/invoice";
import { renderInvoicePdf } from "../../../../../lib/invoicePdf";
import { renderRentalTermsPdf } from "../../../../../lib/rentalTermsPdf";
import { buildGuestConfirmation, type InvoiceForMail } from "../../../../../lib/email";

const PENDING: BookingRequest = {
  id: 7,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
  country: null,
  startDate: new Date("2027-08-29"),
  endDate: new Date("2027-09-05"),
  message: null,
  guests: 2,
  guestsUnder14: 0,
  linens: 0,
  towels: 0,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
  decidedAt: null,
  anonymizedAt: null,
  termsAcceptedAt: null,
  termsVersion: null,
};

const OHNE_ANSCHRIFT: Partial<BookingRequest> = {
  street: null,
  postalCode: null,
  city: null,
  country: null,
};

function patch(body: unknown, id = "7"): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/admin/booking-request/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

/** Rechnung, wie createInvoice sie aus den übergebenen Empfängerdaten erzeugen würde. */
function invoiceFrom(input: {
  bookingRequestId: number;
  recipientName: string;
  recipientAddress: string[];
}): Invoice {
  const number = formatInvoiceNumber(2027, 1);
  return {
    id: 100,
    year: 2027,
    sequence: 1,
    number,
    bookingRequestId: input.bookingRequestId,
    snapshot: buildInvoiceSnapshot({
      request: state.request!,
      number,
      issuedAt: new Date("2027-02-10"),
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      bankDetails: null,
    }),
    createdAt: new Date("2027-02-10"),
  };
}

/** Zweites Argument von sendGuestConfirmation: die Rechnung für den Anhang. */
function mailedInvoice(): InvoiceForMail | undefined {
  expect(mails.sendGuestConfirmation).toHaveBeenCalledTimes(1);
  return mails.sendGuestConfirmation.mock.calls[0][1] as InvoiceForMail | undefined;
}

/** Drittes Argument von sendGuestConfirmation: das Mietbedingungen-PDF. */
function mailedRentalTerms(): Uint8Array | undefined {
  expect(mails.sendGuestConfirmation).toHaveBeenCalledTimes(1);
  return mails.sendGuestConfirmation.mock.calls[0][2] as Uint8Array | undefined;
}

beforeEach(() => {
  state.request = { ...PENDING };
  // Bestätigen wie confirmBookingRequest: Status setzen, Anschrift aus dem
  // Dialog an der Anfrage speichern.
  adminQueries.confirmBookingRequest.mockImplementation(
    async (_db: unknown, _id: number, _actor: string, address?: BookingAddress) => {
      if (state.request?.status !== "pending") throw new Error(NOT_PENDING_ERROR);
      state.request = {
        ...state.request,
        status: "confirmed",
        ...(address ? { ...address, country: address.country || null } : {}),
      };
    },
  );
  invoiceQueries.createInvoice.mockImplementation(async (input) => invoiceFrom(input));
  pdf.renderInvoicePdf.mockImplementation(renderInvoicePdf);
  termsPdf.renderRentalTermsPdf.mockImplementation(renderRentalTermsPdf);
  mails.sendGuestConfirmation.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/booking-request/[id] – Bestätigen mit Rechnung", () => {
  it("erstellt die Rechnung aus Name und Anschrift und hängt sie als PDF an die Bestätigung", async () => {
    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      invoice: { id: 100, number: "RE-2027-0001" },
    });
    expect(invoiceQueries.createInvoice).toHaveBeenCalledWith({
      bookingRequestId: 7,
      recipientName: "Erika Musterfrau",
      recipientAddress: ["Musterweg 1", "12345 Musterstadt"],
      actor: "admin@example.invalid",
    });

    const invoice = mailedInvoice();
    expect(invoice?.number).toBe("RE-2027-0001");
    expect(new TextDecoder().decode(invoice!.pdf.slice(0, 5))).toBe("%PDF-");

    const rentalTerms = mailedRentalTerms();
    expect(new TextDecoder().decode(rentalTerms!.slice(0, 5))).toBe("%PDF-");

    // Die Mail, die daraus entsteht: Rechnung mit Nummer im Namen und
    // Mietbedingungen als zweites PDF.
    const mail = buildGuestConfirmation(state.request!, invoice, rentalTerms);
    expect(mail.attachments).toEqual([
      {
        filename: "Rechnung-RE-2027-0001.pdf",
        content: Buffer.from(invoice!.pdf),
        contentType: "application/pdf",
      },
      {
        filename: "Mietbedingungen-Heuler.pdf",
        content: Buffer.from(rentalTerms!),
        contentType: "application/pdf",
      },
    ]);
    expect(mail.text).toContain("Anreise ab ca. 14 Uhr, Abreise bis 10 Uhr.");
  });

  it("bestätigt ohne Anschrift nichts: 400 mit Kennzeichen für den Dialog", async () => {
    state.request = { ...PENDING, ...OHNE_ANSCHRIFT };

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("address_required");
    expect(body.error).toContain("Anschrift");
    expect(adminQueries.confirmBookingRequest).not.toHaveBeenCalled();
    expect(invoiceQueries.createInvoice).not.toHaveBeenCalled();
    expect(mails.sendGuestConfirmation).not.toHaveBeenCalled();
    expect(state.request.status).toBe("pending");
  });

  it("speichert die Anschrift aus dem Dialog und stellt die Rechnung darauf aus", async () => {
    state.request = { ...PENDING, ...OHNE_ANSCHRIFT };
    const address = { street: "Hauptstraße 3", postalCode: "1010", city: "Wien", country: "Österreich" };

    const response = await PATCH(...patch({ action: "confirm", address }));

    expect(response.status).toBe(200);
    expect(adminQueries.confirmBookingRequest).toHaveBeenCalledWith(
      expect.anything(),
      7,
      "admin@example.invalid",
      address,
    );
    expect(state.request).toMatchObject({ status: "confirmed", ...address });
    expect(invoiceQueries.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ recipientAddress: ["Hauptstraße 3", "1010 Wien", "Österreich"] }),
    );
    expect(mailedInvoice()?.number).toBe("RE-2027-0001");
  });

  it("lehnt eine ungültige Anschrift aus dem Dialog mit Meldung am Feld ab", async () => {
    state.request = { ...PENDING, ...OHNE_ANSCHRIFT };

    const response = await PATCH(
      ...patch({ action: "confirm", address: { street: "Musterweg 1", postalCode: "", city: "Musterstadt" } }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Bitte die Postleitzahl angeben",
      field: "postalCode",
    });
    expect(adminQueries.confirmBookingRequest).not.toHaveBeenCalled();
  });

  it("schickt die Bestätigung ohne Anhang und warnt, wenn die Rechnung scheitert", async () => {
    invoiceQueries.createInvoice.mockRejectedValue(new Error("Verbindung verloren"));

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      invoice: unknown;
      warning: string;
      warningCode: string;
    };
    expect(body.ok).toBe(true);
    expect(body.invoice).toBeNull();
    expect(body.warning).toContain("Rechnung im Detaildialog");
    expect(body.warningCode).toBe("invoice_failed");
    expect(state.request?.status).toBe("confirmed");
    expect(mailedInvoice()).toBeUndefined();
  });

  it("schickt die Bestätigung ohne Anhang und warnt, wenn das PDF scheitert – die Rechnung bleibt", async () => {
    pdf.renderInvoicePdf.mockRejectedValue(new Error("Schrift fehlt"));

    const response = await PATCH(...patch({ action: "confirm" }));

    const body = (await response.json()) as {
      invoice: { number: string };
      warning: string;
      warningCode: string;
    };
    expect(response.status).toBe(200);
    expect(body.invoice.number).toBe("RE-2027-0001");
    expect(body.warning).toContain("RE-2027-0001");
    expect(body.warningCode).toBe("attachment_failed");
    expect(mailedInvoice()).toBeUndefined();
  });

  it("schickt die Bestätigung mit Rechnung, aber ohne Mietbedingungen und warnt, wenn deren PDF scheitert", async () => {
    termsPdf.renderRentalTermsPdf.mockRejectedValue(new Error("Schrift fehlt"));

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invoice: { number: string };
      warning: string;
      warningCode: string;
      rentalTermsMissing: boolean;
    };
    expect(body.invoice.number).toBe("RE-2027-0001");
    expect(body.warningCode).toBe("terms_attachment_failed");
    expect(body.warning).toContain("Mietbedingungen");
    expect(body.warning).toContain("https://norddeich-heuler.de/mietbedingungen/pdf");
    expect(body.rentalTermsMissing).toBe(true);
    expect(state.request?.status).toBe("confirmed");
    expect(mailedInvoice()?.number).toBe("RE-2027-0001");
    expect(mailedRentalTerms()).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("behält die Rechnungswarnung und ergänzt sie, wenn auch die Mietbedingungen fehlen", async () => {
    pdf.renderInvoicePdf.mockRejectedValue(new Error("Schrift fehlt"));
    termsPdf.renderRentalTermsPdf.mockRejectedValue(new Error("Schrift fehlt"));

    const response = await PATCH(...patch({ action: "confirm" }));

    const body = (await response.json()) as { warning: string; warningCode: string; rentalTermsMissing: boolean };
    expect(body.warningCode).toBe("attachment_failed");
    expect(body.warning).toContain("RE-2027-0001");
    expect(body.warning).toContain("Auch die Mietbedingungen fehlen");
    expect(body.rentalTermsMissing).toBe(true);
    expect(mailedInvoice()).toBeUndefined();
    expect(mailedRentalTerms()).toBeUndefined();
  });

  it("nennt die Mietbedingungen in der Warnung, wenn die Mail scheitert", async () => {
    mails.sendGuestConfirmation.mockRejectedValue(new Error("SMTP weg"));

    const response = await PATCH(...patch({ action: "confirm" }));

    const body = (await response.json()) as { warning: string; warningCode: string };
    expect(body.warningCode).toBe("mail_failed");
    expect(body.warning).toContain("https://norddeich-heuler.de/mietbedingungen/pdf");
  });

  it("hängt eine schon vorhandene Rechnung an, statt eine zweite zu erstellen", async () => {
    invoiceQueries.createInvoice.mockRejectedValue(new Error(invoiceQueries.INVOICE_EXISTS_ERROR));
    invoiceQueries.getInvoiceForBookingRequest.mockImplementation(async () =>
      invoiceFrom({ bookingRequestId: 7, recipientName: "Erika Musterfrau", recipientAddress: ["Musterweg 1", "12345 Musterstadt"] }),
    );

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(await response.json()).toEqual({ ok: true, invoice: { id: 100, number: "RE-2027-0001" } });
    expect(invoiceQueries.getInvoiceForBookingRequest).toHaveBeenCalledWith(7);
    expect(mailedInvoice()?.number).toBe("RE-2027-0001");
  });

  it("behält Bestätigung und Rechnung und warnt, wenn die Mail scheitert", async () => {
    mails.sendGuestConfirmation.mockRejectedValue(new Error("SMTP weg"));

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      invoice: { id: number; number: string };
      warning: string;
      warningCode: string;
    };
    expect(body.ok).toBe(true);
    expect(body.invoice).toEqual({ id: 100, number: "RE-2027-0001" });
    expect(body.warningCode).toBe("mail_failed");
    expect(body.warning).toContain("RE-2027-0001");
    expect(body.warning).toContain("E-Mail an den Gast konnte nicht verschickt werden");
    expect(state.request?.status).toBe("confirmed");
    expect(console.error).toHaveBeenCalled();
  });

  it("meldet den Mailfehler auch, wenn vorher schon das PDF gescheitert ist", async () => {
    pdf.renderInvoicePdf.mockRejectedValue(new Error("Schrift fehlt"));
    mails.sendGuestConfirmation.mockRejectedValue(new Error("SMTP weg"));

    const response = await PATCH(...patch({ action: "confirm" }));

    const body = (await response.json()) as { invoice: { number: string }; warning: string; warningCode: string };
    expect(body.invoice.number).toBe("RE-2027-0001");
    expect(body.warningCode).toBe("mail_failed");
    expect(body.warning).toContain("E-Mail an den Gast konnte nicht verschickt werden");
  });

  it("warnt, wenn Rechnung und Mail scheitern – die Bestätigung bleibt", async () => {
    invoiceQueries.createInvoice.mockRejectedValue(new Error("Verbindung verloren"));
    mails.sendGuestConfirmation.mockRejectedValue(
      new Error("SMTP-Zugangsdaten sind nicht konfiguriert"),
    );

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      invoice: unknown;
      warning: string;
      warningCode: string;
    };
    expect(body.ok).toBe(true);
    expect(body.invoice).toBeNull();
    expect(body.warningCode).toBe("invoice_and_mail_failed");
    expect(body.warning).toContain("Rechnung konnte nicht erstellt");
    expect(body.warning).toContain("E-Mail an den Gast nicht verschickt");
    expect(state.request?.status).toBe("confirmed");
    expect(mailedInvoice()).toBeUndefined();
  });

  it("erstellt für manuelle Buchungen weder Rechnung noch Mail", async () => {
    state.request = { ...PENDING, source: "manual" };

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(await response.json()).toEqual({ ok: true, invoice: null });
    expect(invoiceQueries.createInvoice).not.toHaveBeenCalled();
    expect(mails.sendGuestConfirmation).not.toHaveBeenCalled();
    expect(termsPdf.renderRentalTermsPdf).not.toHaveBeenCalled();
  });

  it("meldet bei einer nicht mehr offenen Anfrage 409, nicht die fehlende Anschrift", async () => {
    state.request = { ...PENDING, ...OHNE_ANSCHRIFT, status: "confirmed" };

    const response = await PATCH(...patch({ action: "confirm" }));

    expect(response.status).toBe(409);
    expect(invoiceQueries.createInvoice).not.toHaveBeenCalled();
  });

  it("lehnt weiterhin ohne Rechnung ab und schickt die Absage", async () => {
    const response = await PATCH(...patch({ action: "decline", reason: "Belegt" }));

    expect(await response.json()).toEqual({ ok: true });
    expect(adminQueries.declineBookingRequest).toHaveBeenCalled();
    expect(mails.sendGuestDecline).toHaveBeenCalledWith(state.request, "Belegt");
    expect(invoiceQueries.createInvoice).not.toHaveBeenCalled();
  });
});
