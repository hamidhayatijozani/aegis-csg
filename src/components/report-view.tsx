import { Button } from "@/components/ui/button";
import { countPatterns, THREATS } from "@/lib/csg/failures";
import { goNoGo, PERFORMANCE_BUDGET, summarize } from "@/lib/csg/metrics";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export function ReportView() {
  const events = useStore((s) => s.events);
  const labels = useStore((s) => s.labels);
  const snap = summarize(events, labels);
  const { verdict, checks } = goNoGo(snap);
  const patterns = countPatterns(events);

  function exportJsonl() {
    const lines = events
      .map((e) =>
        JSON.stringify({
          event: e.sanitized,
          decision: e.decision.decision,
          metrics: e.decision.metrics,
          rationale: e.decision.rationale,
          lineage_token: e.decision.lineage_token,
          replay: e.decision.replay,
          evidence: e.decision.evidence.map((x) => x.id),
        }),
      )
      .join("\n");
    download("aegis-csg-traces.jsonl", lines, "application/x-ndjson");
    toast("Trace JSONL downloaded.");
  }

  function exportCsv() {
    const header = "event_id,tool,decision,risk,evidence,policy_fit,latency_ms,label";
    const rows = events.map((e) =>
      [
        e.request.event_id,
        e.request.tool_name,
        e.decision.decision,
        e.decision.metrics.risk,
        e.decision.metrics.evidence,
        e.decision.metrics.policy_fit,
        e.decision.diagnostics.exec_time_ms,
        labels[e.request.event_id] ?? "",
      ].join(","),
    );
    download("aegis-csg-metrics.csv", [header, ...rows].join("\n"), "text/csv");
    toast("Metrics CSV downloaded.");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-subtle">RFC-0009</p>
          <h2 className="mt-1 font-display text-4xl italic">Go / No-Go</h2>
        </div>
        <span className="rounded-md border border-border bg-raised px-3 py-1 font-mono text-sm">
          {verdict}
        </span>
      </header>
      <p className="max-w-prose text-sm leading-relaxed text-muted">
        Which runtime observations caused this decision, and can another engineer reproduce it from
        the recorded data? Budgets: p95 compute under {PERFORMANCE_BUDGET.p95ComputeMs} ms, timeout{" "}
        {PERFORMANCE_BUDGET.timeoutMs} ms, retain at most {PERFORMANCE_BUDGET.maxRetainedEvents}.
      </p>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <span className={c.ok ? "text-allow" : "text-deny"}>{c.ok ? "pass" : "fail"}</span>
            <span className="text-sm text-fg">{c.label}</span>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h3 className="text-sm uppercase tracking-wider text-subtle">Failure patterns</h3>
        <ul className="space-y-2">
          {patterns.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-fg">
                  <span className="font-mono text-xs text-subtle">{p.id}</span> {p.name}
                </p>
                <span className="font-mono text-sm tabular">{p.count}</span>
              </div>
              <p className="mt-1 font-mono text-xs leading-relaxed text-muted">{p.rule}</p>
              <p className="mt-1 text-xs text-subtle">
                {p.threat} · metric {p.metric}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm uppercase tracking-wider text-subtle">Threats tied to those counts</h3>
        <ul className="space-y-2">
          {THREATS.map((t) => {
            const n = patterns
              .filter((p) => (t.patterns as readonly string[]).includes(p.id))
              .reduce((s, p) => s + p.count, 0);
            return (
              <li key={t.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-fg">
                    <span className="font-mono text-xs text-subtle">{t.id}</span> {t.name}
                  </p>
                  <span className="font-mono text-sm tabular">{t.id === "T-LOAD" ? "budget" : n}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t.response}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={exportJsonl} disabled={events.length === 0}>
          Export JSONL traces
        </Button>
        <Button onClick={exportCsv} disabled={events.length === 0}>
          Export metrics CSV
        </Button>
      </div>
    </div>
  );
}

function download(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
