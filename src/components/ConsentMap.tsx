"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Zwei-Klick-Lösung für die Google-Maps-Einbindung: Das iframe wird erst nach
 * einem ausdrücklichen Klick gerendert. Vorher besteht keine Verbindung zu
 * Google, es fließt also weder die IP-Adresse des Besuchers ab noch werden
 * Cookies gesetzt – § 25 Abs. 1 TDDDG verlangt dafür eine Einwilligung.
 *
 * Die Zustimmung wird bewusst nicht gespeichert: Sie in localStorage abzulegen
 * wäre ein weiterer Zugriff auf die Endeinrichtung, und der Nutzen (Karte
 * bleibt über Seitenaufrufe hinweg offen) wiegt die zusätzliche Erklärungs-
 * pflicht nicht auf.
 */
export function ConsentMap({ address }: { address: string }) {
  const [loaded, setLoaded] = useState(false);
  const query = encodeURIComponent(address);

  if (loaded) {
    return (
      <div className="overflow-hidden rounded-card">
        <iframe
          src={`https://www.google.com/maps?q=${query}&output=embed`}
          className="h-[340px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Kartenausschnitt: ${address}`}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-linie bg-muschel px-6 text-center">
      <MapPin className="size-7 text-schlick-3" aria-hidden />
      <p className="max-w-[420px] text-klein text-schlick-2">
        Hier lässt sich eine Karte von Google Maps laden. Dabei werden Daten an
        Google übertragen – unter anderem Ihre IP-Adresse. Näheres in unserer{" "}
        <a href="/datenschutz" className="underline hover:no-underline">
          Datenschutzerklärung
        </a>
        .
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => setLoaded(true)}>
          Karte laden
        </Button>
        <Button asChild variant="outline">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${query}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            In Google Maps öffnen
          </a>
        </Button>
      </div>
    </div>
  );
}
