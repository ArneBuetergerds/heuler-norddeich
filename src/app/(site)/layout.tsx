import { Footer } from "@/components/Footer";
import { InstallHint } from "@/components/InstallHint";
import { NavBar } from "@/components/NavBar";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1">{children}</main>
      {/* Im Seitenfluss unter dem Inhalt: verdeckt nie das Anfrageformular. */}
      <InstallHint />
      <Footer />
    </div>
  );
}
