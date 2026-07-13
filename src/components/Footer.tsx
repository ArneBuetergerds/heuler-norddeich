import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mt-12 max-w-5xl border-t border-slate-200 p-4 text-sm text-slate-600">
      <div className="flex flex-wrap gap-4">
        <Link href="/impressum" className="hover:underline">
          Impressum
        </Link>
        <Link href="/datenschutz" className="hover:underline">
          Datenschutz
        </Link>
      </div>
    </footer>
  );
}
