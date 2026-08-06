import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default async function AdminLoginPage() {
  const session = await auth();
  if (session) {
    redirect("/admin");
  }

  return <AdminLoginForm />;
}
