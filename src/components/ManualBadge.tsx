import { Badge } from "@/components/ui/badge";

/**
 * Dezente Kennzeichnung einer im Admin eingetragenen Buchung
 * (`source = "manual"`, z. B. telefonisch) in Listen und Historie.
 */
export function ManualBadge() {
  return (
    <Badge variant="outline">
      manuell<span className="sr-only"> eingetragen</span>
    </Badge>
  );
}
