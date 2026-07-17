import { describe, it, expect } from "vitest";
import { splitOccupancy, deriveConflict, type OccupancyRow } from "./occupancy";

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
