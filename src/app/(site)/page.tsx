import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const TEASER_CARD_CLASS =
  "block overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-zinc-300";

export default function HomePage() {
  return (
    <section>
      <div className="mx-auto max-w-[1120px] px-6 pt-12">
        <div className="relative h-[440px] w-full overflow-hidden rounded-2xl">
          <Image
            src="/images/haus-garten/haus-garten-01.jpg"
            alt="Außenansicht der Ferienwohnung Heuler mit Garten"
            fill
            priority
            sizes="(max-width: 1120px) 100vw, 1120px"
            className="object-cover"
          />
        </div>
      </div>

      <div className="mx-auto max-w-[760px] px-6 pt-10 pb-2 text-center">
        <h1 className="mb-4 text-[38px] font-extrabold tracking-tight">
          Willkommen in der Ferienwohnung Heuler
        </h1>
        <p className="mb-7 text-base text-zinc-600">
          Mitten in Norddeich, nur wenige Gehminuten von der Seehundstation
          entfernt: gemütliche Wohnung für bis zu vier Personen mit
          Südwest-Balkon – ideal für erholsame Tage an der ostfriesischen Küste.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/verfuegbarkeit">Verfügbarkeit prüfen</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/ausstattung">Ausstattung ansehen</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-5 px-6 pt-12 pb-20 sm:grid-cols-3">
        <Link href="/ausstattung" className={TEASER_CARD_CLASS}>
          <div className="relative h-[150px] w-full">
            <Image
              src="/images/wohnen-essen/wohnen-essen-01.jpg"
              alt="Wohnzimmer mit Ecksofa"
              fill
              sizes="(max-width: 640px) 100vw, 360px"
              className="object-cover"
            />
          </div>
          <div className="p-[18px]">
            <h3 className="mb-1.5 text-[15px] font-bold">Ausstattung</h3>
            <p className="text-[13px] text-muted-foreground">
              Zwei Schlafzimmer, moderne Küche und ein gemütlicher Wohnbereich
              mit Ecksofa.
            </p>
          </div>
        </Link>

        <Link href="/lage" className={TEASER_CARD_CLASS}>
          <div className="relative h-[150px] w-full">
            <Image
              src="/images/umgebung/umgebung-01.jpg"
              alt="Deich bei Norddeich"
              fill
              sizes="(max-width: 640px) 100vw, 360px"
              className="object-cover"
            />
          </div>
          <div className="p-[18px]">
            <h3 className="mb-1.5 text-[15px] font-bold">Lage</h3>
            <p className="text-[13px] text-muted-foreground">
              Zentral in Norddeich – fußläufig zu Seehundstation, Strand,
              Schwimmbad und Supermarkt.
            </p>
          </div>
        </Link>

        <Link href="/verfuegbarkeit" className={TEASER_CARD_CLASS}>
          <div className="flex h-[150px] w-full items-center justify-center bg-zinc-100">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              className="text-zinc-400"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
          </div>
          <div className="p-[18px]">
            <h3 className="mb-1.5 text-[15px] font-bold">
              Verfügbarkeit &amp; Anfrage
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Kalender prüfen und unverbindlich Ihren Wunschtermin anfragen.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}
