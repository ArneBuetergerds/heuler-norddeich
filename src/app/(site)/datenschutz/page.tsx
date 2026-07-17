export default function DatenschutzPage() {
  return (
    <article className="prose max-w-none">
      <h1>Datenschutzerklärung</h1>
      <h2>Verantwortlicher</h2>
      <p>[Name/Firma des Betreibers, Anschrift, Kontakt]</p>
      <h2>Datenverarbeitung bei Buchungsanfragen</h2>
      <p>
        Wenn Sie über das Anfrageformular eine Buchungsanfrage senden, verarbeiten wir
        die von Ihnen angegebenen Daten (Name, E-Mail, Telefon, Zeitraum, Nachricht)
        ausschließlich zur Bearbeitung Ihrer Anfrage.
      </p>
      <h2>Hosting</h2>
      <p>
        Diese Website wird bei Vercel Inc. gehostet. Beim Aufruf der Seite werden
        technisch notwendige Zugriffsdaten (u. a. IP-Adresse) durch den Hosting-
        Anbieter verarbeitet.
      </p>
    </article>
  );
}
