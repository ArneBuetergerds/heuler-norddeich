import { describe, it, expect } from "vitest";
import { rangesOverlap } from "./dateRange";
import { monthWindow } from "./month";
import {
  splitOccupancy,
  deriveConflict,
  spanOf,
  type Occupancy,
  type OccupancyRow,
} from "./occupancy";

function row(overrides: Partial<OccupancyRow> & { id: number }): OccupancyRow {
  return {
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-08"),
    note: null,
    guestName: null,
    bookingRequestId: null,
    requestName: null,
    ...overrides,
  };
}

describe("splitOccupancy", () => {
  it("erkennt eine bestätigte Anfrage als Belegung mit dem Namen aus der Anfrage", () => {
    const rows = [row({ id: 1, bookingRequestId: 5, requestName: "Erika Muster" })];

    const { stays, maintenance } = splitOccupancy(rows);

    expect(maintenance).toHaveLength(0);
    expect(stays).toEqual([
      {
        id: 1,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-08"),
        guestName: "Erika Muster",
        bookingRequestId: 5,
      },
    ]);
  });

  it("erkennt einen manuell eingetragenen Aufenthalt als Belegung ohne Anfrage", () => {
    const rows = [row({ id: 2, guestName: "Familie Janssen" })];

    const { stays } = splitOccupancy(rows);

    expect(stays[0].guestName).toBe("Familie Janssen");
    expect(stays[0].bookingRequestId).toBeNull();
  });

  it("erkennt einen Eintrag ohne Gast als reinen Sperrzeitraum", () => {
    const rows = [row({ id: 3, note: "Wartung Heizung" })];

    const { stays, maintenance } = splitOccupancy(rows);

    expect(stays).toHaveLength(0);
    expect(maintenance).toEqual([
      {
        id: 3,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-08"),
        note: "Wartung Heizung",
      },
    ]);
  });
});

describe("deriveConflict", () => {
  const request = {
    id: 1,
    startDate: new Date("2026-08-05"),
    endDate: new Date("2026-08-12"),
  };
  const empty = { stays: [], maintenance: [] };

  it("meldet keinen Konflikt für einen freien Zeitraum", () => {
    const result = deriveConflict(request, empty, []);

    expect(result).toBeNull();
  });

  it("meldet eine überschneidende Belegung", () => {
    const occupancy = {
      stays: [
        {
          id: 9,
          startDate: new Date("2026-08-10"),
          endDate: new Date("2026-08-15"),
          guestName: "Peter Wilkens",
          bookingRequestId: null,
        },
      ],
      maintenance: [],
    };

    const result = deriveConflict(request, occupancy, []);

    expect(result).toBe("stay");
  });

  it("gewichtet eine Belegung höher als einen gleichzeitig überschneidenden Sperrzeitraum", () => {
    const occupancy = {
      stays: [
        {
          id: 9,
          startDate: new Date("2026-08-10"),
          endDate: new Date("2026-08-15"),
          guestName: "Peter Wilkens",
          bookingRequestId: null,
        },
      ],
      maintenance: [
        { id: 8, startDate: new Date("2026-08-06"), endDate: new Date("2026-08-07"), note: null },
      ],
    };

    const result = deriveConflict(request, occupancy, []);

    expect(result).toBe("stay");
  });

  it("meldet eine konkurrierende offene Anfrage", () => {
    const other = {
      id: 2,
      startDate: new Date("2026-08-08"),
      endDate: new Date("2026-08-14"),
    };

    const result = deriveConflict(request, empty, [other]);

    expect(result).toBe("pending");
  });

  it("wertet die Anfrage nicht als Konflikt mit sich selbst", () => {
    const result = deriveConflict(request, empty, [request]);

    expect(result).toBeNull();
  });

  it("meldet keinen Konflikt, wenn der Abreisetag der Anreisetag des nächsten Gasts ist", () => {
    const occupancy = {
      stays: [
        {
          id: 9,
          startDate: new Date("2026-08-12"),
          endDate: new Date("2026-08-19"),
          guestName: "Peter Wilkens",
          bookingRequestId: null,
        },
      ],
      maintenance: [],
    };

    const result = deriveConflict(request, occupancy, []);

    expect(result).toBeNull();
  });
});

describe("spanOf", () => {
  it("liefert ohne Zeiträume nichts – dann braucht es keine Abfrage", () => {
    expect(spanOf([])).toBeNull();
  });

  it("reicht vom frühesten Start bis zum spätesten Ende", () => {
    const span = spanOf([
      { startDate: new Date("2026-12-20"), endDate: new Date("2027-01-02") },
      { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-12") },
      { startDate: new Date("2026-10-01"), endDate: new Date("2026-10-03") },
    ]);

    expect(span).toEqual({
      startDate: new Date("2026-08-05"),
      endDate: new Date("2027-01-02"),
    });
  });
});

describe("Konfliktwarnung bei monatsweiser Belegung", () => {
  // Was die Abfrage mit overlapsRange(start, end) liefern würde.
  function loadRange(all: Occupancy, start: Date, end: Date): Occupancy {
    const inRange = (entry: { startDate: Date; endDate: Date }) =>
      rangesOverlap(entry.startDate, entry.endDate, start, end);
    return { stays: all.stays.filter(inRange), maintenance: all.maintenance.filter(inRange) };
  }

  const all: Occupancy = {
    stays: [
      {
        id: 9,
        startDate: new Date("2026-12-27"),
        endDate: new Date("2027-01-03"),
        guestName: "Peter Wilkens",
        bookingRequestId: null,
      },
    ],
    maintenance: [
      { id: 8, startDate: new Date("2026-08-10"), endDate: new Date("2026-08-12"), note: null },
    ],
  };
  const pending = [
    { id: 1, startDate: new Date("2026-12-30"), endDate: new Date("2027-01-05") },
    { id: 2, startDate: new Date("2026-08-09"), endDate: new Date("2026-08-11") },
  ];
  const shown = monthWindow(new Date("2026-10-01"));

  it("erkennt Konflikte außerhalb des angezeigten Monats über das Fenster der offenen Anfragen", () => {
    const span = spanOf(pending)!;
    const occupancy = loadRange(all, span.startDate, span.endDate);

    expect(deriveConflict(pending[0], occupancy, pending)).toBe("stay");
    expect(deriveConflict(pending[1], occupancy, pending)).toBe("maintenance");
  });

  it("würde sie mit der Belegung des angezeigten Monats übersehen", () => {
    const occupancy = loadRange(all, shown.start, shown.end);

    expect(deriveConflict(pending[0], occupancy, pending)).toBeNull();
    expect(deriveConflict(pending[1], occupancy, pending)).toBeNull();
  });
});
