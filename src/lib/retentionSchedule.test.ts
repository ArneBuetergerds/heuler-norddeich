import { describe, it, expect, vi, afterEach } from "vitest";

// vi.mock wird nach oben gezogen; die Attrappe muss es mit ihm.
const { purgeExpiredData } = vi.hoisted(() => ({ purgeExpiredData: vi.fn() }));

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../db/retentionQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db/retentionQueries")>()),
  purgeExpiredData,
}));

const { runRetention, startRetentionSchedule, FIRST_RUN_DELAY_MS, RUN_INTERVAL_MS } = await import(
  "./retentionSchedule"
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  purgeExpiredData.mockReset();
});

describe("runRetention", () => {
  it("loggt nur Anzahlen", async () => {
    purgeExpiredData.mockResolvedValue({
      requestsDeleted: 2,
      requestsAnonymized: 1,
      invoicesDeleted: 0,
      manualStaysDeleted: 0,
      logEntriesDeleted: 3,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await runRetention();

    expect(info).toHaveBeenCalledWith(
      "Automatische Löschung: 2 Anfragen gelöscht, 1 anonymisiert, 0 Rechnungen gelöscht, 0 manuelle Aufenthalte gelöscht, 3 Protokolleinträge gelöscht",
    );
  });

  it("fängt Fehler ab und loggt nur die erste Zeile der Meldung", async () => {
    purgeExpiredData.mockRejectedValue(
      new Error("Failed query: delete from booking_request\nparams: erika@example.invalid"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runRetention()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      "Automatische Löschung fehlgeschlagen: Error: Failed query: delete from booking_request",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("erika");
  });
});

describe("startRetentionSchedule", () => {
  it("läuft nicht während des Builds", () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    startRetentionSchedule();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("läuft kurz nach dem Start, dann alle 24 Stunden, und nur einmal je Prozess", async () => {
    vi.useFakeTimers();
    purgeExpiredData.mockResolvedValue({
      requestsDeleted: 0,
      requestsAnonymized: 0,
      invoicesDeleted: 0,
      manualStaysDeleted: 0,
      logEntriesDeleted: 0,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    startRetentionSchedule();
    startRetentionSchedule();

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(FIRST_RUN_DELAY_MS);
    expect(purgeExpiredData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS);
    expect(purgeExpiredData).toHaveBeenCalledTimes(2);
  });
});
