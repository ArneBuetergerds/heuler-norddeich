/* ---------------------------------------------------------------------------
   Startseite — One-Pager, mobil zuerst
   Designrichtung A "Wattenmeer". Tailwind v4, Tokens aus globals.css.

   Integrationspunkte sind mit {/* ANBINDEN * /} markiert: dort hängen der
   bestehende Datepicker, das Anfrageformular und die Kalenderdaten dran.
   Die Logik bleibt unverändert — hier steht nur die Darstellung.
   --------------------------------------------------------------------------- */

import Image from "next/image";
import { BelegungsKalender } from "@/components/belegungs-kalender";

const SAISONS = [
  { name: "Hauptsaison", zeitraum: "01.07. – 31.08.", preis: "[XX] €" },
  { name: "Sommer-Zwischensaison", zeitraum: "01.06. – 30.06. · 01.09. – 30.09.", preis: "[XX] €" },
  { name: "Ostern & Pfingsten", zeitraum: "Feiertagszeiträume", preis: "[XX] €" },
  { name: "Nebensaison", zeitraum: "01.04. – 31.05. · 01.10. – 31.10.", preis: "[XX] €" },
  { name: "Winter", zeitraum: "01.11. – 20.12. · 06.01. – 31.03.", preis: "[XX] €" },
  { name: "Weihnachten & Silvester", zeitraum: "21.12. – 05.01.", preis: "[XX] €" },
];

const NEBENKOSTEN = [
  { posten: "Endreinigung", betrag: "[XX] €" },
  { posten: "Bettwäsche & Handtücher", betrag: "[XX] € p. P." },
  { posten: "Strom, Wasser, Heizung", betrag: "inklusive" },
  { posten: "Kurtaxe Norddeich", betrag: "nach Satzung" },
];

export default function Startseite() {
  return (
    <>
      {/* --- Kopfzeile ---------------------------------------------------- */}
      <header className="sticky top-0 z-50 border-b border-linie bg-muschel">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex flex-col gap-0.5 no-underline">
            <span className="font-display text-[23px] leading-none text-schlick">Heuler</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-schlick-2">
              Ferienwohnung · Norddeich
            </span>
          </a>

          <nav aria-label="Hauptnavigation" className="hidden items-center gap-8 md:flex">
            <a href="/" className="text-klein text-schlick no-underline hover:text-priel">Start</a>
            <a href="/ausstattung" className="text-klein text-schlick no-underline hover:text-priel">Ausstattung</a>
            <a href="/lage" className="text-klein text-schlick no-underline hover:text-priel">Lage</a>
            <a href="/kontakt" className="text-klein text-schlick no-underline hover:text-priel">Kontakt</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Menü öffnen"
              className="grid size-11 place-items-center md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <a
              href="#anfrage"
              className="flex h-11 items-center rounded-pille bg-priel px-5 text-sm font-semibold text-muschel no-underline hover:bg-priel-tief"
            >
              Anfragen
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* --- Galerie ---------------------------------------------------- */}
        {/* 4:5 mobil statt 4:3 — elf der dreizehn Aufnahmen sind Hochformat.
            Ab Tablet 3:2, damit die Querformate nicht beschnitten werden. */}
        <section aria-label="Bildergalerie" className="relative">
          <div className="relative aspect-[4/5] w-full bg-priel-hell md:aspect-[3/2]">
            <Image
              src="/bilder/wohnbereich.jpg"
              alt="Wohn- und Essbereich der Ferienwohnung"
              fill
              priority
              sizes="(min-width: 768px) 100vw, 100vw"
              className="object-cover"
            />
            {/* ANBINDEN: Wisch-Logik und Bildliste bleiben wie bisher. */}
            <button
              type="button"
              aria-label="Vorheriges Bild"
              className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-pille bg-muschel text-priel-tief"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
            </button>
            <button
              type="button"
              aria-label="Nächstes Bild"
              className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-pille bg-muschel text-priel-tief"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <p className="absolute bottom-4 right-5 text-[11px] font-semibold tracking-wider text-priel-tief">
              1 / 13
            </p>
          </div>

          {/* Streifen aus Hochformat-Vorschauen: macht aus der Schwäche
              (viele Hochkantbilder) ein Ordnungsmerkmal. */}
          <div className="flex gap-2 overflow-x-auto border-b border-linie bg-muschel px-5 py-3">
            {["Wohnen", "Küche", "Schlafen I", "Schlafen II", "Bad"].map((raum, i) => (
              <button
                key={raum}
                type="button"
                aria-label={`Bild ${i + 1}: ${raum}`}
                className={[
                  "h-[75px] w-[60px] shrink-0 rounded-xs bg-track",
                  i === 0 ? "ring-2 ring-priel" : "",
                ].join(" ")}
              />
            ))}
          </div>
        </section>

        {/* --- Einführung -------------------------------------------------- */}
        <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
          <p className="text-label font-semibold uppercase text-priel">
            Norddeich · Ostfriesland
          </p>
          <h1 className="mt-4 text-h1 text-schlick md:text-display">
            Willkommen in der Ferienwohnung Heuler
          </h1>
          <p className="mt-4 text-body text-schlick-2">
            Zwei Schlafzimmer, Küche, Bad und Diele — privat vermietet, ohne
            Agentur. Sie fragen unverbindlich an, ich melde mich persönlich
            zurück.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#anfrage"
              className="flex h-14 items-center justify-center rounded-pille bg-priel px-8 text-base font-semibold text-muschel no-underline hover:bg-priel-tief"
            >
              Zeitraum anfragen
            </a>
            <a
              href="#preise"
              className="flex h-11 items-center justify-center px-2 text-klein font-medium text-priel"
            >
              Preise &amp; Nebenkosten ansehen
            </a>
          </div>
        </section>

        {/* --- Verfügbarkeit & Anfrage ------------------------------------- */}
        <section
          id="anfrage"
          className="border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-xl"
        >
          <div className="mx-auto max-w-6xl">
            <p className="text-label font-semibold uppercase text-priel">Verfügbarkeit</p>
            <h2 className="mt-3 text-h2 text-schlick">Ist Ihr Termin frei?</h2>

            {/* Mobil gestapelt, ab Tablet Kalender links, Formular rechts. */}
            <div className="mt-8 grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
              {/* ANBINDEN: monate/onZurueck/onVor aus dem bestehenden State. */}
              <BelegungsKalender monate={[]} onZurueck={() => {}} onVor={() => {}} />

              <form className="flex flex-col gap-5">
                <h3 className="font-display text-h3 text-schlick">
                  Unverbindlich anfragen
                </h3>

                <Feld id="zeitraum" label="Zeitraum">
                  {/* ANBINDEN: bestehender Datepicker öffnet sich hier. */}
                  <input
                    id="zeitraum"
                    name="zeitraum"
                    type="text"
                    readOnly
                    defaultValue="12.09.2026 – 19.09.2026"
                    className={FELD}
                  />
                </Feld>

                <Feld id="name" label="Name">
                  <input id="name" name="name" type="text" required autoComplete="name" placeholder="Vor- und Nachname" className={FELD} />
                </Feld>

                <Feld id="mail" label="E-Mail">
                  <input id="mail" name="mail" type="email" required autoComplete="email" placeholder="name@beispiel.de" className={FELD} />
                </Feld>

                <Feld id="tel" label="Telefon" optional>
                  <input id="tel" name="tel" type="tel" autoComplete="tel" className={FELD} />
                </Feld>

                <Feld id="nachricht" label="Nachricht" optional>
                  <textarea
                    id="nachricht"
                    name="nachricht"
                    rows={4}
                    placeholder="Anzahl Personen, Fragen zur Wohnung …"
                    className={`${FELD} h-auto resize-none py-3.5`}
                  />
                </Feld>

                <div className="flex items-start gap-3">
                  <input
                    id="dsgvo"
                    name="dsgvo"
                    type="checkbox"
                    required
                    className="mt-0.5 size-[22px] shrink-0 accent-priel"
                  />
                  <label htmlFor="dsgvo" className="text-mikro text-schlick-2">
                    Ich habe die{" "}
                    <a href="/datenschutz" className="text-priel">Datenschutzerklärung</a>{" "}
                    gelesen und bin mit der Verarbeitung meiner Angaben zur
                    Bearbeitung der Anfrage einverstanden.
                  </label>
                </div>

                <button
                  type="submit"
                  className="h-14 rounded-pille bg-priel text-base font-semibold text-muschel hover:bg-priel-tief"
                >
                  Anfrage senden
                </button>

                <p className="text-center text-mikro text-schlick-2">
                  Unverbindlich — keine Onlinebuchung, keine Zahlung. Sie
                  erhalten eine persönliche Antwort, in der Regel innerhalb von
                  [X] Stunden.
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* --- An- und Abreise --------------------------------------------- */}
        <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
          <h2 className="text-h2 text-schlick">An- und Abreise</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { was: "Anreise", wann: "ab 14 Uhr" },
              { was: "Abreise", wann: "bis 10 Uhr" },
            ].map(({ was, wann }) => (
              <div key={was} className="rounded-card border border-linie bg-muschel p-5">
                <p className="text-label font-semibold uppercase text-schlick-2">{was}</p>
                <p className="mt-1.5 font-display text-[34px] leading-none text-schlick">{wann}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-klein text-schlick-2">
            Schlüsselübergabe persönlich. Spätere Anreise nach Absprache —
            schreiben Sie es einfach in die Anfrage.
          </p>
        </section>

        {/* --- Preise ------------------------------------------------------- */}
        {/* Kein Querscrollen: mobil Name und Zeitraum übereinander mit
            rechtsbündigem Preis, ab 768 px die dreispaltige Tabelle. */}
        <section
          id="preise"
          className="border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-xl"
        >
          <div className="mx-auto max-w-4xl">
            <h2 className="text-h2 text-schlick">Preise</h2>
            <p className="mt-2 text-klein text-schlick-2">
              pro Nacht, bis [ANZAHL] Personen · Mindestaufenthalt [X] Nächte
            </p>

            <table className="mt-6 w-full border-collapse">
              <caption className="sr-only">Übernachtungspreise nach Saison</caption>
              <thead className="hidden md:table-header-group">
                <tr>
                  <th className="pb-3 text-left text-label font-semibold uppercase text-schlick-2">Saison</th>
                  <th className="pb-3 text-left text-label font-semibold uppercase text-schlick-2">Zeitraum</th>
                  <th className="pb-3 text-right text-label font-semibold uppercase text-schlick-2">pro Nacht</th>
                </tr>
              </thead>
              <tbody>
                {SAISONS.map((s) => (
                  <tr
                    key={s.name}
                    className="flex items-baseline justify-between gap-4 border-t border-linie py-4 md:table-row md:py-0"
                  >
                    <th
                      scope="row"
                      className="text-left text-klein font-medium text-schlick md:border-t md:border-linie md:py-4 md:align-baseline md:text-body"
                    >
                      {s.name}
                      {/* Zeitraum mobil unter dem Namen, ab Tablet eigene Spalte */}
                      <span className="mt-1 block text-mikro font-normal text-schlick-2 md:hidden">
                        {s.zeitraum}
                      </span>
                    </th>
                    <td className="hidden text-klein text-schlick-2 md:table-cell md:border-t md:border-linie md:py-4 md:align-baseline">
                      {s.zeitraum}
                    </td>
                    <td className="text-right md:border-t md:border-linie md:py-4 md:align-baseline">
                      <span className="whitespace-nowrap font-display text-2xl text-schlick tabular-nums">
                        {s.preis}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-schlick-2 md:hidden">
                        pro Nacht
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Nebenkosten bewusst abgesetzt: sie fallen einmalig an, nicht pro
                Nacht. Das ist die häufigste Rückfrage. */}
            <div className="mt-6 rounded-card bg-priel-hell p-5">
              <p className="text-label font-semibold uppercase text-priel-tief">Einmalig dazu</p>
              <dl className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-x-8">
                {NEBENKOSTEN.map(({ posten, betrag }) => (
                  <div key={posten} className="flex justify-between gap-4 text-klein text-schlick">
                    <dt>{posten}</dt>
                    <dd className="font-medium">{betrag}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* --- Kurkarte ----------------------------------------------------- */}
        <section className="bg-priel-hell px-5 py-sektion-m md:py-sektion-l">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-h2 text-schlick">Die Kurkarte</h2>
            <p className="mt-4 text-body text-priel-tief">
              Mit der Kurtaxe erhalten Sie die Kurkarte für Norddeich. Sie
              bekommen sie bei der Anreise von mir.
            </p>
            <ul className="mt-5 flex flex-col gap-3">
              {[
                "Freier Zugang zu den Stränden",
                "Ermäßigungen bei [EINRICHTUNG]",
                "[WEITERER VORTEIL]",
              ].map((vorteil) => (
                <li key={vorteil} className="flex items-start gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-priel-tief" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="text-body text-schlick">{vorteil}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-card bg-muschel p-5">
              <p className="text-label font-semibold uppercase text-schlick-2">Zuständig</p>
              <p className="mt-2 text-body font-medium text-schlick">[BEHÖRDE / KURVERWALTUNG]</p>
              <p className="mt-1 text-klein text-schlick-2">
                [STRASSE], 26506 Norden-Norddeich
                <br />
                [TELEFON]
              </p>
            </div>
          </div>
        </section>

        {/* --- Teaser ------------------------------------------------------- */}
        <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { href: "/ausstattung", titel: "Ausstattung", text: "Was da ist, und was nicht — ehrlich aufgelistet." },
              { href: "/lage", titel: "Lage", text: "Entfernungen zu Strand, Deich, Hafen und Einkauf." },
            ].map(({ href, titel, text }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-4 rounded-card border border-linie bg-muschel p-4 no-underline"
              >
                <span className="h-40 w-30 shrink-0 rounded-sm bg-track" aria-hidden="true" />
                <span className="flex flex-col gap-2">
                  <span className="font-display text-2xl text-schlick">{titel}</span>
                  <span className="text-mikro text-schlick-2">{text}</span>
                  <span className="text-mikro font-semibold text-priel">Ansehen</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* --- Vermieterin -------------------------------------------------- */}
        <section className="bg-schlick px-5 py-sektion-m md:py-sektion-l">
          <div className="mx-auto max-w-2xl">
            <p className="text-label font-semibold uppercase text-duenengras">Ihre Vermieterin</p>
            <h2 className="mt-4 text-h2 text-muschel">[VORNAME NACHNAME]</h2>
            <p className="mt-4 text-body text-priel-hell">
              Die Wohnung gehört mir, ich vermiete sie selbst. Keine Agentur,
              keine Provision, keine automatische Bestätigung — jede Anfrage
              beantworte ich persönlich.
            </p>
            <a
              href="/kontakt"
              className="mt-8 flex h-13 w-full items-center justify-center rounded-pille bg-duenengras px-8 text-base font-semibold text-schlick no-underline sm:w-auto sm:self-start"
            >
              Kontakt aufnehmen
            </a>
          </div>
        </section>
      </main>

      {/* --- Fußzeile ------------------------------------------------------- */}
      <footer className="border-t border-linie px-5 py-sektion-s">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-[22px] leading-none text-schlick">Heuler</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-schlick-2">
              Ferienwohnung · Norddeich
            </span>
          </div>
          <address className="not-italic text-klein text-schlick-2">
            [STRASSE HAUSNUMMER]
            <br />
            26506 Norden-Norddeich
          </address>
          <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="/kontakt" className="text-klein text-priel no-underline">Kontakt</a>
            <a href="/impressum" className="text-klein text-priel no-underline">Impressum</a>
            <a href="/datenschutz" className="text-klein text-priel no-underline">Datenschutz</a>
          </nav>
          <p className="text-mikro text-schlick-3">
            Keine Cookies, kein Tracking, keine externen Dienste.
          </p>
        </div>
      </footer>
    </>
  );
}

/* --- Hilfen --------------------------------------------------------------- */

const FELD =
  "h-13 w-full rounded-sm border border-linie bg-sand px-4 text-base text-schlick placeholder:text-schlick-3";

function Feld({
  id,
  label,
  optional,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-mikro font-medium text-schlick-2">
        {label}
        {optional && <span className="text-schlick-3"> — optional</span>}
      </label>
      {children}
    </div>
  );
}
