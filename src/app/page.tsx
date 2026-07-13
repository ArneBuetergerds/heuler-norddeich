import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">
        Ferienwohnung „Heuler" in Norddeich
      </h1>
      <p>
        Willkommen in unserer gemütlichen Ferienwohnung direkt in Norddeich –
        ideal für einen erholsamen Urlaub an der ostfriesischen Nordseeküste. Nur
        wenige Gehminuten trennen Sie von der Seehundstation, dem Deich und dem
        Hafen.
      </p>
      <Image
        src="/images/haus-garten/haus-garten-01.jpg"
        alt="Außenansicht der Ferienwohnung Heuler"
        width={1200}
        height={800}
        className="rounded-lg"
      />
      <p>
        Auf den folgenden Seiten finden Sie Details zur{" "}
        <Link href="/ausstattung" className="underline">
          Ausstattung
        </Link>
        , zur{" "}
        <Link href="/lage" className="underline">
          Lage
        </Link>{" "}
        und können direkt die{" "}
        <Link href="/verfuegbarkeit" className="underline">
          Verfügbarkeit prüfen und anfragen
        </Link>
        .
      </p>
    </div>
  );
}
