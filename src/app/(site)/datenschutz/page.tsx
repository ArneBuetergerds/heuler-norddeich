import { pageMetadata } from "@/lib/site";
import { actionLogRetentionNotice, retentionNotice } from "@/lib/retention";
import { INSTALL_HINT_DISMISSED_KEY } from "@/lib/installHint";

type PrivacySection = {
  /** Ohne Nummer – sie ergibt sich aus der Reihenfolge in `SECTIONS`. */
  readonly heading: string;
  readonly body: string;
};

const SECTIONS: readonly PrivacySection[] = [
  {
    heading: "Verantwortlicher",
    body: "Sabrina Rönne, Am Tannenkamp 1, 48465 Schüttorf, kontakt@norddeich-heuler.de",
  },
  {
    heading: "Verarbeitung bei Buchungsanfragen",
    body: "Beim Absenden des Anfrageformulars verarbeiten wir Name, E-Mail-Adresse, optional Telefonnummer, den gewünschten Anreise- und Abreisezeitraum sowie Ihre Nachricht. Diese Daten werden ausschließlich zur Bearbeitung und Beantwortung Ihrer Buchungsanfrage genutzt und in unserer Datenbank gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage hin), bei einer zustande gekommenen Buchung zusätzlich zur Erfüllung des Mietvertrags.",
  },
  {
    heading: "Zugriffsdaten beim Seitenaufruf",
    body: "Beim Aufruf der Website werden technisch bedingt Zugriffsdaten verarbeitet, insbesondere IP-Adresse, Zeitpunkt des Zugriffs, aufgerufene Seite und übermittelte Browserkennung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und störungsfreien Betrieb der Website.",
  },
  {
    heading: "Speicherung auf Ihrem Endgerät",
    // Schlüsselname aus der Komponente, damit Erklärung und Code nicht auseinanderlaufen.
    body: `Auf Smartphones und Tablets kann ein Hinweis erscheinen, wie Sie die Website zu Ihrem Startbildschirm hinzufügen. Schließen Sie diesen Hinweis, wird im lokalen Speicher Ihres Browsers (localStorage) unter dem Eintrag „${INSTALL_HINT_DISMISSED_KEY}“ lediglich vermerkt, dass Sie ihn geschlossen haben, damit er nicht erneut erscheint. Der Eintrag wird erst angelegt, wenn Sie auf das Schließen-Symbol des Hinweises tippen oder klicken, verbleibt auf Ihrem Gerät und wird nicht an uns übertragen; ein Tracking findet nicht statt. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG, da die Speicherung unbedingt erforderlich ist, um den von Ihnen gewünschten Dienst – das dauerhafte Ausblenden des Hinweises – bereitzustellen. Sie können den Eintrag jederzeit löschen, indem Sie in den Einstellungen Ihres Browsers die gespeicherten Website-Daten entfernen.`,
  },
  {
    heading: "E-Mail-Versand",
    body: "Nach Eingang einer Anfrage wird automatisch eine Benachrichtigungs-E-Mail versendet, damit die Anfrage zeitnah bearbeitet werden kann; ebenso erhalten Sie eine Eingangsbestätigung sowie später die Zu- oder Absage. Der Versand erfolgt über die IONOS SE, Elgendorfer Straße 57, 56410 Montabaur. Zusätzlich kann eine Push-Benachrichtigung mit Name, Zeitraum und Personenzahl an Geräte der Vermieterin gehen; ihr Inhalt ist Ende-zu-Ende verschlüsselt, der zustellende Dienst des jeweiligen Geräteherstellers (z. B. Google oder Apple) kann ihn nicht lesen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
  },
  {
    heading: "Protokoll der Bearbeitung",
    // Frist aus der Konstante, nach der die automatische Löschung arbeitet.
    body: `Bearbeitungsschritte im Verwaltungsbereich der Website – etwa Zu- oder Absage und Stornierung einer Anfrage, das Eintragen von Aufenthalten und Sperrzeiten, das Erstellen von Rechnungen sowie das Löschen und Anonymisieren von Anfragen – werden protokolliert, ebenso die automatische Löschung abgelaufener Daten. Gespeichert werden die Art der Aktion, der Zeitpunkt, die E-Mail-Adresse der handelnden Person aus dem Verwaltungsbereich und die interne Nummer der betroffenen Anfrage oder Sperrzeit, gegebenenfalls mit dem Zeitraum, der Rechnungsnummer oder der Anzahl gelöschter Einträge. Namen, Kontaktdaten und Nachrichten von Gästen enthält das Protokoll nicht. Es dient dazu, die Bearbeitung nachvollziehen und die Sicherheit der Verarbeitung gewährleisten zu können (Art. 5 Abs. 2 und Art. 32 DSGVO). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt darin, Änderungen an Anfragen und Buchungen nachvollziehen sowie Fehler und unbefugte Zugriffe erkennen zu können. ${actionLogRetentionNotice()}`,
  },
  {
    heading: "Auftragsverarbeitung und Hosting",
    body: "Technischer Betrieb von Website und Datenbank erfolgt durch die Bütergerds Digital Solutions, Schulstr. 6, 48465 Ohne, als Auftragsverarbeiter auf Grundlage eines Vertrags nach Art. 28 DSGVO. Die Anwendung läuft auf einem von der Bütergerds Digital Solutions angemieteten virtuellen Server (VPS) der netcup GmbH, Daimlerstraße 25, 76185 Karlsruhe, in Deutschland; die netcup GmbH ist insoweit Unterauftragsverarbeiter, ebenso die IONOS SE für den E-Mail-Versand. Mit allen Beteiligten bestehen die erforderlichen Verträge zur Auftragsverarbeitung.",
  },
  {
    heading: "Google Maps",
    body: 'Auf der Seite "Lage" kann eine Karte von Google Maps geladen werden (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Die Karte wird erst nach einem ausdrücklichen Klick auf "Karte laden" eingebunden – vorher besteht keine Verbindung zu Google. Mit dem Klick willigen Sie nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG darin ein, dass eine Verbindung zu Servern von Google aufgebaut wird, wobei u. a. Ihre IP-Adresse übertragen und Informationen auf Ihrem Endgerät gespeichert oder ausgelesen werden können. Dabei ist eine Übermittlung in die USA nicht ausgeschlossen. Ihre Einwilligung gilt nur für den jeweiligen Seitenaufruf und lässt sich jederzeit durch Neuladen der Seite widerrufen, ohne dass die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung berührt wird. Weitere Informationen entnehmen Sie der Datenschutzerklärung von Google: https://policies.google.com/privacy.',
  },
  {
    heading: "Ihre Rechte",
    body: "Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20) sowie das Recht, einer Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen. Wenden Sie sich hierzu an kontakt@norddeich-heuler.de.",
  },
  {
    heading: "Beschwerderecht",
    body: "Unbeschadet anderer Rechtsbehelfe steht Ihnen nach Art. 77 DSGVO ein Beschwerderecht bei einer Aufsichtsbehörde zu. Für uns zuständig ist die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, poststelle@lfd.niedersachsen.de.",
  },
  {
    heading: "Speicherdauer",
    // Aus den Konstanten erzeugt, nach denen die Anwendung tatsächlich löscht.
    body: retentionNotice(),
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
        {SECTIONS.map((section, index) => (
          <div key={section.heading}>
            <h2 className="font-display text-2xl text-schlick">
              {index + 1}. {section.heading}
            </h2>
            <p className="mt-2 text-klein text-schlick-2">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
