import type { Metadata, Viewport } from "next";
import { isAdmin } from "@/lib/adminAuth";
import { AdminHeader } from "@/components/AdminHeader";
import { Toaster } from "@/components/ui/sonner";

// Eigenes Manifest nur für den Admin: Installiert Sabrina die Seite auf dem
// Handy, startet die App direkt in /admin. Auf dem iPhone ist die Installation
// Voraussetzung für Push-Benachrichtigungen. Das Manifest liegt bewusst
// außerhalb von /admin/, sonst würde der Proxy (src/proxy.ts) den Abruf blockieren.
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Heuler", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

/**
 * `loggedIn` steuert hier nur die Darstellung (Navigation und Abmelden-Knopf
 * einblenden). Den Zugriffsschutz übernehmen weiterhin der Proxy und die
 * Seiten selbst – ein Layout ist dafür der falsche Ort.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const loggedIn = await isAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader loggedIn={loggedIn} />
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
