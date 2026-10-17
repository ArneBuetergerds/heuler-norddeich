"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  DateRangePicker,
  toDateInputValue,
  toUtcMidnight,
} from "@/components/DateRangePicker";
import { FELD, Feld, FehlerText, Zahlenfeld, type Fehler } from "@/components/FormFields";
import { formatDate } from "@/lib/format";
import { adminOverviewHref, startOfUtcMonth } from "@/lib/month";
import { ADDRESS_LIMITS } from "@/lib/invoice";
import { EXTRAS, MAX_GUESTS } from "@/lib/pricing";
import { INTERNAL_RETENTION_MONTHS, internalStayDeletionDate } from "@/lib/retention";
import { cn } from "@/lib/utils";

/**
 * - "booking":  volle Buchung (z. B. telefonisch), mit Gastdaten und Rechnung,
 *               POST /api/admin/manual-booking
 * - "internal": interne Belegung (Eigennutzung, Familie, Freunde), Zeitraum
 *               plus Notiz, POST /api/admin/blocked-period
 * - "block":    Sperrzeitraum ohne Personenbezug (z. B. Wartung), ebenso
 */
type EntryKind = "booking" | "internal" | "block";
type Period = { startDate: Date; endDate: Date };
type Occupancy = { stays: Period[]; maintenance: Period[] };

const KIND_OPTIONS: { value: EntryKind; label: string; description: string }[] = [
  {
    value: "booking",
    label: "Buchung (z. B. telefonisch)",
    description: "Mit Gastdaten, sofort bestätigt. Danach ist eine Rechnung möglich.",
  },
  {
    value: "internal",
    label: "Interne Belegung",
    description: "Eigennutzung, Familie oder Freunde – ohne Gastdaten und ohne Rechnung.",
  },
  {
    value: "block",
    label: "Sperrzeitraum (z. B. Wartung)",
    description: "Ohne Personenbezug. Die Wohnung ist in dieser Zeit nicht buchbar.",
  },
];

const SUCCESS_MESSAGES: Record<EntryKind, string> = {
  booking: "Buchung eingetragen",
  internal: "Interne Belegung eingetragen",
  block: "Zeitraum gesperrt",
};

const SUBMIT_LABELS: Record<EntryKind, string> = {
  booking: "Buchung eintragen",
  internal: "Interne Belegung eintragen",
  block: "Sperrzeitraum hinzufügen",
};

/**
 * Serverfelder (`field` der Antwort von /api/admin/manual-booking) auf die
 * IDs im Formular abbilden, wie im Gastformular.
 */
const FELD_ID: Record<string, string> = {
  startDate: "period",
  endDate: "period",
  name: "name",
  email: "email",
  phone: "phone",
  street: "street",
  postalCode: "postalCode",
  city: "city",
  country: "country",
  message: "message",
  guests: "guests",
  linens: "extras",
  towels: "extras",
};

/** Was die Bestätigung nach dem Speichern zeigt. */
type Erfolg = {
  kind: EntryKind;
  zeitraum: string;
  /** Belegungsübersicht im Monat der Anreise – dort liegt der Detaildialog. */
  overviewHref: string;
  /** Nur interne Belegungen: Tag der automatischen Löschung. */
  deletionDate: Date | null;
};

/** Leere Felder als `undefined`, damit der Server sie als „nicht angegeben“ liest. */
function optionalText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function ManualBlockedPeriodForm({ occupancy }: { occupancy: Occupancy }) {
  const router = useRouter();
  const [kind, setKind] = useState<EntryKind>("booking");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [fehler, setFehler] = useState<Fehler | null>(null);
  const [erfolg, setErfolg] = useState<Erfolg | null>(null);
  const [guests, setGuests] = useState(2);
  const [extras, setExtras] = useState({ linens: 0, towels: 0 });
  const erfolgRef = useRef<HTMLDivElement>(null);

  /**
   * Alle Eintragsarten teilen sich den Picker, meinen mit "Ende" aber
   * Verschiedenes: bei Buchung und interner Belegung den Abreisetag (zählt
   * nicht mit), beim Sperrzeitraum den letzten gesperrten Tag (zählt mit).
   * Die API erwartet genau diese Formen – `createMaintenanceBlock` rechnet
   * serverseitig einen Tag drauf, `createManualBooking` und
   * `createInternalStay` nicht.
   */
  function changeKind(next: EntryKind): void {
    setKind(next);
    // Ein bereits gewählter Zeitraum würde nach dem Wechsel etwas anderes
    // bedeuten als beim Anklicken - deshalb zurücksetzen statt umdeuten.
    setRange(undefined);
    setFehler(null);
  }

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

  /** Meldung am betroffenen Feld zeigen und dorthin springen, wie im Gastformular. */
  function zeigeFehler(feld: string | null, text: string): void {
    setFehler({ feld, text });
    requestAnimationFrame(() => {
      const ziel = document.getElementById(feld ?? "eintrag-fehler");
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

  // Nach dem Speichern die Bestätigung in den Blick holen und fokussieren.
  useEffect(() => {
    if (erfolg) {
      erfolgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      erfolgRef.current?.focus({ preventScroll: true });
    }
  }, [erfolg]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Referenz vor dem await festhalten: danach ist `currentTarget` null und
    // `reset()` würde werfen.
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!range?.from || !range.to) {
      zeigeFehler(
        "period",
        kind === "block"
          ? "Bitte wählen Sie den ersten und den letzten gesperrten Tag."
          : "Bitte wählen Sie Anreise- und Abreisedatum.",
      );
      return;
    }

    setPending(true);
    setFehler(null);
    try {
      const period = {
        startDate: toDateInputValue(range.from),
        endDate: toDateInputValue(range.to),
      };
      let response: Response;
      try {
        response =
          kind === "booking"
            ? await fetch("/api/admin/manual-booking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...period,
                  name: formData.get("name"),
                  email: formData.get("email"),
                  phone: optionalText(formData, "phone"),
                  street: optionalText(formData, "street"),
                  postalCode: optionalText(formData, "postalCode"),
                  city: optionalText(formData, "city"),
                  country: optionalText(formData, "country"),
                  guests,
                  linens: extras.linens,
                  towels: extras.towels,
                  message: optionalText(formData, "message"),
                }),
              })
            : await fetch("/api/admin/blocked-period", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...period, kind, note: optionalText(formData, "note") }),
              });
      } catch {
        zeigeFehler(
          null,
          "Keine Verbindung. Bitte prüfen Sie die Internetverbindung und versuchen Sie es erneut.",
        );
        return;
      }

      if (!response.ok) {
        if (response.status === 409) {
          zeigeFehler(
            "period",
            "Der Zeitraum überschneidet sich mit einem bestehenden Eintrag. Bitte wählen Sie einen freien Zeitraum.",
          );
          return;
        }
        // Die API liefert bei 400 eine lesbare Meldung in `error`, die
        // Buchungs-API zusätzlich das betroffene Feld in `field`.
        const data = (await response.json().catch(() => null)) as {
          error?: unknown;
          field?: unknown;
        } | null;
        const text =
          typeof data?.error === "string" ? data.error : "Bitte prüfen Sie Ihre Eingaben.";
        const feld = typeof data?.field === "string" ? (FELD_ID[data.field] ?? null) : null;
        zeigeFehler(feld, text);
        return;
      }

      const anreise = toUtcMidnight(range.from);
      setErfolg({
        kind,
        zeitraum: `${range.from.toLocaleDateString("de-DE")} – ${range.to.toLocaleDateString("de-DE")}`,
        overviewHref: adminOverviewHref({
          month: startOfUtcMonth(anreise),
          today: new Date(),
          showAllHistory: false,
        }),
        deletionDate:
          kind === "internal" ? internalStayDeletionDate(toUtcMidnight(range.to)) : null,
      });
      form.reset();
      setRange(undefined);
      setGuests(2);
      setExtras({ linens: 0, towels: 0 });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (erfolg) {
    return (
      <div
        ref={erfolgRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm outline-none"
      >
        <p className="text-h3 font-bold text-schlick">{SUCCESS_MESSAGES[erfolg.kind]}</p>
        <p className="text-klein text-schlick">Zeitraum {erfolg.zeitraum}</p>
        {erfolg.kind === "booking" && (
          <p className="text-klein text-schlick-2">
            Es wurden keine E-Mails verschickt. Die Rechnung erstellen Sie in der
            Belegungsübersicht: Buchung antippen, dann im Detaildialog „Rechnung erstellen“.
          </p>
        )}
        {erfolg.deletionDate && (
          <p className="text-klein text-schlick-2">
            Wird am {formatDate(erfolg.deletionDate)} automatisch gelöscht.
          </p>
        )}
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {erfolg.kind === "booking" && (
            <Button asChild className="h-11">
              <Link href={erfolg.overviewHref}>Zur Belegungsübersicht</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setErfolg(null)}
          >
            Weiteren Eintrag anlegen
          </Button>
        </div>
      </div>
    );
  }

  const deletionPreview =
    kind === "internal" && range?.to ? internalStayDeletionDate(toUtcMidnight(range.to)) : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-h3 font-bold text-schlick">Neuer Eintrag</h2>

      {/* Native Radios: Pfeiltasten wechseln die Art, die ganze Karte ist
          Tippziel (mindestens 44px hoch). */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-klein font-medium text-schlick">
          Was möchten Sie eintragen?
        </legend>
        {KIND_OPTIONS.map((option) => {
          const checked = kind === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3.5 py-3 transition-colors",
                checked
                  ? "border-schlick bg-track"
                  : "border-linie bg-sand hover:border-schlick-3",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={checked}
                onChange={() => changeKind(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-schlick"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-klein font-semibold text-schlick">{option.label}</span>
                <span className="text-mikro text-schlick-2">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Feld
        id="period"
        fehler={fehler}
        label={kind === "block" ? "Erster und letzter gesperrter Tag" : "Anreise und Abreise"}
      >
        <DateRangePicker
          id="period"
          occupancy={occupancy}
          range={range}
          onRangeChange={(next) => {
            setRange(next);
            if (fehler?.feld === "period") setFehler(null);
          }}
          kind={kind === "block" ? "block" : "stay"}
          allowPast
        />
      </Feld>

      {kind === "booking" ? (
        <>
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
            <legend className="mb-1.5 text-klein font-medium text-schlick">
              Bettwäsche &amp; Handtücher
              <span className="font-normal text-schlick-2"> — optional</span>
            </legend>
            {(["linens", "towels"] as const).map((key) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={key} className="text-klein text-schlick">
                  {EXTRAS[key].label}
                  <span className="block text-mikro text-schlick-2">
                    {EXTRAS[key].pricePerSet}&nbsp;€ je Satz und Aufenthalt
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
            {fehler?.feld === "extras" && (
              <FehlerText id="extras-fehler">{fehler.text}</FehlerText>
            )}
          </fieldset>

          {/* Daten des Gasts, nicht der Betreiberin: deshalb kein
              Autofill aus ihrem eigenen Browserprofil. */}
          <Feld id="name" fehler={fehler} label="Name des Gasts">
            <input
              id="name"
              name="name"
              {...fehlerAttribute("name")}
              type="text"
              required
              maxLength={100}
              autoComplete="off"
              autoCapitalize="words"
              placeholder="Vor- und Nachname"
              className={FELD}
            />
          </Feld>

          <Feld id="email" fehler={fehler} label="E-Mail">
            <input
              id="email"
              name="email"
              {...fehlerAttribute("email")}
              type="email"
              inputMode="email"
              required
              maxLength={254}
              autoComplete="off"
              spellCheck={false}
              placeholder="name@beispiel.de"
              className={FELD}
            />
          </Feld>

          <Feld id="phone" fehler={fehler} label="Telefon" optional>
            <input
              id="phone"
              name="phone"
              {...fehlerAttribute("phone")}
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="off"
              placeholder="0176 12345678"
              className={FELD}
            />
          </Feld>

          {/* Freiwillig; eingetragen belegt sie die Rechnung im
              Detaildialog vor. Ganz leer oder vollständig – eine halbe
              Anschrift meldet der Server am fehlenden Feld. Hinweis außerhalb
              der Legende wie im Gastformular; `min-w-0` gegen Überlauf des
              PLZ/Ort-Rasters. */}
          <fieldset
            aria-describedby="anschrift-hinweis"
            className="flex min-w-0 flex-col gap-5"
          >
            <legend className="text-klein font-medium text-schlick">
              Rechnungsanschrift
              <span className="font-normal text-schlick-2"> — optional</span>
            </legend>
            <p id="anschrift-hinweis" className="mt-0.5 text-mikro text-schlick-2">
              Kann leer bleiben – dann bei der Rechnung eintragen.
            </p>

            <Feld id="street" fehler={fehler} label="Straße und Hausnummer">
              <input
                id="street"
                name="street"
                {...fehlerAttribute("street")}
                type="text"
                maxLength={ADDRESS_LIMITS.street}
                autoComplete="off"
                placeholder="Musterstraße 1"
                className={FELD}
              />
            </Feld>

            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Feld id="postalCode" fehler={fehler} label="PLZ">
                <input
                  id="postalCode"
                  name="postalCode"
                  {...fehlerAttribute("postalCode")}
                  type="text"
                  maxLength={ADDRESS_LIMITS.postalCode}
                  autoComplete="off"
                  className={FELD}
                />
              </Feld>

              <Feld id="city" fehler={fehler} label="Ort">
                <input
                  id="city"
                  name="city"
                  {...fehlerAttribute("city")}
                  type="text"
                  maxLength={ADDRESS_LIMITS.city}
                  autoComplete="off"
                  className={FELD}
                />
              </Feld>
            </div>

            <Feld id="country" fehler={fehler} label="Land" optional>
              <input
                id="country"
                name="country"
                {...fehlerAttribute("country")}
                type="text"
                maxLength={ADDRESS_LIMITS.country}
                autoComplete="off"
                placeholder="Deutschland"
                className={FELD}
              />
            </Feld>
          </fieldset>

          <Feld id="message" fehler={fehler} label="Nachricht / Notiz" optional>
            <textarea
              id="message"
              name="message"
              {...fehlerAttribute("message")}
              maxLength={2000}
              rows={3}
              placeholder="z. B. Ankunftszeit, Absprachen am Telefon …"
              className={cn(FELD, "h-auto resize-none py-3.5")}
            />
          </Feld>

          <p className="rounded-sm bg-priel-hell px-4 py-3 text-mikro text-priel-tief">
            Die Buchung ist sofort bestätigt. Es werden keine E-Mails verschickt – weder an
            den Gast noch an Sie. Eine Rechnung erstellen Sie danach im Detaildialog der
            Buchung in der Belegungsübersicht.
          </p>
        </>
      ) : (
        <>
          <Feld id="note" fehler={fehler} label="Notiz" optional>
            <input
              id="note"
              name="note"
              {...fehlerAttribute("note")}
              type="text"
              maxLength={500}
              autoComplete="off"
              placeholder={kind === "internal" ? "z. B. Eigennutzung, Familie …" : "z. B. Wartung …"}
              className={FELD}
            />
          </Feld>
          {kind === "internal" && (
            <p className="rounded-sm bg-priel-hell px-4 py-3 text-mikro text-priel-tief">
              Ohne Rechnung und ohne Gastdaten. Wird {INTERNAL_RETENTION_MONTHS}&nbsp;Monate
              nach der Abreise automatisch gelöscht
              {deletionPreview ? `, also am ${formatDate(deletionPreview)}` : ""}.
            </p>
          )}
        </>
      )}

      {fehler && fehler.feld === null && (
        <p
          id="eintrag-fehler"
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-klein text-destructive"
        >
          {fehler.text}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Wird gespeichert …" : SUBMIT_LABELS[kind]}
      </Button>
    </form>
  );
}
