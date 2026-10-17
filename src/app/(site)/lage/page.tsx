import { Badge } from "@/components/ui/badge";
import { ConsentMap } from "@/components/ConsentMap";
import { pageMetadata } from "@/lib/site";

type Tone = "nah" | "fusslaeufig" | "neutral";

type Place = {
  readonly name: string;
  readonly distance: string;
  readonly tone: Tone;
};

// Die Entfernungen sind nach Nähe abgestuft: je dichter, desto kräftiger.
// shadcn-Badge kennt dafür keine Variante, daher hier eigene Klassen.
const TONE_CLASS: Record<Tone, string> = {
  nah: "border-transparent bg-priel text-muschel",
  fusslaeufig: "border-transparent bg-priel-hell text-priel-tief",
  neutral: "border-linie bg-sand text-schlick-2",
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

export const metadata = pageMetadata({
  title: "Lage",
  description:
    "Zentral in Norddeich: wenige Gehminuten zu Seehundstation, Schwimmbad, Kurpark, Einkauf und Sandstrand – mit Karte, Aktivitäten und Ausflugszielen.",
  path: "/lage",
});

export default function LagePage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <p className="text-label font-semibold uppercase text-priel">Lage</p>
        <h1 className="mt-4 text-h1 text-schlick">Zentral in Norddeich</h1>
        <p className="mt-4 text-body text-schlick-2">
          Norddeich ist ein Stadtteil der Stadt Norden im Nordwesten
          Ostfrieslands und seit 2010 anerkanntes Nordseeheilbad – vom
          Ruhrgebiet aus in unter 3 Stunden erreichbar. Die Wohnung liegt im
          Ankerweg mitten im Zentrum, alles Wichtige ist bequem zu Fuß
          erreichbar.
        </p>
      </section>

      <section className="border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-l">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-h2 text-schlick">Zu Fuß erreichbar</h2>
          <ul className="mt-5 flex flex-col gap-2.5">
            {PLACES.map((place) => (
              <li
                key={place.name}
                className="flex items-center justify-between gap-4 rounded-sm border border-linie bg-sand px-4 py-3.5"
              >
                <span className="text-klein font-medium text-schlick">{place.name}</span>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-mikro ${TONE_CLASS[place.tone]}`}
                >
                  {place.distance}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <h2 className="text-h2 text-schlick">Anfahrt</h2>
        <p className="mt-2 text-klein text-schlick-2">{ADDRESS}</p>
        <div className="mt-5">
          <ConsentMap address={ADDRESS} />
        </div>
      </section>

      <section className="border-t border-linie bg-muschel px-5 py-sektion-m md:py-sektion-l">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-h2 text-schlick">Freizeit in Norddeich</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {ACTIVITIES_VOR_ORT.map((activity) => (
                <li key={activity} className="text-klein text-schlick-2">
                  {activity}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-h2 text-schlick">In der Nähe</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {ACTIVITIES_IN_DER_NAEHE.map((activity) => (
                <li key={activity} className="text-klein text-schlick-2">
                  {activity}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
