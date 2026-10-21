import type { Decision, EvaluatedEvent } from "./types";

const DECISIONS: Decision[] = ["allow", "deny", "ask", "sandbox", "defer"];

export const PERFORMANCE_BUDGET = {
  p95ComputeMs: 50,
  timeoutMs: 800,
  maxRetainedEvents: 400,
  minEvents: 200,
  minLabels: 50,
  minAgreement: 0.8,
  maxFalseAllow: 0.05,
} as const;

export const METRIC_TRACE: {
  id: string;
  formula: string;
  source: string;
}[] = [
  {
    id: "risk",
    formula: "clamp(base_risk(tool) × param multipliers × sensitivity)",
    source: "tool_name, tool_params, context.policy_tags, sensitivity",
  },
  {
    id: "evidence",
    formula: "0.30·identity + 0.25·tags + 0.25·messages + 0.20·params",
    source: "event_id, agent_id, task_id, workspace_id, context, tool_params",
  },
  {
    id: "completeness",
    formula: "present required fields / 6",
    source: "event_id, timestamp, tool_name, agent_id, task_id, workspace_id",
  },
  {
    id: "policy_fit",
    formula: "category baseline − tag penalties; unknown tool = 0.45",
    source: "tool catalog × policy_tags × forbidden-pattern flag",
  },
  {
    id: "P / S / T",
    formula: "P = policy_fit; S = 1 − risk; T = evidence × (1 − risk)",
    source: "derived only from the three scores above, same request",
  },
  {
    id: "latency",
    formula: "performance.now() around evaluateRequest",
    source: "diagnostics.exec_time_ms on the decision object",
  },
  {
    id: "agreement",
    formula: "exact decision match / labeled events",
    source: "decision.decision compared with the gold label map",
  },
  {
    id: "false_allow",
    formula: "gate allow AND gold deny, divided by labeled events",
    source: "decision.decision, labels[event_id]",
  },
];

export type MetricSnapshot = {
  total: number;
  labeled: number;
  meanLatency: number;
  p95Latency: number;
  distribution: Record<Decision, number>;
  agreement: number | null;
  falseAllow: number | null;
  falseBlock: number | null;
  replayable: number;
};

export function summarize(
  events: EvaluatedEvent[],
  labels: Record<string, Decision>,
): MetricSnapshot {
  const distribution = Object.fromEntries(DECISIONS.map((d) => [d, 0])) as Record<Decision, number>;
  const latencies: number[] = [];
  let latencySum = 0;
  let replayable = 0;
  for (const e of events) {
    distribution[e.decision.decision] += 1;
    const ms = e.decision.diagnostics.exec_time_ms;
    latencies.push(ms);
    latencySum += ms;
    if (e.decision.lineage_token && e.decision.replay.canonical_input) replayable += 1;
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies.length
    ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : 0;

  let compared = 0;
  let agree = 0;
  let falseAllow = 0;
  let falseBlock = 0;
  for (const e of events) {
    const gold = labels[e.request.event_id];
    if (!gold) continue;
    compared += 1;
    if (gold === e.decision.decision) agree += 1;
    if (e.decision.decision === "allow" && gold === "deny") falseAllow += 1;
    if (e.decision.decision === "deny" && gold === "allow") falseBlock += 1;
  }

  return {
    total: events.length,
    labeled: compared,
    meanLatency: events.length ? latencySum / events.length : 0,
    p95Latency: p95 ?? 0,
    distribution,
    agreement: compared ? agree / compared : null,
    falseAllow: compared ? falseAllow / compared : null,
    falseBlock: compared ? falseBlock / compared : null,
    replayable,
  };
}

export function goNoGo(s: MetricSnapshot): {
  verdict: "GO" | "CONDITIONAL" | "NO-GO";
  checks: { id: string; ok: boolean; label: string }[];
} {
  const b = PERFORMANCE_BUDGET;
  const checks = [
    { id: "volume", ok: s.total >= b.minEvents, label: `${s.total} events processed (need ≥ ${b.minEvents})` },
    { id: "labels", ok: s.labeled >= b.minLabels, label: `${s.labeled} labeled samples (need ≥ ${b.minLabels})` },
    {
      id: "latency",
      ok: s.p95Latency < b.p95ComputeMs,
      label: `p95 compute ${s.p95Latency.toFixed(2)} ms (budget < ${b.p95ComputeMs}; network timeout is ${b.timeoutMs} ms)`,
    },
    {
      id: "agreement",
      ok: s.agreement !== null && s.agreement >= b.minAgreement,
      label: `decision agreement ${s.agreement === null ? "—" : `${(s.agreement * 100).toFixed(0)}%`} (need ≥ ${b.minAgreement * 100}%)`,
    },
    {
      id: "false-allow",
      ok: s.falseAllow !== null && s.falseAllow <= b.maxFalseAllow,
      label: `false-allow ${((s.falseAllow ?? 0) * 100).toFixed(1)}% (need ≤ ${b.maxFalseAllow * 100}%)`,
    },
    {
      id: "replay",
      ok: s.replayable === s.total && s.total > 0,
      label: `${s.replayable}/${s.total} decisions carry a lineage token and canonical input`,
    },
  ];
  const failed = checks.filter((c) => !c.ok).length;
  const verdict = failed === 0 ? "GO" : failed <= 2 ? "CONDITIONAL" : "NO-GO";
  return { verdict, checks };
}
