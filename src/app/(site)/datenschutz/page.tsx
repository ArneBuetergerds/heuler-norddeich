import { pageMetadata } from "@/lib/site";

type PrivacySection = {
  readonly heading: string;
  readonly body: string;
};

const SECTIONS: readonly PrivacySection[] = [
  {
    heading: "1. Verantwortlicher",
    body: "Sabrina Rönne, Am Tannenkamp 1, 48465 Schüttorf, kontakt@norddeich-heuler.de",
  },
  {
    heading: "2. Verarbeitung bei Buchungsanfragen",
    body: "Beim Absenden des Anfrageformulars verarbeiten wir Name, E-Mail-Adresse, optional Telefonnummer, den gewünschten Anreise- und Abreisezeitraum sowie Ihre Nachricht. Diese Daten werden ausschließlich zur Bearbeitung und Beantwortung Ihrer Buchungsanfrage genutzt und in unserer Datenbank gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage hin), bei einer zustande gekommenen Buchung zusätzlich zur Erfüllung des Mietvertrags.",
  },
  {
    heading: "3. Zugriffsdaten beim Seitenaufruf",
    body: "Beim Aufruf der Website werden technisch bedingt Zugriffsdaten verarbeitet, insbesondere IP-Adresse, Zeitpunkt des Zugriffs, aufgerufene Seite und übermittelte Browserkennung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und störungsfreien Betrieb der Website.",
  },
  {
    heading: "4. E-Mail-Versand",
    body: "Nach Eingang einer Anfrage wird automatisch eine Benachrichtigungs-E-Mail versendet, damit die Anfrage zeitnah bearbeitet werden kann; ebenso erhalten Sie eine Eingangsbestätigung sowie später die Zu- oder Absage. Der Versand erfolgt über die IONOS SE, Elgendorfer Straße 57, 56410 Montabaur. Zusätzlich kann eine Push-Benachrichtigung mit Name, Zeitraum und Personenzahl an Geräte der Vermieterin gehen; ihr Inhalt ist Ende-zu-Ende verschlüsselt, der zustellende Dienst des jeweiligen Geräteherstellers (z. B. Google oder Apple) kann ihn nicht lesen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
  },
  {
    heading: "5. Auftragsverarbeitung und Hosting",
    body: "Technischer Betrieb von Website und Datenbank erfolgt durch die Bütergerds Digital Solutions, Schulstr. 6, 48465 Ohne, als Auftragsverarbeiter auf Grundlage eines Vertrags nach Art. 28 DSGVO. Die Anwendung läuft auf einem von der Bütergerds Digital Solutions angemieteten virtuellen Server (VPS) der netcup GmbH, Daimlerstraße 25, 76185 Karlsruhe, in Deutschland; die netcup GmbH ist insoweit Unterauftragsverarbeiter, ebenso die IONOS SE für den E-Mail-Versand. Mit allen Beteiligten bestehen die erforderlichen Verträge zur Auftragsverarbeitung.",
  },
  {
    heading: "6. Google Maps",
    body: 'Auf der Seite "Lage" kann eine Karte von Google Maps geladen werden (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Die Karte wird erst nach einem ausdrücklichen Klick auf "Karte laden" eingebunden – vorher besteht keine Verbindung zu Google. Mit dem Klick willigen Sie nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG darin ein, dass eine Verbindung zu Servern von Google aufgebaut wird, wobei u. a. Ihre IP-Adresse übertragen und Informationen auf Ihrem Endgerät gespeichert oder ausgelesen werden können. Dabei ist eine Übermittlung in die USA nicht ausgeschlossen. Ihre Einwilligung gilt nur für den jeweiligen Seitenaufruf und lässt sich jederzeit durch Neuladen der Seite widerrufen, ohne dass die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung berührt wird. Weitere Informationen entnehmen Sie der Datenschutzerklärung von Google: https://policies.google.com/privacy.',
  },
  {
    heading: "7. Ihre Rechte",
    body: "Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20) sowie das Recht, einer Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen. Wenden Sie sich hierzu an kontakt@norddeich-heuler.de.",
  },
  {
    heading: "8. Beschwerderecht",
    body: "Unbeschadet anderer Rechtsbehelfe steht Ihnen nach Art. 77 DSGVO ein Beschwerderecht bei einer Aufsichtsbehörde zu. Für uns zuständig ist die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, poststelle@lfd.niedersachsen.de.",
  },
  {
    heading: "9. Speicherdauer",
    body: "Anfragedaten werden gelöscht, sobald sie für die Bearbeitung nicht mehr erforderlich sind, spätestens jedoch nach Ablauf gesetzlicher Aufbewahrungsfristen.",
  },
];

export const metadata = pageMetadata({
  title: "Datenschutz",
  description:
    "Datenschutzerklärung der Ferienwohnung Heuler in Norddeich.",
  path: "/datenschutz",
});

export default function DatenschutzPage() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
      <h1 className="text-h1 text-schlick">Datenschutzerklärung</h1>
      <div className="mt-8 flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <h2 className="font-display text-2xl text-schlick">{section.heading}</h2>
            <p className="mt-2 text-klein text-schlick-2">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
