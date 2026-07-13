"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("E-Mail oder Passwort ist falsch.");
      return;
    }
    router.push("/admin");
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-3">
      <h1 className="text-2xl font-bold">Admin-Login</h1>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded border p-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="rounded bg-slate-900 px-4 py-2 text-white"
      >
        Anmelden
      </button>
    </form>
  );
}
