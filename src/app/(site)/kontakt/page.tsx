export default function KontaktPage() {
  return (
    <article className="prose max-w-none space-y-4">
      <h1>Kontakt</h1>
      <p>Bei Fragen erreichen Sie uns direkt:</p>
      <p>
        [Name des Betreibers]
        <br />
        Telefon: [Telefonnummer]
        <br />
        E-Mail: [E-Mail-Adresse]
      </p>
      <p>
        Für eine Buchungsanfrage nutzen Sie bitte das Formular auf der Seite{" "}
        <a href="/verfuegbarkeit" className="underline">
          Verfügbarkeit & Anfrage
        </a>
        .
      </p>
    </article>
  );
}
