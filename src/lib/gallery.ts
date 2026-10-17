export type GalleryImage = {
  readonly src: string;
  readonly alt: string;
  /** Kurzform für den Vorschaustreifen unter der Galerie. */
  readonly raum: string;
};

/**
 * Alle verfügbaren Aufnahmen der Wohnung, in der Reihenfolge, in der ein Gast
 * sie sehen soll: erst der Gesamteindruck, dann Raum für Raum.
 *
 * Elf der dreizehn Aufnahmen sind Hochformat. Die Galerie zeigt deshalb 4:5
 * statt eines Querformats – die vier Querformate verlieren dabei links und
 * rechts etwas, was deutlich weniger schmerzt, als bei Hochformaten oben und
 * unten abzuschneiden.
 */
export const GALLERY: readonly GalleryImage[] = [
  {
    src: "/images/haus-garten/haus-garten-01.jpg",
    alt: "Außenansicht des Hauses mit Balkonen und Stellplätzen",
    raum: "Haus",
  },
  {
    src: "/images/wohnen-essen/wohnen-essen-01.jpg",
    alt: "Wohn- und Essbereich mit Esstisch, Ecksofa und Fernseher",
    raum: "Wohnen",
  },
  {
    src: "/images/wohnen-essen/wohnen-essen-02.jpg",
    alt: "Ecksofa mit Couchtisch im Wohnbereich",
    raum: "Wohnen",
  },
  {
    src: "/images/wohnen-essen/wohnen-essen-03.jpg",
    alt: "Wohn- und Essbereich mit Sideboard, Fernseher und Balkontür",
    raum: "Wohnen",
  },
  {
    src: "/images/kueche/kueche-01.jpg",
    alt: "Küchenzeile mit Kühlschrank, Spülmaschine, Backofen und Cerankochfeld",
    raum: "Küche",
  },
  {
    src: "/images/schlafzimmer-gross/schlafzimmer-gross-01.jpg",
    alt: "Großes Schlafzimmer mit Doppelbett unter der Dachschräge",
    raum: "Schlafen I",
  },
  {
    src: "/images/schlafzimmer-gross/schlafzimmer-gross-02.jpg",
    alt: "Großes Schlafzimmer mit Blick zur Tür und zum Nebenraum",
    raum: "Schlafen I",
  },
  {
    src: "/images/schlafzimmer-gross/schlafzimmer-gross-03.jpg",
    alt: "Dachfenster im großen Schlafzimmer",
    raum: "Schlafen I",
  },
  {
    src: "/images/schlafzimmer-klein/schlafzimmer-klein-01.jpg",
    alt: "Kleines Schlafzimmer mit zwei Einzelbetten und Kleiderschrank",
    raum: "Schlafen II",
  },
  {
    src: "/images/bad/bad-01.jpg",
    alt: "Bad mit Dusche, WC, Waschbecken und Handtuchheizkörper",
    raum: "Bad",
  },
  {
    src: "/images/bad/bad-02.jpg",
    alt: "Waschbecken mit beleuchtetem Spiegel im Bad",
    raum: "Bad",
  },
  {
    src: "/images/bad/bad-03.jpg",
    alt: "Dusche mit Handtuchheizkörper",
    raum: "Bad",
  },
  {
    src: "/images/flur/flur-01.jpg",
    alt: "Diele mit Blick in den Wohn- und Essbereich",
    raum: "Diele",
  },
];
