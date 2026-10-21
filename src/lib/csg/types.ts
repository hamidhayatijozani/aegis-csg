export const ENGINE_VERSION = "csg-0.5.0";
export const POLICY_VERSION = "policy-poc-1";

export type Decision = "allow" | "deny" | "ask" | "sandbox" | "defer";
export type Mode = "observe" | "suggest" | "enforce";
export type Sensitivity = "low" | "med" | "high";
export type Tab =
  | "stream"
  | "inspector"
  | "replay"
  | "metrics"
  | "policy"
  | "contract"
  | "report";

export type Message = {
  sender: string;
  text: string;
  ts: string;
};

export type PermissionRequest = {
  event_type: "permission_request";
  event_id: string;
  workspace_id: string;
  task_id: string;
  agent_id: string;
  timestamp: string;
  tool_name: string;
  tool_params: Record<string, unknown>;
  context?: {
    recent_messages?: Message[];
    policy_tags?: string[];
  };
  sensitivity?: Sensitivity;
};

export type EvidenceItem = {
  id: string;
  source: string;
  observation: string;
  contribution: "raises_risk" | "lowers_risk" | "covers" | "gap" | "policy";
  weight: number;
};

export type Policy = {
  deny_threshold: number;
  ask_threshold: number;
  sandbox_threshold: number;
  min_evidence: number;
  yolo_risk: number;
  yolo_evidence: number;
  yolo_policy_fit: number;
  timeout_ms: number;
  fallback: Decision;
};

export type DecisionMetrics = {
  risk: number;
  evidence: number;
  completeness: number;
  policy_fit: number;
  P: number;
  S: number;
  T: number;
};

export type DecisionObject = {
  decision_id: string;
  request_id: string;
  decision: Decision;
  confidence: number;
  rationale: string;
  mitigation?: { action: string; params?: Record<string, unknown> };
  lineage_token: string;
  metrics: DecisionMetrics;
  evidence: EvidenceItem[];
  input_hash: string;
  engine_version: string;
  policy_version: string;
  diagnostics: { exec_time_ms: number; fallback: boolean; mode: Mode; yolo: boolean };
  replay: {
    canonical_input: string;
    policy_snapshot: string;
    engine_version: string;
  };
};

export type EvaluatedEvent = {
  request: PermissionRequest;
  sanitized: PermissionRequest;
  decision: DecisionObject;
  receivedAt: number;
};

export const DEFAULT_POLICY: Policy = {
  deny_threshold: 0.88,
  ask_threshold: 0.62,
  sandbox_threshold: 0.48,
  min_evidence: 0.45,
  yolo_risk: 0.38,
  yolo_evidence: 0.7,
  yolo_policy_fit: 0.6,
  timeout_ms: 800,
  fallback: "ask",
};

export const FORMULAS = {
  risk: "clamp(base_risk(tool) × Π multipliers(params, tags, sensitivity), 0, 1)",
  evidence: "0.30·identity + 0.25·policy_tags + 0.25·messages + 0.20·params",
  completeness: "required_fields_present / required_fields",
  policy_fit: "1 − penalty(tag × tool_category); unknown tool = 0.45",
  P: "policy_fit",
  S: "1 − risk  (safety slack)",
  T: "evidence × (1 − risk)  (trust under uncertainty)",
  decision:
    "forbidden → deny; risk ≥ deny → deny; evidence < min ∧ risk > 0.28 → ask; risk ≥ sandbox → sandbox; YOLO allow iff risk < yolo_risk ∧ evidence ≥ yolo_evidence ∧ policy_fit ≥ yolo_policy; else allow",
};

export const PRINCIPLES = [
  { id: "runtime-first", title: "Runtime-first", body: "Score only what was observed on this request. No hidden session memory." },
  { id: "observable", title: "Observable by default", body: "Every score cites a field path. Traces are JSONL, signed by lineage." },
  { id: "replayable", title: "Replayable by design", body: "Same canonical input + policy snapshot + engine version ⇒ same decision_id." },
  { id: "deterministic", title: "Deterministic scoring", body: "No sampling in the gate. Confidence is distance-to-threshold, not a vibe." },
  { id: "separated", title: "Policy separated from reasoning", body: "Thresholds are data. The engine does not invent new rules at request time." },
  { id: "fail-safe", title: "Fail safely", body: "Timeout, schema error, or exception → ASK in suggest/enforce. Observe never blocks." },
  { id: "stateless", title: "Stateless evaluation", body: "The gate does not accumulate agent reputation across events in this POC." },
  { id: "override", title: "Human override always available", body: "ASK is a first-class decision. YOLO never silences high-risk tool calls." },
] as const;
