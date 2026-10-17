import { describe, it, expect } from "vitest";
import {
  actionLogCutoff,
  addDays,
  addMonths,
  adminDeletionDecision,
  berlinDay,
  bookingDeletionDate,
  INTERNAL_RETENTION_MONTHS,
  internalStayDeletionDate,
  invoiceDeletionDate,
  planRetention,
  previewRetention,
  requestDeletionDate,
  retentionOverview,
  retentionPrefilter,
  retentionNotice,
  actionLogRetentionNotice,
  type PreviewRequest,
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
        internalStays: [],
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
        internalStays: [],
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
        internalStays: [],
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
        internalStays: [],
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
        internalStays: [],
      },
      today,
    );

    expect(plan.deleteManualStayIds).toEqual([20]);
  });
});

describe("internalStayDeletionDate", () => {
  it("liegt genau INTERNAL_RETENTION_MONTHS nach dem Abreisetag", () => {
    expect(INTERNAL_RETENTION_MONTHS).toBe(6);
    expect(internalStayDeletionDate(day("2026-08-15"))).toEqual(day("2027-02-15"));
  });

  it("nimmt am Monatsende den letzten Tag des Zielmonats", () => {
    expect(internalStayDeletionDate(day("2026-08-31"))).toEqual(day("2027-02-28"));
    expect(internalStayDeletionDate(day("2027-08-31"))).toEqual(day("2028-02-29"));
  });
});

describe("planRetention: interne Belegungen", () => {
  const plan = (today: Date) =>
    planRetention(
      {
        requests: [],
        invoices: [],
        manualStays: [],
        internalStays: [
          { id: 30, endDate: day("2026-08-15") },
          { id: 31, endDate: day("2026-08-31") },
        ],
      },
      today,
    );

  it("löscht genau ab dem Tag 6 Monate nach der Abreise, nicht einen Tag früher", () => {
    expect(plan(day("2027-02-14")).deleteInternalStayIds).toEqual([]);
    expect(plan(day("2027-02-15")).deleteInternalStayIds).toEqual([30]);
  });

  it("rechnet bei Abreise am Monatsletzten bis zum Ende des Februars", () => {
    expect(plan(day("2027-02-27")).deleteInternalStayIds).toEqual([30]);
    expect(plan(day("2027-02-28")).deleteInternalStayIds).toEqual([30, 31]);
  });

  it("lässt Altbestand manueller Aufenthalte bei der Buchungsfrist", () => {
    const result = planRetention(
      {
        requests: [],
        invoices: [],
        // Abreise 2026 → löschbar erst ab 1.1.2030, nicht nach 6 Monaten.
        manualStays: [{ id: 40, endDate: day("2026-08-15") }],
        internalStays: [],
      },
      day("2027-03-01"),
    );

    expect(result.deleteManualStayIds).toEqual([]);
    expect(result.deleteInternalStayIds).toEqual([]);
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
    expect(text).toContain(
      "Interne Belegungen (Eigennutzung, Aufenthalte von Familie und Freunden) löschen wir nach 6 Monaten ab dem Abreisetag.",
    );
  });
});

describe("actionLogRetentionNotice", () => {
  it("nennt die Frist aus der Konstante", () => {
    expect(actionLogRetentionNotice()).toBe(
      "Die Protokolleinträge werden 3 Jahre nach ihrer Erstellung automatisch gelöscht.",
    );
  });
});

describe("retentionPrefilter", () => {
  // Jeder Stichtag über zwei Jahre (mit Schaltjahr 2028), jeder Kandidatentag
  // davor: Was `planRetention` am Stichtag anfasst, muss unter der Grenze liegen.
  const refs = Array.from({ length: 2 * 366 }, (_, index) => addDays(day("2027-01-01"), index));

  it("enthält jede am Stichtag fällige offene oder abgelehnte Anfrage, auch an der Tagesgrenze", () => {
    for (const ref of refs) {
      const bounds = retentionPrefilter(ref);
      for (let offset = 170; offset <= 200; offset++) {
        // 22:30 UTC ist im Sommer schon 0:30 Uhr des Folgetags nach deutscher
        // Zeit, im Winter 23:30 Uhr desselben Tags; 12 Uhr UTC ist eindeutig.
        for (const instant of [
          new Date(addDays(ref, -offset).getTime() + 22.5 * 3600 * 1000),
          new Date(addDays(ref, -offset).getTime() + 12 * 3600 * 1000),
        ]) {
          const pending = request({ status: "pending", createdAt: instant });
          if (requestDeletionDate(pending) <= ref) {
            expect(instant < bounds.pendingCreatedBefore).toBe(true);
          }
          const declined = request({ status: "declined", decidedAt: instant });
          if (requestDeletionDate(declined) <= ref) {
            expect(instant < bounds.declinedBefore).toBe(true);
          }
        }
      }
    }
  });

  it("enthält jede am Stichtag fällige interne Belegung und Buchung", () => {
    for (const ref of refs) {
      const bounds = retentionPrefilter(ref);
      for (let offset = 170; offset <= 200; offset++) {
        const endDate = addDays(ref, -offset);
        if (internalStayDeletionDate(endDate) <= ref) {
          expect(endDate < bounds.internalEndBefore).toBe(true);
        }
      }
      for (const endDate of [day(`${ref.getUTCFullYear() - 4}-12-31`), day(`${ref.getUTCFullYear() - 3}-01-01`)]) {
        expect(endDate < bounds.bookingEndBefore).toBe(bookingDeletionDate(endDate) <= ref);
      }
    }
  });

  it("schneidet deutlich nicht Fälliges ab", () => {
    const bounds = retentionPrefilter(day("2027-03-01"));
    expect(bounds).toEqual({
      pendingCreatedBefore: day("2026-09-08"),
      declinedBefore: day("2026-09-08"),
      bookingEndBefore: day("2024-01-01"),
      internalEndBefore: day("2026-09-08"),
    });
  });
});

describe("previewRetention", () => {
  const today = day("2027-03-01");
  const empty = { requests: [], invoices: [], legacyStays: [], internalStays: [] };

  function previewRequest(overrides: Partial<PreviewRequest>): PreviewRequest {
    return { ...request({}), name: "Gast", startDate: day("2026-08-01"), ...overrides };
  }

  it("nimmt genau Tag 90 noch mit, Tag 91 nicht", () => {
    const internalStays = [
      // Abreise 29.11.2026 → löschbar 29.5.2027 = heute + 89.
      { id: 1, startDate: day("2026-11-20"), endDate: day("2026-11-29"), label: "a" },
      // → 30.5.2027 = heute + 90.
      { id: 2, startDate: day("2026-11-20"), endDate: day("2026-11-30"), label: "b" },
      // → 31.5.2027 = heute + 91.
      { id: 3, startDate: day("2026-11-20"), endDate: day("2026-12-01"), label: "c" },
    ];

    const entries = previewRetention({ ...empty, internalStays }, today);

    expect(entries.map((entry) => entry.id)).toEqual([1, 2]);
    expect(entries[1].date).toEqual(addDays(today, 90));
  });

  it("führt heute Fälliges und Überfälliges mit dem heutigen Datum", () => {
    const requests = [
      // Fällig heute.
      previewRequest({ id: 1, createdAt: new Date("2026-09-01T10:00:00Z") }),
      // Seit einer Woche fällig, der Lauf steht noch aus.
      previewRequest({ id: 2, createdAt: new Date("2026-08-20T10:00:00Z") }),
      // Fällig morgen.
      previewRequest({ id: 3, createdAt: new Date("2026-09-02T10:00:00Z") }),
    ];

    const entries = previewRetention({ ...empty, requests }, today);

    expect(entries.map((entry) => [entry.id, entry.date])).toEqual([
      [1, today],
      [2, today],
      [3, day("2027-03-02")],
    ]);
    expect(entries.every((entry) => entry.kind === "delete_request")).toBe(true);
  });

  it("anonymisiert bei Rechnung und löscht später beides; endet die Rechnungsfrist zuerst, sofort beides", () => {
    const requests = [
      // Abreise 2023 → fällig 1.1.2027; Rechnung 2023 → 1.1.2034: nur anonymisieren.
      previewRequest({ id: 1, status: "confirmed", endDate: day("2023-07-01") }),
      // Schon anonymisiert, Rechnung 2016 → 1.1.2027 abgelaufen: beides löschen, nicht noch einmal anonymisieren.
      previewRequest({
        id: 2,
        status: "confirmed",
        endDate: day("2016-07-01"),
        anonymizedAt: new Date("2020-01-01T00:00:00Z"),
      }),
      // Nie anonymisiert, Rechnung schon abgelaufen: beides löschen, kein Anonymisieren davor.
      previewRequest({ id: 3, status: "confirmed", endDate: day("2016-08-01") }),
    ];
    const invoices = [
      { id: 10, bookingRequestId: 1, year: 2023 },
      { id: 20, bookingRequestId: 2, year: 2016 },
      { id: 30, bookingRequestId: 3, year: 2016 },
    ];

    const entries = previewRetention({ ...empty, requests, invoices }, today);

    expect(entries.map((entry) => [entry.id, entry.kind])).toEqual([
      [1, "anonymize_request"],
      [2, "delete_invoice_and_request"],
      [3, "delete_invoice_and_request"],
    ]);
  });

  it("zeigt dasselbe für heute, was planRetention heute tut", () => {
    const requests = [
      previewRequest({ id: 1, createdAt: new Date("2026-09-01T10:00:00Z") }),
      previewRequest({ id: 2, status: "confirmed", endDate: day("2022-07-01") }),
      previewRequest({ id: 3, status: "confirmed", endDate: day("2016-07-01") }),
    ];
    const invoices = [
      { id: 20, bookingRequestId: 2, year: 2022 },
      { id: 30, bookingRequestId: 3, year: 2016 },
    ];
    const legacyStays = [{ id: 40, startDate: day("2022-04-20"), endDate: day("2022-05-01"), label: "x" }];
    const internalStays = [{ id: 50, startDate: day("2026-08-20"), endDate: day("2026-09-01"), label: "y" }];

    const entries = previewRetention({ requests, invoices, legacyStays, internalStays }, today);
    const plan = planRetention(
      { requests, invoices, manualStays: legacyStays, internalStays },
      today,
    );

    const ids = (kind: string) => entries.filter((entry) => entry.kind === kind).map((entry) => entry.id);
    expect(ids("delete_request")).toEqual([1]);
    expect([...ids("delete_request"), ...ids("delete_invoice_and_request")]).toEqual(plan.deleteRequestIds);
    expect(ids("anonymize_request")).toEqual(plan.anonymizeRequestIds);
    expect(ids("delete_legacy_stay")).toEqual(plan.deleteManualStayIds);
    expect(ids("delete_internal_stay")).toEqual(plan.deleteInternalStayIds);
  });

  it("liefert nichts, wenn in 90 Tagen nichts ansteht", () => {
    const requests = [previewRequest({ id: 1, createdAt: new Date("2027-02-20T10:00:00Z") })];

    expect(previewRetention({ ...empty, requests }, today)).toEqual([]);
  });
});

describe("retentionOverview", () => {
  it("nennt jede Datenart mit Frist, Beginn und Wirkung aus den Konstanten", () => {
    expect(
      retentionOverview().map(({ dataType, period, start, effect }) => [dataType, period, start, effect]),
    ).toEqual([
      ["Anfragen ohne Reaktion", "6 Monate", "ab Eingang", "delete"],
      ["Abgelehnte oder stornierte Anfragen", "6 Monate", "ab Absage bzw. Stornierung", "delete"],
      [
        "Buchungen ohne Rechnung (online und telefonisch eingetragen)",
        "3 Kalenderjahre",
        "ab Ende des Jahres der Abreise",
        "delete",
      ],
      [
        "Buchungen mit Rechnung (online und telefonisch eingetragen)",
        "3 Kalenderjahre",
        "ab Ende des Jahres der Abreise",
        "anonymize",
      ],
      ["Rechnungen", "10 Jahre", "ab Ende des Jahres der Ausstellung", "delete"],
      ["Interne Belegungen", `${INTERNAL_RETENTION_MONTHS} Monate`, "ab Abreisetag", "delete"],
      [
        "Altbestand: früher eingetragene Aufenthalte nur mit Gastname",
        "3 Kalenderjahre",
        "ab Ende des Jahres der Abreise",
        "delete",
      ],
      ["Protokoll administrativer Aktionen", "3 Jahre", "ab Eintrag", "delete"],
    ]);
  });
});
