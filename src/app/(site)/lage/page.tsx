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
  { name: "Spielplatz", distance: "1 Gehminute", tone: "nah" },
  {
    name: "Seehundstation, Kinderspielhaus, Mini Golf & Labyrinth",
    distance: "2 Gehminuten",
    tone: "nah",
  },
  { name: "Schwimmbad & Kurpark", distance: "3 Gehminuten", tone: "fusslaeufig" },
  {
    name: "Supermarkt & Restaurants",
    distance: "5 Gehminuten",
    tone: "fusslaeufig",
  },
  { name: "Sandstrand", distance: "10 Gehminuten", tone: "neutral" },
];

const ACTIVITIES_VOR_ORT: readonly string[] = [
  "Seehundstation",
  'Schwimmbad "Ocean Wave"',
  "Wattwanderungen",
  "Fährfahrten zu den Ostfriesischen Inseln",
  "Kinderspielhaus, Irrgarten & Mini Golf",
  "Segway-Touren & Mini-Zugfahrten",
  "Sandstrand & Fahrradverleih",
  "Reiten & Swing Golf",
];

const ACTIVITIES_IN_DER_NAEHE: readonly string[] = [
  "Waloseum",
  "Spielzeug- und Automuseum",
  "Teemuseum",
  "Historische Eisenbahn",
  "Bootsfahrten zu den Seehundbänken",
  "Stadt Norden",
  "Greetsiel (Fischerort)",
  "Historische Mühlen",
];

const ADDRESS = "Ankerweg 6, 26506 Norden";

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
        Norddeich ist ein Stadtteil der Stadt Norden im Nordwesten Ostfrieslands
        und seit 2010 anerkanntes Nordseeheilbad – vom Ruhrgebiet aus in unter
        3 Stunden erreichbar. Die Wohnung liegt im Ankerweg mitten im Zentrum,
        alles Wichtige ist bequem zu Fuß erreichbar.
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

      <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-[17px] font-bold">Anfahrt</h2>
        <p className="mb-3 text-[13px] text-zinc-500">{ADDRESS}</p>
        <div className="overflow-hidden rounded-lg">
          <iframe
            src={`https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`}
            className="h-[340px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Kartenausschnitt: ${ADDRESS}`}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 rounded-xl border bg-card p-6 shadow-sm sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-[17px] font-bold">Freizeit in Norddeich</h2>
          <ul className="list-disc pl-5 text-[13px] text-zinc-600 marker:text-zinc-400">
            {ACTIVITIES_VOR_ORT.map((activity) => (
              <li key={activity}>{activity}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-[17px] font-bold">In der Nähe</h2>
          <ul className="list-disc pl-5 text-[13px] text-zinc-600 marker:text-zinc-400">
            {ACTIVITIES_IN_DER_NAEHE.map((activity) => (
              <li key={activity}>{activity}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
