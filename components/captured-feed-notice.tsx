import { CircleAlert } from "lucide-react";
import { formatEatClock } from "@/lib/format";

export function CapturedFeedNotice({
  unavailable,
  now,
}: {
  unavailable: boolean;
  now: string;
}) {
  if (!unavailable) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed text-muted"
    >
      <CircleAlert size={15} className="mt-0.5 shrink-0" />
      Capture feed unavailable. Showing the last received snapshot from{" "}
      {formatEatClock(now)}; activity totals may be stale. No missing records
      are inferred.
    </p>
  );
}
