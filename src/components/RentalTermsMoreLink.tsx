import type { ComponentProps } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Einheitlicher, dezenter Verweis auf einen Abschnitt der Mietbedingungen –
 * unter FAQ-Antworten und unter den Stornobedingungen der Startseite.
 * Sichtbar steht überall „Mehr in den Mietbedingungen“; das Thema hängt nur
 * für Screenreader an, damit mehrere Links auf einer Seite unterscheidbar
 * bleiben. Mit `target="_blank"` (Startseite, dort steht das ausgefüllte
 * Anfrageformular) wird der neue Tab angesagt.
 */
export function RentalTermsMoreLink({
  href,
  thema,
  target,
  rel,
}: {
  /** z. B. `rentalTermsHref("zahlung")` */
  href: string;
  /** Abschnitt, auf den verwiesen wird, z. B. „Zahlung“ – nur für Screenreader. */
  thema: string;
} & Pick<ComponentProps<"a">, "target" | "rel">) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className="inline-flex min-h-11 items-center gap-1 text-klein font-medium text-priel underline-offset-2 hover:underline sm:min-h-0"
    >
      Mehr in den Mietbedingungen
      <span className="sr-only">
        : {thema}
        {target === "_blank" && " (öffnet in neuem Tab)"}
      </span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </Link>
  );
}
