import { DecisionBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/meter";
import type { Decision, EvaluatedEvent } from "@/lib/csg/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

const HUMAN: Decision[] = ["allow", "deny", "ask", "sandbox"];

export function Inspector({ event }: { event: EvaluatedEvent | undefined }) {
  const label = useStore((s) => (event ? s.labels[event.request.event_id] : undefined));
  const setLabel = useStore((s) => s.label);
  const replay = useStore((s) => s.replaySelected);
  const lastReplay = useStore((s) => s.lastReplay);
  const mode = useStore((s) => s.mode);

  if (!event) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
        Select a permission_request to inspect the decision object.
      </div>
    );
  }

  const d = event.decision;
  const req = event.request;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="space-y-6 px-4 py-4 md:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-subtle">{req.event_id}</p>
            <h2 className="mt-1 font-display text-3xl italic leading-tight text-fg">{req.tool_name}</h2>
            <p className="mt-1 text-sm text-muted">
              {req.agent_id} · {req.workspace_id} · {req.task_id}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DecisionBadge decision={d.decision} className="px-2 py-1 text-xs" />
            <span className="font-mono text-xs tabular text-muted">
              conf {d.confidence.toFixed(2)}
            </span>
            <span className="text-xs uppercase tracking-wider text-subtle">{mode} binding</span>
          </div>
        </header>

        <ol className="flex gap-1 overflow-x-auto pb-1">
          {["ingest", "sanitize", "score", "policy", d.decision].map((step, i) => (
            <li
              key={step}
              className={cn(
                "min-w-16 flex-1 rounded-md border border-border bg-surface px-2 py-2 text-center",
                i === 4 && "border-accent/40 bg-raised",
              )}
            >
              <span className="block font-mono text-xs uppercase tracking-wider text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs text-fg">{step}</span>
            </li>
          ))}
        </ol>

        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg">
          {d.rationale}
        </p>

        <section className="grid gap-4 sm:grid-cols-2">
          <Meter label="Risk" value={d.metrics.risk} tone="deny" hint="base × params × tags × sensitivity" />
          <Meter label="Evidence" value={d.metrics.evidence} tone="allow" hint="identity + tags + messages + params" />
          <Meter label="P · policy fit" value={d.metrics.P} hint="tag × tool category" />
          <Meter label="S · safety slack" value={d.metrics.S} hint="1 − risk" />
          <Meter label="T · trust" value={d.metrics.T} hint="evidence × (1 − risk)" />
          <Meter label="Completeness" value={d.metrics.completeness} hint="required fields present" />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Runtime evidence</h3>
          <ul className="space-y-2">
            {d.evidence.map((ev) => (
              <li key={ev.id} className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{ev.source}</span>
                  <span className="font-mono text-xs tabular text-subtle">{ev.contribution}</span>
                </div>
                <p className="mt-1 text-sm text-fg">{ev.observation}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              const ok = replay();
              toast(ok ? "Replay matched — same lineage token." : "Replay drifted — policy or engine changed.");
            }}
          >
            <RotateCcw className="size-4" />
            Replay
          </Button>
          {lastReplay?.id === req.event_id ? (
            <span className={cn("text-sm", lastReplay.match ? "text-allow" : "text-deny")}>
              {lastReplay.match ? "Match" : "Drift"}
            </span>
          ) : null}
          <span className="font-mono text-xs text-subtle break-all">{d.lineage_token}</span>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Human label</h3>
          <div className="flex flex-wrap gap-2">
            {HUMAN.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setLabel(req.event_id, h)}
                className={cn(
                  "h-10 min-w-16 rounded-md border px-3 text-sm capitalize",
                  label === h ? "border-accent bg-accent text-accent-fg" : "border-border bg-raised text-muted",
                )}
              >
                {h}
              </button>
            ))}
          </div>
          {label ? (
            <p className="mt-2 text-xs text-muted">
              Gold/human: {label}
              {label === d.decision ? " — agrees with the gate." : " — disagrees with the gate."}
            </p>
          ) : null}
        </section>

        <details className="rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm text-muted">Decision object JSON</summary>
          <pre className="overflow-x-auto px-4 pb-4 font-mono text-xs leading-relaxed text-fg">
            {JSON.stringify(
              {
                input: event.sanitized,
                evidence: d.evidence,
                metrics: d.metrics,
                decision: d.decision,
                rationale: d.rationale,
                lineage: d.lineage_token,
                replay: d.replay,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}
