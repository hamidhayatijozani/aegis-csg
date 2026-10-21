import { Button } from "@/components/ui/button";
import { DecisionBadge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { replayRecorded } from "@/lib/csg/engine";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export function ReplayLab() {
  const events = useStore((s) => s.events);
  const [ran, setRan] = useState<{ total: number; matched: number } | null>(null);

  const sample = useMemo(() => events.slice(0, 12), [events]);

  function runAll() {
    let matched = 0;
    for (const e of events) {
      const r = replayRecorded(e.decision, e.sanitized);
      if (r.match) matched += 1;
    }
    setRan({ total: events.length, matched });
    toast(
      matched === events.length
        ? `All ${events.length} decisions replayed identically.`
        : `${events.length - matched} of ${events.length} drifted — engine or snapshot mismatch.`,
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl italic">Replay protocol</h2>
      <p className="max-w-prose text-sm leading-relaxed text-muted">
        A decision is proven when another engineer can recompute it from the recorded canonical
        input, the policy snapshot, and the engine version. Wall-clock latency is excluded from
        lineage so traces stay deterministic.
      </p>
      <Button variant="primary" onClick={runAll} disabled={events.length === 0}>
        Replay entire corpus
      </Button>
      {ran ? (
        <p className="font-mono text-sm tabular text-fg">
          {ran.matched}/{ran.total} lineage tokens matched
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {sample.map((e) => (
          <li key={e.request.event_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-fg">{e.request.event_id}</p>
              <p className="truncate font-mono text-xs text-subtle">{e.decision.lineage_token}</p>
            </div>
            <DecisionBadge decision={e.decision.decision} />
          </li>
        ))}
      </ul>
    </div>
  );
}
