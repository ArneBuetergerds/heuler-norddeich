import { describe, it, expect } from "vitest";
import {
  blockedPeriodCreateSchema,
  bookingRequestSchema,
  looksLikeAddress,
  manualBookingSchema,
  TERMS_REQUIRED_MESSAGE,
} from "./validation";

const ADRESSE = { street: "Musterweg 1", postalCode: "12345", city: "Musterstadt" };

const base = {
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  guests: 2,
  ...ADRESSE,
  termsAccepted: true,
};

/** Weit genug in der Zukunft, dass die Wäsche-Vorlauffrist nie greift. */
const WEIT_VORAUS = { startDate: "2027-07-10", endDate: "2027-07-17" };

describe("bookingRequestSchema", () => {
  it("akzeptiert eine Anfrage, die den Mindestaufenthalt der Saison erreicht", () => {
    // 01.07.–31.08.: Mindestaufenthalt 7 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-10",
      endDate: "2027-07-17",
    });

    expect(result.success).toBe(true);
  });

  it("lehnt eine Anfrage ab, die den Mindestaufenthalt der Saison unterschreitet", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-10",
      endDate: "2027-07-14",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "endDate");
      expect(issue?.message).toContain("mindestens 7 Nächte");
    }
  });

  it("wendet den Mindestaufenthalt der Saison des Anreisedatums an", () => {
    // 05.11.–22.12.: Mindestaufenthalt 3 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-11-10",
      endDate: "2027-11-13",
    });

    expect(result.success).toBe(true);
  });

  it("verlangt in einer Saison mit kürzerem Mindestaufenthalt entsprechend weniger Nächte", () => {
    // 09.01.–31.03.: Mindestaufenthalt 3 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-02-10",
      endDate: "2027-02-13",
    });

    expect(result.success).toBe(true);
  });

  it("lehnt ein Abreisedatum vor dem Anreisedatum ab", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-17",
      endDate: "2027-07-10",
    });

    expect(result.success).toBe(false);
  });

  it("lehnt ein Anreisedatum in der Vergangenheit ab", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2020-01-01",
      endDate: "2020-01-10",
    });

    expect(result.success).toBe(false);
  });

  it("verlangt eine Personenzahl", () => {
    const result = bookingRequestSchema.safeParse({
      name: base.name,
      email: base.email,
      ...WEIT_VORAUS,
    });

    expect(result.success).toBe(false);
  });

  it("lehnt mehr Personen ab, als die Wohnung fasst", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      ...WEIT_VORAUS,
      guests: 5,
    });

    expect(result.success).toBe(false);
  });

  it("akzeptiert Wäsche bis zur Personenzahl", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      ...WEIT_VORAUS,
      linens: 2,
      towels: 1,
    });

    expect(result.success).toBe(true);
  });

  it("lehnt mehr Wäschesätze als Personen ab", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      ...WEIT_VORAUS,
      linens: 3,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "linens")).toBe(true);
    }
  });

  // Die Frist bemisst sich an der Anreise, nicht am Zeitpunkt der Anfrage.
  it("lehnt Wäsche bei weniger als einer Woche Vorlauf ab", () => {
    const uebermorgen = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const spaeter = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);

    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: uebermorgen,
      endDate: spaeter,
      linens: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("eine Woche vor Anreise")),
      ).toBe(true);
    }
  });

  it("lässt denselben kurzfristigen Zeitraum ohne Wäsche zu", () => {
    const uebermorgen = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const spaeter = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);

    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: uebermorgen,
      endDate: spaeter,
    });

    expect(result.success).toBe(true);
  });

  describe("Missbrauchsgrenzen", () => {
    function issueAt(input: Record<string, unknown>, path: string): string | undefined {
      const result = bookingRequestSchema.safeParse({ ...base, ...WEIT_VORAUS, ...input });
      return result.success
        ? undefined
        : result.error.issues.find((i) => i.path.join(".") === path)?.message;
    }

    it("lehnt Aufenthalte über 60 Nächte ab (Schutz vor Rechen-DoS)", () => {
      expect(issueAt({ endDate: "9999-12-31" }, "endDate")).toContain("60 Nächte");
    });

    it("lehnt Anreisen weiter als 24 Monate in der Zukunft ab", () => {
      expect(issueAt({ startDate: "2099-07-10", endDate: "2099-07-17" }, "startDate")).toContain(
        "24 Monate",
      );
    });

    it("lehnt Links und Werbetext im Namen ab", () => {
      expect(issueAt({ name: "Gewinn! https://evil.example" }, "name")).toBeDefined();
      expect(issueAt({ name: "Erika\nZweite Zeile" }, "name")).toBeDefined();
    });

    it("akzeptiert Namen mit Umlauten, Akzenten, Bindestrich und Apostroph", () => {
      expect(issueAt({ name: "Jürgen O'Neill-Bütergerds" }, "name")).toBeUndefined();
      expect(issueAt({ name: "Zoë Müller" }, "name")).toBeUndefined();
    });

    it.each([
      "www.beispiel.com Jetzt gewinnen",
      "beispiel.com",
      "Gewinn auf beispiel.de",
      "Erika www Musterfrau",
      "Erika http Musterfrau",
      "WWW Gewinn",
      "Anna.Müller",
    ])("lehnt Domain-artigen Text im Namen ab: %j", (name) => {
      expect(issueAt({ name }, "name")).toBe(
        "Bitte nur den Namen angeben, ohne Web- oder E-Mail-Adresse",
      );
    });

    it.each(["Dr. Anna Müller", "J. R. R. Tolkien", "Hans-Peter O’Neil", "St. Clair", "Ph.D. Erika Muster"])(
      "akzeptiert echte Namen mit Punkt: %j",
      (name) => {
        expect(issueAt({ name }, "name")).toBeUndefined();
      },
    );

    it("begrenzt Nachricht und Telefonnummer", () => {
      expect(issueAt({ message: "x".repeat(2001) }, "message")).toBeDefined();
      expect(issueAt({ phone: "call me at evil.example" }, "phone")).toBeDefined();
      expect(issueAt({ phone: "+49 (0)4931 / 12-34" }, "phone")).toBeUndefined();
    });
  });
});

describe("Rechnungsanschrift im Online-Formular", () => {
  function parse(input: Record<string, unknown>) {
    return bookingRequestSchema.safeParse({ ...base, ...WEIT_VORAUS, ...input });
  }

  function issue(input: Record<string, unknown>) {
    const result = parse(input);
    return result.success ? undefined : result.error.issues[0];
  }

  it.each([
    ["street", "Bitte Straße und Hausnummer angeben"],
    ["postalCode", "Bitte die Postleitzahl angeben"],
    ["city", "Bitte den Ort angeben"],
  ])("verlangt %s, mit Meldung am Feld", (field, message) => {
    expect(issue({ [field]: "" })).toMatchObject({ path: [field], message });
    expect(issue({ [field]: "   " })).toMatchObject({ path: [field], message });
    expect(issue({ [field]: undefined })).toMatchObject({ path: [field], message });
  });

  it("lässt das Land weg und nimmt es, wenn angegeben", () => {
    expect(parse({}).success).toBe(true);
    const result = parse({ country: " Österreich " });
    expect(result.success && result.data.country).toBe("Österreich");
  });

  it.each(["12345", "1010", "SW1A 1AA", "00-001", "NL 1234 AB"])(
    "akzeptiert die Postleitzahl %j",
    (postalCode) => {
      expect(parse({ postalCode }).success).toBe(true);
    },
  );

  it.each(["12345!", "-12345", "1234/5", "١٢٣٤٥"])("lehnt die Postleitzahl %j ab", (postalCode) => {
    expect(issue({ postalCode })?.path).toEqual(["postalCode"]);
  });

  it.each([
    ["street", "Musterweg 1\nZweite Zeile"],
    ["street", "Musterweg\t1"],
    ["city", "Muster\u200Bstadt"],
    ["country", "Öster\nreich"],
  ])("lehnt Steuerzeichen in %s ab", (field, value) => {
    expect(issue({ [field]: value })?.path).toEqual([field]);
  });

  it("begrenzt die Längen wie die Datenbankspalten", () => {
    expect(issue({ street: "x".repeat(151) })?.path).toEqual(["street"]);
    expect(issue({ postalCode: "1".repeat(13) })?.path).toEqual(["postalCode"]);
    expect(issue({ city: "x".repeat(101) })?.path).toEqual(["city"]);
    expect(issue({ country: "x".repeat(61) })?.path).toEqual(["country"]);
    expect(parse({ street: "x".repeat(150), city: "x".repeat(100), country: "x".repeat(60) }).success).toBe(true);
  });

  it("akzeptiert Straßen und Orte mit Umlauten, Punkt, Komma und Schrägstrich", () => {
    expect(
      parse({ street: "Hauptstr. 12a / Hinterhaus, c/o Müller", city: "Frankfurt (Oder)" }).success,
    ).toBe(true);
  });
});

describe("blockedPeriodCreateSchema", () => {
  it("akzeptiert einen Sperrzeitraum über genau einen Tag (Ende = letzter gesperrter Tag)", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      kind: "block",
      startDate: "2027-03-10",
      endDate: "2027-03-10",
      note: "Wartung",
    });

    expect(result.success).toBe(true);
  });

  it("lehnt einen Sperrzeitraum ab, der vor seinem Beginn endet", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      kind: "block",
      startDate: "2027-03-10",
      endDate: "2027-03-09",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Der letzte gesperrte Tag darf nicht vor dem ersten liegen",
      );
    }
  });

  it("lehnt eine interne Belegung mit gleichem Anreise- und Abreisetag ab", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      kind: "internal",
      startDate: "2027-03-10",
      endDate: "2027-03-10",
      note: "Familie",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Die Abreise muss nach der Anreise liegen");
    }
  });

  it("akzeptiert eine interne Belegung über eine Nacht", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      kind: "internal",
      startDate: "2027-03-10",
      endDate: "2027-03-11",
      note: "Familie",
    });

    expect(result.success).toBe(true);
  });

  it("legt keine manuellen Aufenthalte nur mit Gastnamen mehr an (Art fehlt)", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      startDate: "2027-03-10",
      endDate: "2027-03-11",
      guestName: "Familie Janssen",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Bitte die Art des Eintrags wählen");
    }
  });

  it("liefert eine lesbare Meldung bei ungültigem Datum", () => {
    const result = blockedPeriodCreateSchema.safeParse({
      kind: "block",
      startDate: "kein-datum",
      endDate: "2027-03-11",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Bitte ein gültiges Startdatum angeben");
    }
  });
});

describe("bookingRequestSchema – Mietbedingungen", () => {
  it.each([
    ["fehlt", undefined],
    ["false ist", false],
    ['der Text "on" ist', "on"],
  ])("lehnt ab, wenn der Haken %s – mit Meldung am Feld", (_fall, termsAccepted) => {
    const result = bookingRequestSchema.safeParse({ ...base, ...WEIT_VORAUS, termsAccepted });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["termsAccepted"]);
      expect(result.error.issues[0]?.message).toBe(TERMS_REQUIRED_MESSAGE);
    }
  });

  it("meldet Fehler in den Feldern davor zuerst", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      ...WEIT_VORAUS,
      street: "",
      termsAccepted: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["street"]);
    }
  });
});

describe("manualBookingSchema", () => {
  const manual = { ...base, startDate: "2027-07-10", endDate: "2027-07-12" };

  it("verlangt keinen Haken für die Mietbedingungen und übernimmt ihn nicht", () => {
    const ohneHaken: Record<string, unknown> = { ...manual };
    delete ohneHaken.termsAccepted;
    const result = manualBookingSchema.safeParse(ohneHaken);

    expect(result.success).toBe(true);
    expect(manualBookingSchema.safeParse({ ...ohneHaken, termsAccepted: false }).success).toBe(true);
    if (result.success) {
      expect("termsAccepted" in result.data).toBe(false);
    }
  });

  it("akzeptiert eine Buchung ohne Mindestaufenthalt der Saison", () => {
    // 01.07.–31.08. verlangt online 7 Nächte, manuell genügen zwei.
    expect(manualBookingSchema.safeParse(manual).success).toBe(true);
  });

  it("akzeptiert eine nachträglich eingetragene Buchung in der Vergangenheit, mit Wäsche", () => {
    const result = manualBookingSchema.safeParse({
      ...base,
      startDate: "2020-01-01",
      endDate: "2020-01-03",
      linens: 2,
      towels: 1,
    });

    expect(result.success).toBe(true);
  });

  it("akzeptiert eine Buchung mehr als 24 Monate im Voraus", () => {
    const start = new Date();
    start.setUTCFullYear(start.getUTCFullYear() + 3);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2);
    const result = manualBookingSchema.safeParse({
      ...base,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(true);
  });

  it("verlangt Anreise vor Abreise", () => {
    const result = manualBookingSchema.safeParse({ ...manual, endDate: "2027-07-10" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Die Abreise muss nach der Anreise liegen");
    }
  });

  it("verlangt eine E-Mail-Adresse (Spalte NOT NULL)", () => {
    const result = manualBookingSchema.safeParse({ ...manual, email: undefined });

    expect(result.success).toBe(false);
  });

  it("übernimmt die Namensregel der Online-Anfrage", () => {
    const result = manualBookingSchema.safeParse({ ...manual, name: "www.beispiel.com" });

    expect(result.success).toBe(false);
  });

  it.each([0, 5])("lehnt %i Personen ab", (guests) => {
    expect(manualBookingSchema.safeParse({ ...manual, guests }).success).toBe(false);
  });

  it("lehnt mehr Wäschesätze als Personen ab", () => {
    const result = manualBookingSchema.safeParse({ ...manual, guests: 2, towels: 3 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["towels"],
        message: "Nicht mehr Sätze als Personen",
      });
    }
  });

  it("akzeptiert eine Buchung ohne Anschrift", () => {
    const ohne = { name: base.name, email: base.email, guests: 2, startDate: "2027-07-10", endDate: "2027-07-12" };
    expect(manualBookingSchema.safeParse(ohne).success).toBe(true);
    expect(
      manualBookingSchema.safeParse({ ...ohne, street: "", postalCode: "", city: "", country: "" }).success,
    ).toBe(true);
  });

  it("übernimmt eine vollständige Anschrift", () => {
    const result = manualBookingSchema.safeParse({ ...manual, country: "Niederlande" });
    expect(result.success && result.data).toMatchObject({ ...ADRESSE, country: "Niederlande" });
  });

  it("verlangt eine angefangene Anschrift vollständig, mit Meldung am fehlenden Feld", () => {
    const result = manualBookingSchema.safeParse({ ...manual, street: "", postalCode: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0])).toEqual(["street", "postalCode"]);
      expect(result.error.issues[0]?.message).toContain("Straße und Hausnummer");
    }
  });

  it("prüft auch freiwillige Anschriftsfelder auf Zeichen und Länge", () => {
    expect(manualBookingSchema.safeParse({ ...manual, postalCode: "12345!" }).success).toBe(false);
    expect(manualBookingSchema.safeParse({ ...manual, city: "x".repeat(101) }).success).toBe(false);
  });

  it("begrenzt die Nächte zum Schutz der Preisberechnung", () => {
    const result = manualBookingSchema.safeParse({
      ...manual,
      startDate: "2027-07-01",
      endDate: "2027-12-31",
    });

    expect(result.success).toBe(false);
  });
});

describe("looksLikeAddress", () => {
  it.each(["www.beispiel.com", "https://x", "a://b", "erika@beispiel", "x.de", "Shop.Online"])(
    "erkennt %j als Adresse",
    (name) => {
      expect(looksLikeAddress(name)).toBe(true);
    },
  );

  it.each(["Dr. Anna Müller", "J. R. R. Tolkien", "J.R.R. Tolkien", "St. Clair", "Hans-Peter O’Neil", "Wwwe Ohm"])(
    "hält %j für einen Namen",
    (name) => {
      expect(looksLikeAddress(name)).toBe(false);
    },
  );
});
