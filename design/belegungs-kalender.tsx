/* ---------------------------------------------------------------------------
   Belegungskalender — Bandmodell statt Diagonale
   Rein darstellend. Die Belegungslogik bleibt, wo sie ist; diese Komponente
   bekommt fertige Tage und zeichnet sie.

   Die Idee: unter jeder Tageszahl liegt eine Schiene. Der belegte Zeitraum
   liegt als Band darin und beginnt am Anreisetag in der Tagesmitte, endet am
   Abreisetag in der Tagesmitte. Dadurch fallen die vier Zustände von selbst an:

     leere Schiene        frei
     volles Band          belegt oder gesperrt
     linke Hälfte         Abreisetag  — nachmittags wieder frei
     rechte Hälfte        Anreisetag  — vormittags noch frei
     beide Hälften        Wechseltag  — Abreise bis 10 Uhr, Anreise ab 14 Uhr
     blasse Schiene       vergangen

   Über die Woche hinweg wächst daraus ein Zeitstrahl: man sieht auf einen
   Blick, ob eine Lücke für den eigenen Zeitraum überhaupt groß genug ist.
   --------------------------------------------------------------------------- */

export interface Kalendertag {
  /** ISO-Datum, z. B. "2026-09-27" */
  datum: string;
  /** Der ganze Tag ist belegt (weder An- noch Abreise möglich). */
  belegt: boolean;
  /** An diesem Tag zieht ein Gast ein — ab 14 Uhr belegt. */
  anreise: boolean;
  /** An diesem Tag reist ein Gast ab — bis 10 Uhr belegt. */
  abreise: boolean;
  /** Liegt vor heute. */
  vergangen: boolean;
  /** Heute. */
  heute?: boolean;
}

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/* --- Eine Zelle ----------------------------------------------------------- */

function Tag({ tag }: { tag: Kalendertag | null }) {
  if (!tag) {
    // Leerzelle vor dem Monatsersten — behält die Rasterbreite.
    return <div aria-hidden="true" className="h-[54px]" />;
  }

  const datum = new Date(tag.datum);
  const nummer = datum.getDate();

  const zustand = tag.vergangen
    ? "vergangen"
    : tag.belegt
      ? "belegt"
      : tag.anreise && tag.abreise
        ? "Wechseltag, Abreise bis 10 Uhr, Anreise ab 14 Uhr"
        : tag.abreise
          ? "Abreisetag, ab 14 Uhr wieder frei"
          : tag.anreise
            ? "Anreisetag, bis 10 Uhr noch frei"
            : "frei";

  return (
    <div className="flex h-[54px] flex-col items-center justify-center gap-2">
      <time
        dateTime={tag.datum}
        aria-label={`${nummer}. — ${zustand}`}
        className={[
          "text-[15px] tabular-nums",
          tag.vergangen
            ? "font-normal text-schlick-3"
            : tag.heute
              ? "font-semibold text-priel-tief"
              : "font-normal text-schlick",
        ].join(" ")}
      >
        {nummer}
      </time>

      {/* Schiene. Kein Gap zwischen den Zellen, damit die Bänder
          benachbarter Tage zu einem durchgehenden Strang zusammenwachsen. */}
      <div
        className={[
          "relative h-2.5 w-full rounded-band",
          tag.vergangen ? "bg-track-alt" : "bg-track",
        ].join(" ")}
      >
        {tag.belegt && <span className="absolute inset-0 bg-priel" />}
        {tag.abreise && !tag.belegt && (
          <span className="absolute inset-y-0 left-0 w-[calc(50%-2px)] rounded-l-band bg-priel" />
        )}
        {tag.anreise && !tag.belegt && (
          <span className="absolute inset-y-0 right-0 w-[calc(50%-2px)] rounded-r-band bg-priel" />
        )}
      </div>
    </div>
  );
}

/* --- Monatsraster --------------------------------------------------------- */

export function Monat({ tage, titel }: { tage: Kalendertag[]; titel: string }) {
  // Führende Leerzellen bis zum ersten Wochentag (Woche beginnt Montag).
  const ersterTag = new Date(tage[0]!.datum);
  const vorlauf = (ersterTag.getDay() + 6) % 7;
  const zellen: (Kalendertag | null)[] = [
    ...Array.from({ length: vorlauf }, () => null),
    ...tage,
  ];

  return (
    <div className="flex-1">
      <h3 className="sr-only">{titel}</h3>
      <div className="grid grid-cols-7">
        {WOCHENTAGE.map((tag) => (
          <span
            key={tag}
            className="pb-2 text-center text-label font-semibold uppercase text-schlick-2"
          >
            {tag}
          </span>
        ))}
        {zellen.map((tag, i) => (
          <Tag key={tag?.datum ?? `leer-${i}`} tag={tag} />
        ))}
      </div>
    </div>
  );
}

/* --- Legende -------------------------------------------------------------- */

export function Legende() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[42rem] text-klein text-priel-tief">
        Das Band zeigt den belegten Zeitraum. Es beginnt am Anreisetag mittags
        und endet am Abreisetag mittags — die offene Tageshälfte bleibt buchbar.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-10">
        <li className="flex items-center gap-3">
          <span className="h-2.5 w-14 shrink-0 rounded-band bg-track" />
          <span className="text-mikro">frei — An- und Abreise möglich</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-2.5 w-14 shrink-0 rounded-band bg-priel" />
          <span className="text-mikro">belegt oder gesperrt</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="relative h-2.5 w-14 shrink-0 rounded-band bg-track">
            <span className="absolute inset-y-0 left-0 w-[calc(50%-2px)] rounded-l-band bg-priel" />
          </span>
          <span className="text-mikro">
            Wechseltag — Abreise bis 10 Uhr, Anreise ab 14 Uhr
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-2.5 w-14 shrink-0 rounded-band bg-track-alt" />
          <span className="text-mikro text-schlick-2">vergangen</span>
        </li>
      </ul>
    </div>
  );
}

/* --- Kalender ------------------------------------------------------------- */

export function BelegungsKalender({
  monate,
  onZurueck,
  onVor,
}: {
  monate: { titel: string; tage: Kalendertag[] }[];
  onZurueck: () => void;
  onVor: () => void;
}) {
  return (
    <section
      aria-label="Belegungskalender"
      className="rounded-card border border-linie bg-muschel p-5 sm:p-7"
    >
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onZurueck}
          aria-label="Vorheriger Monat"
          className="grid size-11 place-items-center rounded-pille border border-linie text-priel-tief"
        >
          <ChevronLinks />
        </button>
        <div className="flex gap-10 sm:gap-18">
          {monate.map((m) => (
            <span key={m.titel} className="font-display text-h3">
              {m.titel}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onVor}
          aria-label="Nächster Monat"
          className="grid size-11 place-items-center rounded-pille border border-linie text-priel-tief"
        >
          <ChevronRechts />
        </button>
      </div>

      {/* Mobil ein Monat, ab Tablet zwei nebeneinander. */}
      <div className="flex gap-10">
        {monate.map((m, i) => (
          <div key={m.titel} className={i > 0 ? "hidden flex-1 md:block" : "flex-1"}>
            <Monat titel={m.titel} tage={m.tage} />
          </div>
        ))}
      </div>

      <hr className="my-6 border-linie" />
      <Legende />
    </section>
  );
}

function ChevronLinks() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}

function ChevronRechts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Hinweis zur Datenherkunft

   Das Bandmodell braucht eine Information mehr als der bisherige Zustand
   "Übergabetag": ob der halbe Tag eine Abreise, eine Anreise oder beides ist.
   Aus Buchungszeiträumen ist das direkt ableitbar — ein Umbau der Logik ist
   nicht nötig, nur diese Projektion:

     function tageAusBuchungen(
       buchungen: { von: string; bis: string }[],
       monatsTage: string[],
       heute: string,
     ): Kalendertag[] {
       return monatsTage.map((datum) => ({
         datum,
         belegt:   buchungen.some((b) => datum > b.von && datum < b.bis),
         anreise:  buchungen.some((b) => datum === b.von),
         abreise:  buchungen.some((b) => datum === b.bis),
         vergangen: datum < heute,
         heute:     datum === heute,
       }));
     }

   Gesperrte Zeiträume (Eigennutzung, Renovierung) laufen als Buchung ohne
   Gast mit und werden automatisch als volles Band gezeichnet.
   --------------------------------------------------------------------------- */
