import Image from "next/image";
import { Badge } from "@/components/ui/badge";

type Tone = "nah" | "fusslaeufig" | "neutral";

type Place = {
  readonly name: string;
  readonly distance: string;
  readonly tone: Tone;
};

// Die Vorlage hebt die Entfernungen farblich ab; shadcn-Badge kennt dafür
// keine Variante, daher hier als bewusste Ausnahme rohe Farbklassen.
const TONE_CLASS: Record<Tone, string> = {
  nah: "border-green-200 bg-green-50 text-green-800",
  fusslaeufig: "border-indigo-200 bg-indigo-50 text-indigo-800",
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
};

const PLACES: readonly Place[] = [
  { name: "Seehundstation", distance: "~2 Gehminuten", tone: "nah" },
  { name: "Schwimmbad", distance: "fußläufig", tone: "fusslaeufig" },
  { name: "Spielplatz", distance: "fußläufig", tone: "fusslaeufig" },
  {
    name: "Restaurants & Supermarkt",
    distance: "fußläufig",
    tone: "fusslaeufig",
  },
  { name: "Deich & Park", distance: "zum Spazieren", tone: "neutral" },
];

export default function LagePage() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-14 pb-20">
      <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Lage
      </p>
      <h1 className="mb-3 text-[32px] font-extrabold tracking-tight">
        Zentral in Norddeich
      </h1>
      <p className="mb-8 max-w-[640px] text-[15px] text-zinc-600">
        Die Wohnung liegt mitten in Norddeich – alles Wichtige ist bequem zu Fuß
        erreichbar.
      </p>

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[1.1fr_1fr]">
        <div className="relative h-[340px] overflow-hidden rounded-2xl">
          <Image
            src="/images/umgebung/umgebung-02.jpg"
            alt="Umgebung der Ferienwohnung: Deich und Nordseeküste bei Norddeich"
            fill
            sizes="(max-width: 768px) 100vw, 580px"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col gap-3">
          {PLACES.map((place) => (
            <div
              key={place.name}
              className="flex items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3.5"
            >
              <span className="text-sm font-semibold">{place.name}</span>
              <Badge variant="outline" className={TONE_CLASS[place.tone]}>
                {place.distance}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
