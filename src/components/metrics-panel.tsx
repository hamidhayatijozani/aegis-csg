import { METRIC_TRACE, goNoGo, summarize } from "@/lib/csg/metrics";
import type { Decision } from "@/lib/csg/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const BAR: Record<string, string> = {
  allow: "bg-allow",
  deny: "bg-deny",
  ask: "bg-ask",
  sandbox: "bg-sandbox",
  defer: "bg-defer",
};

export function MetricsPanel({ compact = false }: { compact?: boolean }) {
  const events = useStore((s) => s.events);
  const labels = useStore((s) => s.labels);
  const snap = summarize(events, labels);
  const { verdict } = goNoGo(snap);
  const data = (Object.entries(snap.distribution) as [Decision, number][])
    .filter(([, n]) => n > 0)
    .map(([name, value]) => ({ name, value }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const [timed, setTimed] = useState(false);
  useEffect(() => setTimed(true), []);
  const mean = timed ? `${snap.meanLatency.toFixed(2)} ms` : "—";
  const p95 = timed ? `${snap.p95Latency.toFixed(2)} ms` : "—";

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl italic">Runtime metrics</h2>
        <span className="font-mono text-xs uppercase tracking-wider text-muted">{verdict}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Stat k="Events" v={String(snap.total)} />
        <Stat k="Labeled" v={String(snap.labeled)} />
        <Stat k="Mean latency" v={mean} />
        <Stat k="p95 latency" v={p95} />
        <Stat
          k="Agreement"
          v={snap.agreement === null ? "—" : `${(snap.agreement * 100).toFixed(0)}%`}
        />
        <Stat
          k="False allow"
          v={snap.falseAllow === null ? "—" : `${(snap.falseAllow * 100).toFixed(1)}%`}
        />
      </dl>
      {data.length > 0 ? (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-raised">
            {data.map((d) => (
              <div
                key={d.name}
                className={cn("h-full", BAR[d.name])}
                style={{ width: `${(d.value / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {data.map((d) => (
              <li key={d.name} className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", BAR[d.name])} />
                {d.name}
                <span className="font-mono tabular">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {compact ? null : (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-subtle">Where each number comes from</h3>
          <ul className="space-y-2">
            {METRIC_TRACE.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                <p className="font-mono text-xs uppercase text-fg">{m.id}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{m.formula}</p>
                <p className="mt-1 font-mono text-xs text-subtle">{m.source}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-subtle">{k}</dt>
      <dd className="mt-1 font-mono text-lg tabular text-fg">{v}</dd>
    </div>
  );
}
