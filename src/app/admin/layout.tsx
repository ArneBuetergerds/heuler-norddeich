import { auth } from "@/auth";
import { AdminHeader } from "@/components/AdminHeader";
import { Toaster } from "@/components/ui/sonner";

/**
 * `loggedIn` steuert hier nur die Darstellung (Navigation und Abmelden-Knopf
 * einblenden). Den Zugriffsschutz übernehmen weiterhin die Middleware und die
 * Seiten selbst – ein Layout ist dafür der falsche Ort.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader loggedIn={session !== null} />
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
