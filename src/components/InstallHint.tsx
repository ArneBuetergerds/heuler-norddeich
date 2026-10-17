"use client";

import { useEffect, useRef, useState } from "react";
import { Share, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  INSTALL_HINT_DISMISSED_KEY,
  INSTALL_HINT_SCROLL_RATIO,
  installHintVariant,
  installPlatform,
} from "@/lib/installHint";

/** Chromium-Ereignis, nicht in den TypeScript-DOM-Typen enthalten. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) !== null;
  } catch {
    // Privater Modus o. Ä.: Ohne Speicher lieber gar nicht zeigen, als den
    // Hinweis nach jedem Schließen wiederkommen zu lassen.
    return true;
  }
}

/**
 * Dezenter Hinweis „Zur Startseite hinzufügen“ für Gäste am Handy. Steht im
 * Seitenfluss über dem Footer, nie als Overlay, und erscheint erst, wenn der
 * Gast ein Stück gescrollt hat. Entscheidungslogik: `src/lib/installHint.ts`.
 *
 * Gespeichert wird nur, dass der Gast den Hinweis geschlossen hat – und das
 * erst auf seinen Klick hin. Kein Besuchszähler, kein Service Worker.
 */
export function InstallHint() {
  const [variant, setVariant] = useState<"prompt" | "ios" | null>(null);
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const platform = installPlatform(navigator.userAgent, navigator.maxTouchPoints);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (platform === "other" || standalone || readDismissed()) {
      return;
    }

    let scrolled = false;
    const update = () =>
      setVariant(
        installHintVariant({
          platform,
          standalone,
          dismissed: false,
          scrolled,
          canPrompt: promptEvent.current !== null,
        }),
      );

    const onBeforeInstallPrompt = (event: Event) => {
      // Statt der Mini-Leiste des Browsers bietet der eigene Hinweis die
      // Installation an – erst nach dem Scrollen.
      event.preventDefault();
      promptEvent.current = event as BeforeInstallPromptEvent;
      update();
    };
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * INSTALL_HINT_SCROLL_RATIO) {
        scrolled = true;
        window.removeEventListener("scroll", onScroll);
        update();
      }
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setVariant(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // Nicht speicherbar: Der Hinweis verschwindet trotzdem für diesen Besuch.
    }
    setVariant(null);
  }

  async function install() {
    const event = promptEvent.current;
    // Das Ereignis lässt sich nur einmal verwenden. Lehnt der Gast im Dialog
    // des Browsers ab, kommt der Hinweis in diesem Besuch nicht wieder.
    promptEvent.current = null;
    setVariant(null);
    try {
      await event?.prompt();
    } catch {
      // Browser hat den Dialog verweigert – nichts weiter zu tun.
    }
  }

  if (variant === null) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-6">
      <Alert role="region" aria-labelledby="installhinweis-titel">
        <AlertTitle id="installhinweis-titel">Heuler auf dem Startbildschirm</AlertTitle>
        <AlertDescription>
          {variant === "prompt" ? (
            <div className="flex flex-col items-start gap-3">
              <span>Belegung und Anfrage mit einem Tippen öffnen, ganz ohne App-Store.</span>
              <Button onClick={install} className="h-11">
                Zur Startseite hinzufügen
              </Button>
            </div>
          ) : (
            <p>
              Tippen Sie in Safari auf{" "}
              <Share aria-hidden="true" className="inline size-4 align-text-bottom" />{" "}
              „Teilen“ und dann auf „Zum Home-Bildschirm“.
            </p>
          )}
        </AlertDescription>
        <AlertAction className="top-0.5 right-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={dismiss}
            aria-label="Hinweis schließen"
          >
            <X />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
