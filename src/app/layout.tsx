import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Ferienwohnung Heuler, Norddeich",
  description: "Ferienwohnung in Norddeich – Verfügbarkeit prüfen und anfragen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={cn("font-sans", inter.variable)}>
      {/* Header und Footer kommen aus den Bereichs-Layouts: der öffentliche
          Bereich und der Admin-Bereich haben bewusst unterschiedliche Rahmen. */}
      <body className="min-h-screen bg-zinc-50 antialiased">{children}</body>
    </html>
  );
}
