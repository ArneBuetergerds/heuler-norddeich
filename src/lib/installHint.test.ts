import { describe, it, expect } from "vitest";
import { installHintVariant, installPlatform, type InstallHintInput } from "./installHint";

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("installPlatform", () => {
  it("erkennt Android", () => {
    expect(installPlatform(UA.androidChrome, 5)).toBe("android");
  });

  it("erkennt Safari auf dem iPhone", () => {
    expect(installPlatform(UA.iphoneSafari, 5)).toBe("ios-safari");
  });

  it("erkennt das iPad, das sich als Mac ausgibt, an der Touch-Unterstützung", () => {
    expect(installPlatform(UA.macSafari, 5)).toBe("ios-safari");
  });

  it("behandelt Safari auf dem Mac als Desktop", () => {
    expect(installPlatform(UA.macSafari, 0)).toBe("other");
  });

  it("schließt andere Browser auf iOS aus", () => {
    expect(installPlatform(UA.iphoneChrome, 5)).toBe("other");
    expect(installPlatform(UA.iphoneInstagram, 5)).toBe("other");
  });

  it("behandelt Windows als Desktop", () => {
    expect(installPlatform(UA.windowsChrome, 0)).toBe("other");
  });
});

describe("installHintVariant", () => {
  const base: InstallHintInput = {
    platform: "android",
    standalone: false,
    dismissed: false,
    scrolled: true,
    canPrompt: true,
  };

  it("zeigt auf Android den Knopf, wenn der Browser die Installation anbietet", () => {
    expect(installHintVariant(base)).toBe("prompt");
  });

  it("zeigt auf Android nichts ohne beforeinstallprompt", () => {
    expect(installHintVariant({ ...base, canPrompt: false })).toBeNull();
  });

  it("zeigt in Safari auf iOS die Anleitung", () => {
    expect(installHintVariant({ ...base, platform: "ios-safari", canPrompt: false })).toBe("ios");
  });

  it("zeigt auf Desktop nichts, auch wenn der Browser die Installation anbietet", () => {
    expect(installHintVariant({ ...base, platform: "other" })).toBeNull();
  });

  it("zeigt nichts vor dem Scrollen", () => {
    expect(installHintVariant({ ...base, scrolled: false })).toBeNull();
  });

  it("zeigt nichts, wenn bereits installiert", () => {
    expect(installHintVariant({ ...base, standalone: true })).toBeNull();
    expect(installHintVariant({ ...base, platform: "ios-safari", standalone: true })).toBeNull();
  });

  it("zeigt nichts mehr, nachdem der Gast ihn geschlossen hat", () => {
    expect(installHintVariant({ ...base, dismissed: true })).toBeNull();
    expect(installHintVariant({ ...base, platform: "ios-safari", dismissed: true })).toBeNull();
  });
});
