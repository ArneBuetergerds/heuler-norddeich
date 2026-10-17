"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import {
  DateRangePicker,
  toDateInputValue,
  toUtcMidnight,
} from "@/components/DateRangePicker";
import {
  EXTRAS,
  EXTRAS_LEAD_DAYS,
  MAX_GUESTS,
  extrasBookable,
  extrasTotal,
  minNightsMessage,
} from "@/lib/pricing";
import { RESPONSE_HOURS } from "@/lib/terms";
import { FELD, Feld, FehlerText, Zahlenfeld, type Fehler } from "./FormFields";
import { PriceQuote } from "./PriceQuote";

type Status = "idle" | "sending" | "success";

/**
 * Serverfelder auf die IDs im Formular abbilden. Zeitraumfehler gehören zum
 * Datumsfeld, Wäschefehler zum Wäscheblock.
 */
const FELD_ID: Record<string, string> = {
  startDate: "date-range",
  endDate: "date-range",
  name: "name",
  email: "email",
  phone: "phone",
  message: "message",
  guests: "guests",
  linens: "extras",
  towels: "extras",
};
type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

type Props = {
  occupancy: Occupancy;
  /** Zeitraum kommt von außen: Kalender und Formular teilen sich die Auswahl. */
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
};

export function BookingRequestForm({ occupancy, range, onRangeChange }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [fehler, setFehler] = useState<Fehler | null>(null);
  const [bestaetigung, setBestaetigung] = useState<{ zeitraum: string; email: string } | null>(
    null,
  );
  const erfolgRef = useRef<HTMLDivElement>(null);
  const [guests, setGuests] = useState(2);
  const [extras, setExtras] = useState({ linens: 0, towels: 0 });
  // Zeitpunkt, ab dem das Formular sichtbar ist: Der Server verwirft Anfragen,
  // die schneller abgeschickt werden, als ein Mensch es ausfüllen kann.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  // Wäsche braucht eine Woche Vorlauf. Ohne gewählten Zeitraum ist noch nichts
  // entschieden, deshalb bleiben die Felder dann bedienbar.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const waescheMoeglich =
    !range?.from || extrasBookable(toUtcMidnight(range.from), todayUtc);

  function setExtra(key: "linens" | "towels", wert: number): void {
    // Nie mehr Sätze als Personen – dieselbe Regel prüfen Server und Datenbank.
    setExtras((alt) => ({ ...alt, [key]: Math.max(0, Math.min(wert, guests)) }));
  }

  function changeGuests(wert: number): void {
    const neu = Math.max(1, Math.min(wert, MAX_GUESTS));
    setGuests(neu);
    setExtras((alt) => ({
      linens: Math.min(alt.linens, neu),
      towels: Math.min(alt.towels, neu),
    }));
  }

  /**
   * Zeigt die Meldung am betroffenen Feld und springt dorthin. Mobil liegt das
   * Formular über mehrere Bildschirme – eine Meldung oben sähe niemand, der
   * gerade unten auf "Anfrage senden" getippt hat.
   */
  function zeigeFehler(feld: string | null, text: string): void {
    setFehler({ feld, text });
    requestAnimationFrame(() => {
      const ziel = document.getElementById(feld ?? "anfrage-fehler");
      ziel?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (feld) ziel?.focus({ preventScroll: true });
    });
  }

  /** aria-Attribute für ein Eingabefeld, falls die aktuelle Meldung zu ihm gehört. */
  function fehlerAttribute(id: string) {
    return fehler?.feld === id
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` }
      : {};
  }

  // Nach dem Absenden die Bestätigung in den Blick holen: Das lange Formular
  // verschwindet, ohne Sprung landete man irgendwo darunter.
  useEffect(() => {
    if (status === "success") {
      erfolgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      erfolgRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Referenz vor dem await festhalten: danach ist `currentTarget` null und
    // `reset()` würde werfen.
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!range?.from || !range?.to) {
      zeigeFehler("date-range", "Bitte wählen Sie Anreise- und Abreisedatum.");
      return;
    }

    // Derselbe Wortlaut, mit dem der Server ablehnen würde - nur ohne den
    // Umweg über eine verworfene Anfrage.
    const tooShort = minNightsMessage(
      toUtcMidnight(range.from),
      toUtcMidnight(range.to),
    );
    if (tooShort) {
      zeigeFehler("date-range", tooShort);
      return;
    }

    setStatus("sending");
    setFehler(null);

    let response: Response;
    try {
      response = await fetch("/api/booking-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        startDate: toDateInputValue(range.from),
        endDate: toDateInputValue(range.to),
        message: formData.get("message"),
        guests,
        linens: waescheMoeglich ? extras.linens : 0,
        towels: waescheMoeglich ? extras.towels : 0,
        website: formData.get("website"),
        formMs: Date.now() - shownAt.current,
      }),
      });
    } catch {
      // Ohne Netz bliebe der Button sonst dauerhaft auf "Wird gesendet …".
      setStatus("idle");
      zeigeFehler(null, "Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.");
      return;
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: unknown;
        field?: unknown;
      } | null;
      const text =
        typeof data?.error === "string" ? data.error : "Bitte prüfen Sie Ihre Eingaben.";
      const feld = typeof data?.field === "string" ? (FELD_ID[data.field] ?? null) : null;
      setStatus("idle");
      zeigeFehler(feld, text);
      return;
    }

    setBestaetigung({
      zeitraum: `${range.from.toLocaleDateString("de-DE")} – ${range.to.toLocaleDateString("de-DE")}`,
      email: String(formData.get("email") ?? ""),
    });
    form.reset();
    onRangeChange(undefined);
    setGuests(2);
    setExtras({ linens: 0, towels: 0 });
    setStatus("success");
    shownAt.current = Date.now();
  }

  if (status === "success") {
    return (
      <div
        ref={erfolgRef}
        tabIndex={-1}
        role="status"
        className="rounded-card border border-linie bg-muschel p-6 text-center outline-none"
      >
        <p className="font-display text-h3 text-schlick">Anfrage ist da</p>
        {bestaetigung && (
          <p className="mt-3 text-body text-schlick">
            Zeitraum {bestaetigung.zeitraum}
          </p>
        )}
        <p className="mt-3 text-klein text-schlick-2">
          Sie erhalten gleich eine Eingangsbestätigung
          {bestaetigung?.email ? ` an ${bestaetigung.email}` : " per E-Mail"}. Die
          verbindliche Zu- oder Absage kommt persönlich. Keine Mail da? Bitte
          auch im Spam-Ordner nachsehen.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 h-11 rounded-pille border border-linie px-6 text-klein font-semibold text-priel-tief hover:bg-priel-hell"
        >
          Weiteren Zeitraum anfragen
        </button>
      </div>
    );
  }

  return (
    <form
      id="anfrageformular"
      onSubmit={handleSubmit}
      className="flex scroll-mt-24 flex-col gap-5"
    >
      <h3 className="font-display text-h3 text-schlick">Unverbindlich anfragen</h3>

      {/* Fangfeld für Bots: für Menschen unsichtbar und nicht per Tab
          erreichbar. Wer es ausfüllt, wird serverseitig still verworfen. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Feld id="date-range" fehler={fehler} label="Zeitraum">
        <DateRangePicker
          id="date-range"
          occupancy={occupancy}
          range={range}
          onRangeChange={(next) => {
            onRangeChange(next);
            if (fehler?.feld === "date-range") setFehler(null);
          }}
          showSeasonHint
        />
      </Feld>

      <Feld id="guests" fehler={fehler} label="Personen">
        <Zahlenfeld
          id="guests"
          name="Personen"
          value={guests}
          min={1}
          max={MAX_GUESTS}
          onChange={changeGuests}
        />
      </Feld>

      <fieldset id="extras" tabIndex={-1} className="flex flex-col gap-3 outline-none">
        <legend className="text-klein font-medium text-schlick">
          Bettwäsche &amp; Handtücher
          <span className="font-normal text-schlick-2"> — optional</span>
        </legend>

        {waescheMoeglich ? (
          <>
            {(["linens", "towels"] as const).map((key) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={key} className="text-klein text-schlick">
                  {EXTRAS[key].label}
                  <span className="block text-mikro text-schlick-2">
                    {EXTRAS[key].pricePerSet} € je Satz und Aufenthalt
                  </span>
                </label>
                <Zahlenfeld
                  id={key}
                  name={EXTRAS[key].label}
                  value={extras[key]}
                  min={0}
                  max={guests}
                  onChange={(wert) => setExtra(key, wert)}
                />
              </div>
            ))}
            {extrasTotal(extras) > 0 && (
              <p className="text-mikro text-schlick-2">
                Zusammen {extrasTotal(extras)} €, bar bei der Schlüsselübergabe.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-sm bg-priel-hell px-4 py-3 text-mikro text-priel-tief">
            Für diesen Zeitraum nicht mehr bestellbar – Bettwäsche und Handtücher
            brauchen {EXTRAS_LEAD_DAYS} Tage Vorlauf. Schreiben Sie uns gern
            trotzdem, wir fragen nach, was sich einrichten lässt.
          </p>
        )}
        {fehler?.feld === "extras" && <FehlerText id="extras-fehler">{fehler.text}</FehlerText>}
      </fieldset>

      {range?.from && range.to && (
        <PriceQuote
          startDate={toUtcMidnight(range.from)}
          endDate={toUtcMidnight(range.to)}
          guests={guests}
          linens={waescheMoeglich ? extras.linens : 0}
          towels={waescheMoeglich ? extras.towels : 0}
        />
      )}

      <Feld id="name" fehler={fehler} label="Name">
        <input
          id="name"
          name="name"
          {...fehlerAttribute("name")}
          maxLength={100}
          type="text"
          required
          autoComplete="name"
          placeholder="Vor- und Nachname"
          className={FELD}
        />
      </Feld>

      <Feld id="email" fehler={fehler} label="E-Mail">
        <input
          id="email"
          name="email"
          {...fehlerAttribute("email")}
          maxLength={254}
          type="email"
          required
          autoComplete="email"
          placeholder="name@beispiel.de"
          className={FELD}
        />
      </Feld>

      <Feld id="phone" fehler={fehler} label="Telefon" optional>
        <input
          id="phone"
          name="phone"
          {...fehlerAttribute("phone")}
          maxLength={40}
          type="tel"
          autoComplete="tel"
          placeholder="0176 12345678"
          className={FELD}
        />
      </Feld>

      <Feld id="message" fehler={fehler} label="Nachricht" optional>
        <textarea
          id="message"
          name="message"
          {...fehlerAttribute("message")}
          maxLength={2000}
          rows={4}
          placeholder="Ankunftszeit, Kinder, Fragen zur Wohnung …"
          className={`${FELD} h-auto resize-none py-3.5`}
        />
      </Feld>

      {fehler && fehler.feld === null && (
        <p
          id="anfrage-fehler"
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-klein text-destructive"
        >
          {fehler.text}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="h-14 rounded-pille bg-priel text-base font-semibold text-muschel hover:bg-priel-tief disabled:opacity-60"
      >
        {status === "sending" ? "Wird gesendet …" : "Anfrage senden"}
      </button>

      {/* Kein Einwilligungshaken: Die Verarbeitung stützt sich auf Art. 6
          Abs. 1 lit. b DSGVO (vorvertragliche Maßnahme auf Ihre Anfrage hin).
          Eine zusätzlich eingeholte Einwilligung würde die Rechtsgrundlage
          nur verwässern – ein Hinweis mit Link ist das, was hierher gehört. */}
      <p className="text-center text-mikro text-schlick-2">
        Unverbindlich – keine Onlinebuchung, keine Zahlung. Antwort innerhalb
        von {RESPONSE_HOURS} Stunden.{" "}
        <a href="#storno" className="text-priel underline-offset-2 hover:underline">
          Stornobedingungen
        </a>
        . Wie wir Ihre Angaben verarbeiten, steht in der{" "}
        <a
          href="/datenschutz"
          className="text-priel underline-offset-2 hover:underline"
        >
          Datenschutzerklärung
        </a>
        .
      </p>
    </form>
  );
}
