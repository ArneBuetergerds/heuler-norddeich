/**
 * Entscheidungen für den Hinweis „Zur Startseite hinzufügen“ auf der
 * öffentlichen Website. Reine Funktionen, damit sie ohne Browser testbar sind;
 * das Auslesen von User-Agent, Anzeigemodus und Speicher macht `InstallHint`.
 */

export type InstallPlatform = "android" | "ios-safari" | "other";

/** Schlüssel in `localStorage`: gesetzt, sobald der Gast den Hinweis schließt. */
export const INSTALL_HINT_DISMISSED_KEY = "heuler-installhinweis-geschlossen";

/**
 * Ab welcher Scrolltiefe (Anteil der Fensterhöhe) der Hinweis erscheint. Er
 * steht unten über dem Footer; beim ersten Blick auf die Seite ist er nie da.
 */
export const INSTALL_HINT_SCROLL_RATIO = 0.5;

/**
 * Plattform aus dem User-Agent. Nur zwei Fälle bekommen einen Hinweis:
 * Android (Chromium bietet dort `beforeinstallprompt`) und Safari auf iPhone
 * und iPad (dort geht es nur von Hand über „Teilen“). iPadOS meldet sich als
 * Mac – erkennbar an der Touch-Unterstützung. Andere iOS-Browser (Chrome,
 * Firefox, In-App-Browser) haben das Menü woanders, der Text passte nicht.
 */
export function installPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/Android/i.test(userAgent)) {
    return "android";
  }

  const iOS =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const safari =
    /Safari/.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|FBAN|FBAV|Instagram|Line\//.test(userAgent);

  return iOS && safari ? "ios-safari" : "other";
}

export type InstallHintInput = {
  platform: InstallPlatform;
  /** Läuft die Seite bereits als installierte App (`display-mode: standalone`)? */
  standalone: boolean;
  /** Hat der Gast den Hinweis früher geschlossen? */
  dismissed: boolean;
  /** Hat der Gast weit genug gescrollt (siehe `INSTALL_HINT_SCROLL_RATIO`)? */
  scrolled: boolean;
  /** Liegt ein nicht verbrauchtes `beforeinstallprompt`-Ereignis vor? */
  canPrompt: boolean;
};

/**
 * Welcher Hinweis gezeigt wird: Knopf (Android), Anleitung (iOS) oder keiner.
 * Auf Desktop, wenn bereits installiert, nach dem Schließen und vor dem
 * Scrollen nie.
 */
export function installHintVariant(input: InstallHintInput): "prompt" | "ios" | null {
  if (input.standalone || input.dismissed || !input.scrolled) {
    return null;
  }
  if (input.platform === "ios-safari") {
    return "ios";
  }
  if (input.platform === "android" && input.canPrompt) {
    return "prompt";
  }
  return null;
}
