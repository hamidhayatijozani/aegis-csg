import { cn } from "@/lib/utils";

export function Meter({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "accent" | "allow" | "deny" | "ask" | "sandbox";
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-subtle">{label}</span>
        <span className="font-mono text-xs tabular text-fg">{value.toFixed(2)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-raised">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            tone === "accent" && "bg-accent/80",
            tone === "allow" && "bg-allow",
            tone === "deny" && "bg-deny",
            tone === "ask" && "bg-ask",
            tone === "sandbox" && "bg-sandbox",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
