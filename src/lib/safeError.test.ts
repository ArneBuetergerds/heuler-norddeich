import { describe, it, expect } from "vitest";
import { WebPushError } from "web-push";
import {
  maskSensitive,
  safeError,
  SAFE_ERROR_MAX_MESSAGE_LENGTH,
  SAFE_ERROR_MAX_SCAN_LENGTH,
} from "./safeError";

/** Fehler, wie nodemailer ihn in `_formatError` zusammensetzt. */
function nodemailerError(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

describe("safeError", () => {
  it("nodemailer EENVELOPE: Code, Antwortcode und Befehl, ohne Empfängeradresse", () => {
    const response = "550 5.1.1 <gast@example.org>: Recipient address rejected";
    const error = nodemailerError(`Can't send mail - all recipients were rejected: ${response}`, {
      code: "EENVELOPE",
      response,
      responseCode: 550,
      command: "RCPT TO",
      rejected: ["gast@example.org"],
    });

    const logged = safeError(error);

    expect(logged).toBe(
      "Error [code=EENVELOPE responseCode=550 command=RCPT TO]: Can't send mail - all recipients were rejected: 550 5.1.1 <adresse>: Recipient address rejected",
    );
    expect(logged).not.toContain("gast");
  });

  it("nodemailer: ungültiger Empfänger in Anführungszeichen wird maskiert", () => {
    const error = nodemailerError('Invalid recipient "erika mustermann@"', {
      code: "EENVELOPE",
      command: "API",
    });

    expect(safeError(error)).toBe('Error [code=EENVELOPE command=API]: Invalid recipient "<wert>"');
  });

  it("WebPushError: Statuscode ja, Endpoint, Header und Antwort nie", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/geheimes-abo-123";
    const error = new WebPushError(
      "Received unexpected response code",
      410,
      { "x-request": "abc" },
      `push subscription has unsubscribed or expired: ${endpoint}`,
      endpoint,
    );

    const logged = safeError(error);

    expect(logged).toBe("WebPushError [statusCode=410]: Received unexpected response code");
    expect(logged).not.toContain("geheimes-abo");
    expect(logged).not.toContain("fcm.googleapis.com");
  });

  it("maskiert URLs in der Meldung", () => {
    const error = new Error(
      "connect ECONNREFUSED for https://updates.push.services.mozilla.com/wpush/v2/abc?x=1",
    );

    expect(safeError(error)).toBe("Error: connect ECONNREFUSED for <url>");
  });

  it("mysql2 ER_DUP_ENTRY: Code und errno, Werte in der Meldung maskiert", () => {
    const error = Object.assign(
      new Error("Duplicate entry 'gast@example.org-Erika Mustermann' for key 'booking_request.uniq'"),
      {
        code: "ER_DUP_ENTRY",
        errno: 1062,
        sqlState: "23000",
        sqlMessage: "Duplicate entry 'gast@example.org-Erika Mustermann' for key 'booking_request.uniq'",
        sql: "insert into `booking_request` (`name`, `email`) values ('Erika Mustermann', 'gast@example.org')",
      },
    );

    const logged = safeError(error);

    expect(logged).toBe(
      "Error [code=ER_DUP_ENTRY errno=1062]: Duplicate entry '<wert>' for key '<wert>'",
    );
    expect(logged).not.toContain("Erika");
    expect(logged).not.toContain("gast");
    expect(logged).not.toContain("insert");
  });

  it("Drizzle-Fehler: nur die erste Zeile ohne Parameter, Ursache eine Ebene tief", () => {
    const cause = Object.assign(new Error("Duplicate entry 'Erika' for key 'PRIMARY'"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    class DrizzleQueryError extends Error {}
    const error = new DrizzleQueryError(
      "Failed query: insert into `booking_request` (`name`) values (?)\nparams: Erika,gast@example.org",
      { cause },
    );

    const logged = safeError(error);

    expect(logged).toBe(
      "DrizzleQueryError: Failed query: insert into `booking_request` (`name`) values (?) (Ursache: Error [code=ER_DUP_ENTRY errno=1062]: Duplicate entry '<wert>' for key '<wert>')",
    );
    expect(logged).not.toContain("Erika");
  });

  it("enthält keinen Stacktrace", () => {
    const logged = safeError(new Error("SMTP down"));

    expect(logged).toBe("Error: SMTP down");
    expect(logged).not.toContain("\n");
    expect(logged).not.toContain("at ");
  });

  it("geworfene Strings und Objekte ohne Error", () => {
    expect(safeError("kaputt bei gast@example.org")).toBe("Fehler ohne Fehlerobjekt: kaputt bei <adresse>");
    expect(safeError({ statusCode: 500, endpoint: "https://x.example/abc" })).toBe(
      "Fehler ohne Fehlerobjekt (object) [statusCode=500]",
    );
    expect(safeError(undefined)).toBe("Fehler ohne Fehlerobjekt (undefined)");
  });
});

describe("maskSensitive", () => {
  it("kürzt lange Meldungen", () => {
    const masked = maskSensitive("x".repeat(SAFE_ERROR_MAX_MESSAGE_LENGTH + 50));

    expect(masked).toHaveLength(SAFE_ERROR_MAX_MESSAGE_LENGTH + 1);
    expect(masked.endsWith("…")).toBe(true);
  });

  it("maskiert nur den Anfang sehr langer Zeilen", () => {
    // Was hinter der Kappung steht, wird weder durchsucht noch ausgegeben.
    const masked = maskSensitive(`'${"x".repeat(SAFE_ERROR_MAX_SCAN_LENGTH)}' gast@example.org`);

    expect(masked).not.toContain("gast");
    expect(masked).toHaveLength(SAFE_ERROR_MAX_MESSAGE_LENGTH + 1);
  });

  it("maskiert innerhalb der Kappung wie bisher", () => {
    const masked = maskSensitive(`'${"x".repeat(SAFE_ERROR_MAX_SCAN_LENGTH - 10)}' a@b.de`);

    expect(masked).toBe("'<wert>' <adresse>");
  });

  it("bleibt auf langen Zeilen ohne Treffer schnell", () => {
    const started = performance.now();
    // Ohne Kappung liefe EMAIL_PATTERN hier quadratisch (Sekunden).
    maskSensitive(`'${"a".repeat(50_000)}`);

    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("lässt Apostrophe stehen", () => {
    expect(maskSensitive("Can't connect, doesn't matter")).toBe("Can't connect, doesn't matter");
  });
});
