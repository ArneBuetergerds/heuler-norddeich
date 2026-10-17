import { describe, it, expect } from "vitest";
import {
  actionLogCutoff,
  addMonths,
  adminDeletionDecision,
  berlinDay,
  bookingDeletionDate,
  invoiceDeletionDate,
  planRetention,
  requestDeletionDate,
  retentionNotice,
  actionLogRetentionNotice,
  type RetentionRequest,
} from "./retention";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function request(overrides: Partial<RetentionRequest>): RetentionRequest {
  return {
    id: 1,
    status: "pending",
    createdAt: new Date("2026-03-10T10:00:00Z"),
    decidedAt: null,
    endDate: day("2026-08-08"),
    anonymizedAt: null,
    ...overrides,
  };
}

describe("addMonths", () => {
  it.each([
    ["2026-01-15", 6, "2026-07-15"],
    // Den 31. gibt es im Februar nicht: letzter Tag des Monats.
    ["2026-08-31", 6, "2027-02-28"],
    // Schaltjahr.
    ["2027-08-31", 6, "2028-02-29"],
    // Über den Jahreswechsel.
    ["2026-09-30", 6, "2027-03-30"],
    // Rückwärts, vom Schalttag in ein Nicht-Schaltjahr.
    ["2028-02-29", -36, "2025-02-28"],
  ])("%s plus %i Monate = %s", (start, months, expected) => {
    expect(addMonths(day(start), months)).toEqual(day(expected));
  });
});

describe("berlinDay", () => {
  it("nimmt den Kalendertag nach deutscher Zeit, nicht nach UTC", () => {
    // 31.12., 23:30 UTC ist in Deutschland schon der 1.1.
    expect(berlinDay(new Date("2026-12-31T23:30:00Z"))).toEqual(day("2027-01-01"));
    expect(berlinDay(new Date("2026-12-31T22:59:00Z"))).toEqual(day("2026-12-31"));
  });
});

describe("requestDeletionDate", () => {
  it("offene Anfrage: 6 Monate nach Eingang", () => {
    expect(requestDeletionDate(request({ status: "pending" }))).toEqual(day("2026-09-10"));
  });

  it("abgelehnte oder stornierte Anfrage: 6 Monate nach der Entscheidung", () => {
    const declined = request({
      status: "declined",
      decidedAt: new Date("2026-05-20T08:00:00Z"),
    });
    expect(requestDeletionDate(declined)).toEqual(day("2026-11-20"));
  });

  it("fällt ohne Entscheidungszeitpunkt (Altbestand) auf den Eingang zurück", () => {
    expect(requestDeletionDate(request({ status: "declined" }))).toEqual(day("2026-09-10"));
  });

  it("rechnet die Entscheidung in deutscher Zeit (Monatswechsel)", () => {
    // 28.2., 23:30 UTC = 1.3. in Deutschland → Frist bis 1.9., nicht 28.8.
    const declined = request({
      status: "declined",
      decidedAt: new Date("2026-02-28T23:30:00Z"),
    });
    expect(requestDeletionDate(declined)).toEqual(day("2026-09-01"));
  });

  it("zustande gekommene Buchung: nach Ende des 3. Kalenderjahres nach der Abreise", () => {
    expect(requestDeletionDate(request({ status: "confirmed", endDate: day("2027-08-08") }))).toEqual(
      day("2031-01-01"),
    );
  });
});

describe("bookingDeletionDate", () => {
  it.each([
    // Abreise am 31.12. und am 1.1.: ein Tag Unterschied, ein Jahr Frist.
    ["2026-12-31", "2030-01-01"],
    ["2027-01-01", "2031-01-01"],
  ])("Abreise %s → löschbar ab %s", (endDate, expected) => {
    expect(bookingDeletionDate(day(endDate))).toEqual(day(expected));
  });
});

describe("invoiceDeletionDate", () => {
  it("10 Jahre ab Ende des Ausstellungsjahres", () => {
    // Ausgestellt 2027 → aufbewahren bis 31.12.2037.
    expect(invoiceDeletionDate(2027)).toEqual(day("2038-01-01"));
  });
});

describe("actionLogCutoff", () => {
  it("3 Jahre zurück, auch vom Schalttag aus", () => {
    expect(actionLogCutoff(day("2027-03-01"))).toEqual(day("2024-03-01"));
    expect(actionLogCutoff(day("2028-02-29"))).toEqual(day("2025-02-28"));
  });
});

describe("planRetention", () => {
  const today = day("2027-03-01");

  it("löscht genau ab dem Fristtag, nicht davor", () => {
    const plan = planRetention(
      {
        requests: [
          // Fällig am 28.2.2027 (31.8. + 6 Monate): gelöscht.
          request({ id: 1, createdAt: new Date("2026-08-31T10:00:00Z") }),
          // Fällig genau heute.
          request({ id: 2, createdAt: new Date("2026-09-01T10:00:00Z") }),
          // Fällig morgen: bleibt.
          request({ id: 3, createdAt: new Date("2026-09-02T10:00:00Z") }),
        ],
        invoices: [],
        manualStays: [],
      },
      today,
    );

    expect(plan.deleteRequestIds).toEqual([1, 2]);
  });

  it("anonymisiert fällige Buchungen mit aufzubewahrender Rechnung, einmal", () => {
    const plan = planRetention(
      {
        requests: [
          request({ id: 1, status: "confirmed", endDate: day("2022-07-01") }),
          request({
            id: 2,
            status: "confirmed",
            endDate: day("2022-07-01"),
            anonymizedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        ],
        invoices: [
          { id: 10, bookingRequestId: 1, year: 2022 },
          { id: 11, bookingRequestId: 2, year: 2022 },
        ],
        manualStays: [],
      },
      today,
    );

    expect(plan.anonymizeRequestIds).toEqual([1]);
    expect(plan.deleteRequestIds).toEqual([]);
    expect(plan.deleteInvoiceIds).toEqual([]);
  });

  it("löscht Rechnung und Anfrage, wenn auch die Rechnungsfrist abgelaufen ist", () => {
    const plan = planRetention(
      {
        requests: [
          request({ id: 1, status: "confirmed", endDate: day("2016-07-01") }),
          request({ id: 2, status: "confirmed", endDate: day("2017-07-01") }),
        ],
        invoices: [
          // 2016 → löschbar ab 1.1.2027.
          { id: 10, bookingRequestId: 1, year: 2016 },
          // 2017 → erst ab 1.1.2028.
          { id: 11, bookingRequestId: 2, year: 2017 },
        ],
        manualStays: [],
      },
      today,
    );

    expect(plan.deleteInvoiceIds).toEqual([10]);
    expect(plan.deleteRequestIds).toEqual([1]);
    expect(plan.anonymizeRequestIds).toEqual([2]);
  });

  it("lässt Rechnungen nicht fälliger Anfragen unberührt", () => {
    const plan = planRetention(
      {
        requests: [request({ id: 1, status: "confirmed", endDate: day("2026-07-01") })],
        invoices: [{ id: 10, bookingRequestId: 1, year: 2010 }],
        manualStays: [],
      },
      today,
    );

    expect(plan).toMatchObject({ deleteInvoiceIds: [], deleteRequestIds: [], anonymizeRequestIds: [] });
  });

  it("löscht manuell eingetragene Aufenthalte wie Buchungen", () => {
    const plan = planRetention(
      {
        requests: [],
        invoices: [],
        manualStays: [
          // Abreise 2023 → löschbar ab 1.1.2027; Abreise 2024 → erst ab 1.1.2028.
          { id: 20, endDate: day("2023-12-31") },
          { id: 21, endDate: day("2024-01-01") },
        ],
      },
      today,
    );

    expect(plan.deleteManualStayIds).toEqual([20]);
  });
});

describe("adminDeletionDecision", () => {
  const today = day("2027-03-01");

  it("verweigert eine bestätigte Buchung mit Abreise in der Zukunft, auch mit Rechnung", () => {
    const confirmed = { status: "confirmed" as const, endDate: day("2027-03-02"), anonymizedAt: null };
    expect(adminDeletionDecision(confirmed, false, today)).toBe("stay_ahead");
    expect(adminDeletionDecision(confirmed, true, today)).toBe("stay_ahead");
  });

  it("erlaubt das Löschen am Abreisetag", () => {
    const confirmed = { status: "confirmed" as const, endDate: today, anonymizedAt: null };
    expect(adminDeletionDecision(confirmed, false, today)).toBe("delete");
  });

  it.each(["pending", "declined"] as const)("löscht eine Anfrage mit Status %s", (status) => {
    expect(
      adminDeletionDecision({ status, endDate: day("2027-08-01"), anonymizedAt: null }, false, today),
    ).toBe("delete");
  });

  it("anonymisiert statt zu löschen, wenn es eine Rechnung gibt", () => {
    const past = { status: "declined" as const, endDate: day("2026-08-01"), anonymizedAt: null };
    expect(adminDeletionDecision(past, true, today)).toBe("anonymize");
    expect(
      adminDeletionDecision({ ...past, anonymizedAt: new Date("2027-01-01") }, true, today),
    ).toBe("already_anonymized");
  });
});

describe("retentionNotice", () => {
  it("nennt die Fristen aus den Konstanten", () => {
    const text = retentionNotice();
    expect(text).toContain("nach 6 Monaten ab der Absage bzw. Stornierung");
    expect(text).toContain("nach 6 Monaten ab Eingang");
    expect(text).toContain("mit Ablauf des 3. Kalenderjahres nach dem Abreisetag");
    expect(text).toContain("Rechnungen bewahren wir 10 Jahre auf");
  });
});

describe("actionLogRetentionNotice", () => {
  it("nennt die Frist aus der Konstante", () => {
    expect(actionLogRetentionNotice()).toBe(
      "Die Protokolleinträge werden 3 Jahre nach ihrer Erstellung automatisch gelöscht.",
    );
  });
});
