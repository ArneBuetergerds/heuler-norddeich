import { describe, it, expect } from "vitest";
import { lodgingStructuredData } from "./structuredData";

describe("lodgingStructuredData", () => {
  const data = lodgingStructuredData();

  it("leitet den Preisrahmen aus der Saisontabelle ab", () => {
    expect(data.priceRange).toBe("54 € – 94 € pro Nacht");
  });

  it("verwendet absolute Bild-URLs", () => {
    for (const url of data.image as string[]) {
      expect(url).toMatch(/^https:\/\/norddeich-heuler\.de\/images\//);
    }
  });

  it("ist als JSON serialisierbar", () => {
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
