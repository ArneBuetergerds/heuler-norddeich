import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBlockedPeriods } from "@/db/queries";
import { ManualBlockedPeriodForm } from "@/components/ManualBlockedPeriodForm";
import { DeleteBlockedPeriodButton } from "@/components/DeleteBlockedPeriodButton";

export default async function SperrzeitraeumePage() {
  const session = await auth();
  if (!session) {
    redirect("/admin/login");
  }

  const periods = await getBlockedPeriods();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sperrzeiträume</h1>
      <ManualBlockedPeriodForm />
      <ul className="space-y-2">
        {periods.map((period) => (
          <li
            key={period.id}
            className="flex items-center justify-between rounded border p-3 text-sm"
          >
            <span>
              {period.startDate.toLocaleDateString("de-DE")} –{" "}
              {period.endDate.toLocaleDateString("de-DE")}
              {period.note ? ` (${period.note})` : ""}
            </span>
            <DeleteBlockedPeriodButton id={period.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
