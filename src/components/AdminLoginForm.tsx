"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setPending(true);
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });

      if (result?.error) {
        // Bewusst ohne Unterscheidung, ob E-Mail oder Passwort falsch war:
        // sonst ließe sich die gültige Admin-Adresse abfragen.
        setError("E-Mail oder Passwort ist falsch.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-[400px] px-6 py-20">
      <div className="rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-extrabold">Admin-Login</h1>
        <p className="mb-6 text-[13px] text-zinc-500">
          Nur für den Betreiber der Ferienwohnung.
        </p>

        {error && (
          <p className="mb-3.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="grid gap-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="admin@heuler-norddeich.de"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={pending} className="mt-1.5">
            {pending ? "Wird geprüft …" : "Anmelden"}
          </Button>
        </form>
      </div>
    </section>
  );
}
