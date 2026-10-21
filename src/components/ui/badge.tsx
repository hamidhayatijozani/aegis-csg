import { cn } from "@/lib/utils";
import type { Decision } from "@/lib/csg/types";

const TONE: Record<Decision, string> = {
  allow: "text-allow bg-allow/10 border-allow/30",
  deny: "text-deny bg-deny/10 border-deny/30",
  ask: "text-ask bg-ask/10 border-ask/30",
  sandbox: "text-sandbox bg-sandbox/10 border-sandbox/30",
  defer: "text-defer bg-defer/10 border-defer/30",
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide",
        TONE[decision],
        className,
      )}
    >
      {decision}
    </span>
  );
}
