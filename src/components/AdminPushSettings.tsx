"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  /** VAPID-Schlüssel vom Server; `null`, wenn Push dort nicht eingerichtet ist. */
  vapidPublicKey: string | null;
};

type State =
  | "loading"
  | "not-configured"
  | "ios-install"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

const SW_URL = "/sw.js";
const SW_SCOPE = "/admin";

/** VAPID-Schlüssel (Base64url) in das Format, das `pushManager.subscribe` erwartet. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * Auf dem iPhone gibt es Web Push nur für Seiten, die über "Zum
 * Home-Bildschirm" installiert wurden – im normalen Safari-Tab fehlt die API.
 */
function isIosBrowserTab(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function detectState(vapidPublicKey: string | null): Promise<State> {
  if (!vapidPublicKey) return "not-configured";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIosBrowserTab() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

async function postJson(url: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new Error(
      data !== null && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Die Aktion konnte nicht ausgeführt werden.",
    );
  }
}

/**
 * Push-Benachrichtigungen für das aktuelle Gerät ein- und ausschalten. Jedes
 * Gerät meldet sich einzeln an – Handy und Rechner lassen sich so unabhängig
 * voneinander steuern.
 */
export function AdminPushSettings({ vapidPublicKey }: Props) {
  const [state, setState] = useState<State>("loading");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    detectState(vapidPublicKey).then(setState, (error: unknown) => {
      console.error("Push-Status konnte nicht ermittelt werden", error);
      setState("unsupported");
    });
  }, [vapidPublicKey]);

  async function run(action: () => Promise<void>): Promise<void> {
    setPending(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  const enable = () =>
    run(async () => {
      // Die Berechtigungsabfrage muss direkt aus dem Klick heraus kommen,
      // sonst blockieren Safari und Firefox sie.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      });

      await postJson("/api/admin/push-subscription", "POST", subscription.toJSON());
      setState("on");
      toast.success("Benachrichtigungen auf diesem Gerät eingeschaltet.");
    });

  const disable = () =>
    run(async () => {
      const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await postJson("/api/admin/push-subscription", "DELETE", {
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Benachrichtigungen auf diesem Gerät ausgeschaltet.");
    });

  const sendTest = () =>
    run(async () => {
      await postJson("/api/admin/push-subscription/test", "POST");
      toast.success("Testbenachrichtigung verschickt.");
    });

  const hint: Partial<Record<State, string>> = {
    "not-configured":
      "Push ist auf dem Server noch nicht eingerichtet. Neue Anfragen kommen weiterhin per E-Mail.",
    "ios-install":
      "Auf dem iPhone: in Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen, die App von dort öffnen und hier einschalten.",
    unsupported: "Dieser Browser unterstützt keine Push-Benachrichtigungen.",
    denied:
      "Benachrichtigungen sind für diese Seite blockiert. Bitte in den Browser- bzw. Systemeinstellungen erlauben.",
  };

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        {state === "on" ? (
          <BellRing className="mt-0.5 size-5 shrink-0 text-schlick" aria-hidden />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-schlick-3" aria-hidden />
        )}
        <div>
          <p className="text-sm font-semibold">
            Push-Benachrichtigungen auf diesem Gerät:{" "}
            {state === "loading" ? "…" : state === "on" ? "an" : "aus"}
          </p>
          <p className="text-xs text-schlick-2">
            {hint[state] ?? "Bei jeder neuen Buchungsanfrage – zusätzlich zur E-Mail."}
          </p>
        </div>
      </div>

      {state === "off" && (
        <Button size="sm" disabled={pending} onClick={enable}>
          Einschalten
        </Button>
      )}
      {state === "on" && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={sendTest}>
            Test senden
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={disable}>
            Ausschalten
          </Button>
        </div>
      )}
    </div>
  );
}
