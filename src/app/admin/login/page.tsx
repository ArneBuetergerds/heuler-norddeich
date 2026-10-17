import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default async function AdminLoginPage() {
  if (await isAdmin()) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}
