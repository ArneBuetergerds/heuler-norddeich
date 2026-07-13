import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Ferienwohnung Heuler, Norddeich",
  description: "Ferienwohnung in Norddeich – Verfügbarkeit prüfen und anfragen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-slate-900">
        <NavBar />
        <main className="mx-auto max-w-5xl p-4">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
