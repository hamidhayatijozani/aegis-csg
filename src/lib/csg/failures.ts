import type { EvaluatedEvent } from "./types";

export type PatternDef = {
  id: string;
  name: string;
  rule: string;
  threat: string;
  metric: string;
};

const DEFS: (PatternDef & { match: (e: EvaluatedEvent) => boolean })[] = [
  {
    id: "FP-01",
    name: "Destructive payload",
    rule: "evidence.id ∈ {destructive_fs, destructive_sql}",
    threat: "T-INPUT",
    metric: "risk",
    match: (e) => e.decision.evidence.some((x) => x.id === "destructive_fs" || x.id === "destructive_sql"),
  },
  {
    id: "FP-02",
    name: "Unknown tool",
    rule: "tool_name ∉ catalog",
    threat: "T-INPUT",
    metric: "policy_fit",
    match: (e) => e.decision.evidence.some((x) => x.id === "tool" && x.observation.startsWith("Unknown tool")),
  },
  {
    id: "FP-03",
    name: "Credential outbound",
    rule: "evidence.id = credential_outbound",
    threat: "T-EXFIL",
    metric: "risk",
    match: (e) => e.decision.evidence.some((x) => x.id === "credential_outbound"),
  },
  {
    id: "FP-04",
    name: "Unscoped network",
    rule: "evidence.id ∈ {unscoped_network, remote_exec_adjacent}",
    threat: "T-EXFIL",
    metric: "risk",
    match: (e) =>
      e.decision.evidence.some((x) => x.id === "unscoped_network" || x.id === "remote_exec_adjacent"),
  },
  {
    id: "FP-05",
    name: "Path escape",
    rule: "evidence.id = unscoped_write",
    threat: "T-INPUT",
    metric: "risk",
    match: (e) => e.decision.evidence.some((x) => x.id === "unscoped_write"),
  },
  {
    id: "FP-06",
    name: "Incomplete schema",
    rule: "decision = defer OR evidence.id = schema",
    threat: "T-INPUT",
    metric: "completeness",
    match: (e) => e.decision.decision === "defer" || e.decision.evidence.some((x) => x.id === "schema"),
  },
  {
    id: "FP-07",
    name: "Thin context",
    rule: "identity gap OR (no policy tags AND no messages)",
    threat: "T-DRIFT",
    metric: "evidence",
    match: (e) => {
      const ids = new Set(e.decision.evidence.map((x) => x.id));
      const tags = e.decision.evidence.find((x) => x.id === "tags");
      const msgs = e.decision.evidence.find((x) => x.id === "messages");
      return ids.has("identity") && tags?.contribution === "gap" && msgs?.contribution === "gap";
    },
  },
  {
    id: "FP-08",
    name: "PII tag present",
    rule: "evidence.id = tag-pii",
    threat: "T-EXFIL",
    metric: "risk",
    match: (e) => e.decision.evidence.some((x) => x.id === "tag-pii"),
  },
];

export const PATTERNS: PatternDef[] = DEFS.map(({ match: _match, ...rest }) => rest);

export const THREATS = [
  {
    id: "T-INPUT",
    name: "Input-shaped misuse",
    patterns: ["FP-01", "FP-02", "FP-05", "FP-06"],
    metric: "risk, completeness",
    response: "Forbidden patterns deny. Unknown tools and thin schemas cannot YOLO-allow.",
  },
  {
    id: "T-EXFIL",
    name: "Sensitive data leaving the workspace",
    patterns: ["FP-03", "FP-04", "FP-08"],
    metric: "risk",
    response: "Credential-plus-destination is forbidden. PII-tagged events are ineligible for YOLO.",
  },
  {
    id: "T-DRIFT",
    name: "Decision drift against labels",
    patterns: ["FP-07"],
    metric: "agreement, false_allow",
    response: "Gold labels on the corpus. A rising false-allow is a No-Go, not a prompt tweak.",
  },
  {
    id: "T-LOAD",
    name: "Gate overload",
    patterns: [] as string[],
    metric: "diagnostics.exec_time_ms",
    response: "Compute p95 budget is 50 ms. Integration timeout is 800 ms, then ASK.",
  },
] as const;

export function countPatterns(events: EvaluatedEvent[]): (PatternDef & { count: number })[] {
  return DEFS.map(({ match, ...rest }) => ({
    ...rest,
    count: events.reduce((n, e) => n + (match(e) ? 1 : 0), 0),
  }));
}
