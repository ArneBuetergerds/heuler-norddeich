"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteBlockedPeriodButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await fetch(`/api/admin/blocked-period?id=${id}`, {
      method: "DELETE",
    });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleDelete}
      className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
    >
      Löschen
    </button>
  );
}
