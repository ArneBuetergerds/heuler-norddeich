type PrivacySection = {
  readonly heading: string;
  readonly body: string;
};

// Platzhalter bleiben stehen, bis die echten Betreiberdaten vorliegen.
const SECTIONS: readonly PrivacySection[] = [
  {
    heading: "1. Verantwortlicher",
    body: "[Name des Betreibers], [Anschrift], [E-Mail-Adresse]",
  },
  {
    heading: "2. Verarbeitung bei Buchungsanfragen",
    body: "Beim Absenden des Anfrageformulars verarbeiten wir Name, E-Mail-Adresse, optional Telefonnummer, den gewünschten Anreise- und Abreisezeitraum sowie Ihre Nachricht. Diese Daten werden ausschließlich zur Bearbeitung und Beantwortung Ihrer Buchungsanfrage genutzt und in unserer Datenbank gespeichert.",
  },
  {
    heading: "3. Benachrichtigung",
    body: "Nach Eingang einer Anfrage wird automatisch eine Benachrichtigungs-E-Mail über den eigenen Mailserver an den Betreiber versendet, damit die Anfrage zeitnah bearbeitet werden kann. Es ist kein externer E-Mail-Dienstleister eingebunden.",
  },
  {
    heading: "4. Hosting",
    body: "Diese Website wird auf einem eigenen Server (VPS) betrieben, nicht bei einem externen Cloud-Anbieter. Beim Aufruf der Seite werden technisch bedingt Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt des Zugriffs) auf dieser eigenen Infrastruktur verarbeitet.",
  },
  {
    heading: "5. Ihre Rechte",
    body: "Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten. Wenden Sie sich hierzu an [E-Mail-Adresse].",
  },
  {
    heading: "6. Speicherdauer",
    body: "Anfragedaten werden gelöscht, sobald sie für die Bearbeitung nicht mehr erforderlich sind, spätestens jedoch nach Ablauf gesetzlicher Aufbewahrungsfristen.",
  },
];

export default function DatenschutzPage() {
  return (
    <section className="mx-auto max-w-[640px] px-6 pt-14 pb-20">
      <h1 className="mb-6 text-[28px] font-extrabold tracking-tight">
        Datenschutzerklärung
      </h1>
      <div className="flex flex-col gap-5 text-sm text-zinc-700">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <h2 className="mb-1.5 text-sm font-bold text-zinc-900">
              {section.heading}
            </h2>
            <p>{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
