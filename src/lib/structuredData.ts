import { GALLERY } from "./gallery";
import { MAX_GUESTS, SEASONS } from "./pricing";
import { ADDRESS, GEO, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

// Nur, was auf der Website auch steht (Ausstattungsseite): Google wertet
// strukturierte Daten, die dem sichtbaren Inhalt widersprechen, als Spam.
const AMENITIES = [
  "Kostenloses WLAN",
  "Eigener Stellplatz",
  "Südwest-Balkon",
  "Voll ausgestattete Küche",
  "Spülmaschine",
  "SAT-TV",
  "Fahrradschuppen",
  "Bollerwagen",
  "Babyreisebett",
  "Kinderhochstuhl",
] as const;

/**
 * schema.org-Beschreibung der Ferienwohnung für die Startseite. Preise und
 * Personenzahl kommen aus `pricing.ts`, damit sie nie von der Preistabelle
 * abweichen.
 */
export function lodgingStructuredData(): Record<string, unknown> {
  const prices = SEASONS.map((season) => season.pricePerNight);

  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/#ferienwohnung`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    email: "kontakt@norddeich-heuler.de",
    image: GALLERY.slice(0, 5).map((bild) => new URL(bild.src, SITE_URL).href),
    address: {
      "@type": "PostalAddress",
      streetAddress: ADDRESS.street,
      postalCode: ADDRESS.postalCode,
      addressLocality: `${ADDRESS.locality}-${ADDRESS.district}`,
      addressRegion: ADDRESS.region,
      addressCountry: ADDRESS.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: GEO.latitude,
      longitude: GEO.longitude,
    },
    priceRange: `${Math.min(...prices)} € – ${Math.max(...prices)} € pro Nacht`,
    currenciesAccepted: "EUR",
    checkinTime: "14:00",
    checkoutTime: "10:00",
    petsAllowed: false,
    amenityFeature: AMENITIES.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    containsPlace: {
      "@type": "Apartment",
      name: `${SITE_NAME} – Ferienwohnung`,
      numberOfBedrooms: 2,
      numberOfBathroomsTotal: 1,
      occupancy: { "@type": "QuantitativeValue", maxValue: MAX_GUESTS },
    },
  };
}
