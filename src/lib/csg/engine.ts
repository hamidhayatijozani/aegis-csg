import { canonical, lineageFrom } from "./hash";
import {
  ENGINE_VERSION,
  POLICY_VERSION,
  type Decision,
  type DecisionObject,
  type EvidenceItem,
  type Mode,
  type PermissionRequest,
  type Policy,
  type Sensitivity,
} from "./types";

export const TOOL_CATALOG: Record<
  string,
  { baseRisk: number; category: "execution" | "filesystem" | "network" | "comms" | "data"; label: string }
> = {
  exec_command: { baseRisk: 0.92, category: "execution", label: "Shell exec" },
  deploy_service: { baseRisk: 0.94, category: "execution", label: "Deploy" },
  write_file: { baseRisk: 0.71, category: "filesystem", label: "Write file" },
  delete_file: { baseRisk: 0.86, category: "filesystem", label: "Delete file" },
  read_file: { baseRisk: 0.28, category: "filesystem", label: "Read file" },
  list_directory: { baseRisk: 0.18, category: "filesystem", label: "List dir" },
  http_request: { baseRisk: 0.64, category: "network", label: "HTTP" },
  search_web: { baseRisk: 0.32, category: "network", label: "Web search" },
  send_email: { baseRisk: 0.68, category: "comms", label: "Email" },
  slack_post: { baseRisk: 0.58, category: "comms", label: "Slack" },
  calendar_read: { baseRisk: 0.22, category: "comms", label: "Calendar" },
  sql_query: { baseRisk: 0.81, category: "data", label: "SQL" },
};

type ScanHit = {
  id: string;
  multiplier: number;
  forbidden: boolean;
  note: string;
  source: string;
};

const SENSITIVITY_MULT: Record<Sensitivity, number> = {
  low: 0.85,
  med: 1,
  high: 1.22,
};

function clamp(n: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, n));
}

function asString(params: Record<string, unknown>): string {
  return JSON.stringify(params).toLowerCase();
}

function scanParams(tool: string, params: Record<string, unknown>): ScanHit[] {
  const blob = asString(params);
  const hits: ScanHit[] = [];

  if (/\brm\s+-rf\b|\bmkfs\b|\bformat\s+[a-z]:/.test(blob)) {
    hits.push({
      id: "destructive_fs",
      multiplier: 1.35,
      forbidden: true,
      note: "Destructive filesystem pattern in tool params",
      source: "tool_params",
    });
  }
  if (/\bdrop\s+table\b|\btruncate\s+\w+|\bdelete\s+from\b/.test(blob) && tool === "sql_query") {
    hits.push({
      id: "destructive_sql",
      multiplier: 1.32,
      forbidden: true,
      note: "Destructive SQL pattern",
      source: "tool_params.sql",
    });
  }
  if (/(password|api[_-]?key|secret|private[_-]?key|bearer\s+[a-z0-9])/.test(blob) && /(http|url|endpoint|to|recipient)/.test(blob)) {
    hits.push({
      id: "credential_outbound",
      multiplier: 1.28,
      forbidden: true,
      note: "Credential-like value combined with an outbound destination",
      source: "tool_params",
    });
  }
  if (tool === "http_request" && /https?:\/\/(?!api\.internal|docs\.|github\.com)/.test(blob)) {
    hits.push({
      id: "unscoped_network",
      multiplier: 1.16,
      forbidden: false,
      note: "HTTP target is outside the demo allow-list",
      source: "tool_params.url",
    });
  }
  if (tool === "exec_command" && /\bcurl\b|\bwget\b|\bssh\b/.test(blob)) {
    hits.push({
      id: "remote_exec_adjacent",
      multiplier: 1.18,
      forbidden: false,
      note: "Remote-adjacent binary in command string",
      source: "tool_params.cmd",
    });
  }
  if (tool === "write_file" && /(\/etc\/|\/usr\/|\.\.\/)/.test(blob)) {
    hits.push({
      id: "unscoped_write",
      multiplier: 1.2,
      forbidden: false,
      note: "Write path leaves the workspace prefix",
      source: "tool_params.path",
    });
  }
  if (hits.length === 0 && Object.keys(params).length > 0) {
    hits.push({
      id: "params_present",
      multiplier: 1,
      forbidden: false,
      note: "Params present, no elevated pattern matched",
      source: "tool_params",
    });
  }
  return hits;
}

function tagMultiplier(tags: string[], category: string): { mult: number; notes: EvidenceItem[] } {
  let mult = 1;
  const notes: EvidenceItem[] = [];
  for (const tag of tags) {
    if (tag === "prod" && (category === "execution" || category === "data")) {
      mult *= 1.14;
      notes.push({
        id: `tag-${tag}`,
        source: "context.policy_tags",
        observation: `Tag "${tag}" raises risk for ${category} tools`,
        contribution: "raises_risk",
        weight: 0.14,
      });
    } else if (tag === "finance" && (category === "comms" || category === "data" || category === "network")) {
      mult *= 1.15;
      notes.push({
        id: `tag-${tag}`,
        source: "context.policy_tags",
        observation: `Tag "${tag}" requires extra caution on ${category}`,
        contribution: "raises_risk",
        weight: 0.15,
      });
    } else if (tag === "pii") {
      mult *= 1.18;
      notes.push({
        id: "tag-pii",
        source: "context.policy_tags",
        observation: "PII tag: YOLO is ineligible",
        contribution: "raises_risk",
        weight: 0.18,
      });
    } else if (tag === "sandbox") {
      mult *= 0.9;
      notes.push({
        id: "tag-sandbox",
        source: "context.policy_tags",
        observation: "Sandbox workspace lowers operational risk",
        contribution: "lowers_risk",
        weight: -0.1,
      });
    } else if (tag === "research") {
      mult *= 0.94;
      notes.push({
        id: "tag-research",
        source: "context.policy_tags",
        observation: "Research tag slightly lowers policy pressure",
        contribution: "lowers_risk",
        weight: -0.06,
      });
    } else {
      notes.push({
        id: `tag-${tag}`,
        source: "context.policy_tags",
        observation: `Policy tag "${tag}" recorded`,
        contribution: "policy",
        weight: 0,
      });
    }
  }
  return { mult, notes };
}

const PII_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PII_TOKEN = /\b[a-z0-9_-]{24,}\b/gi;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(PII_EMAIL, "[email]").replace(PII_TOKEN, "[token]");
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out;
  }
  return value;
}

export function sanitizeRequest(req: PermissionRequest): PermissionRequest {
  return {
    ...req,
    tool_params: redactValue(req.tool_params) as Record<string, unknown>,
    context: req.context
      ? {
          policy_tags: req.context.policy_tags,
          recent_messages: req.context.recent_messages?.map((m) => ({
            ...m,
            text: String(redactValue(m.text)),
          })),
        }
      : undefined,
  };
}

function requiredPresent(req: PermissionRequest): { score: number; missing: string[] } {
  const required: (keyof PermissionRequest)[] = [
    "event_id",
    "timestamp",
    "tool_name",
    "agent_id",
    "task_id",
    "workspace_id",
  ];
  const missing = required.filter((k) => !req[k]);
  return { score: (required.length - missing.length) / required.length, missing };
}

export type EvaluateOptions = {
  policy: Policy;
  mode: Mode;
  yolo: boolean;
};

export function evaluateRequest(
  raw: PermissionRequest,
  opts: EvaluateOptions,
): { sanitized: PermissionRequest; decision: DecisionObject } {
  const started = performance.now();
  const sanitized = sanitizeRequest(raw);
  const evidence: EvidenceItem[] = [];

  const catalog = TOOL_CATALOG[sanitized.tool_name];
  const baseRisk = catalog?.baseRisk ?? 0.75;
  const category = catalog?.category ?? "execution";

  evidence.push({
    id: "tool",
    source: "tool_name",
    observation: catalog
      ? `${sanitized.tool_name} base risk ${baseRisk.toFixed(2)} (${category})`
      : `Unknown tool "${sanitized.tool_name}" — default base risk 0.75`,
    contribution: baseRisk >= 0.6 ? "raises_risk" : "lowers_risk",
    weight: baseRisk,
  });

  const hits = scanParams(sanitized.tool_name, sanitized.tool_params);
  let paramMult = 1;
  let forbidden = false;
  for (const hit of hits) {
    paramMult *= hit.multiplier;
    if (hit.forbidden) forbidden = true;
    evidence.push({
      id: hit.id,
      source: hit.source,
      observation: hit.note,
      contribution: hit.forbidden ? "raises_risk" : hit.multiplier > 1 ? "raises_risk" : "covers",
      weight: hit.multiplier - 1,
    });
  }

  const tags = sanitized.context?.policy_tags ?? [];
  const tag = tagMultiplier(tags, category);
  paramMult *= tag.mult;
  evidence.push(...tag.notes);

  const sensitivity: Sensitivity = sanitized.sensitivity ?? "med";
  const sensMult = SENSITIVITY_MULT[sensitivity];
  if (sensitivity !== "med") {
    evidence.push({
      id: "sensitivity",
      source: "sensitivity",
      observation: `Sensitivity hint "${sensitivity}" (×${sensMult})`,
      contribution: sensMult > 1 ? "raises_risk" : "lowers_risk",
      weight: sensMult - 1,
    });
  }

  const risk = clamp(baseRisk * paramMult * sensMult);

  const hasIds = Boolean(sanitized.event_id && sanitized.agent_id && sanitized.task_id && sanitized.workspace_id);
  const hasTags = tags.length > 0;
  const messages = sanitized.context?.recent_messages ?? [];
  const hasMsgs = messages.length > 0;
  const hasParams = Object.keys(sanitized.tool_params ?? {}).length > 0;
  const evScore = clamp(
    (hasIds ? 0.3 : 0) + (hasTags ? 0.25 : 0) + (hasMsgs ? 0.25 : 0) + (hasParams ? 0.2 : 0),
  );

  evidence.push({
    id: "identity",
    source: "event_id+agent_id+task_id+workspace_id",
    observation: hasIds ? "Identity fields complete" : "Identity fields incomplete",
    contribution: hasIds ? "covers" : "gap",
    weight: hasIds ? 0.3 : 0,
  });
  evidence.push({
    id: "tags",
    source: "context.policy_tags",
    observation: hasTags ? `Policy tags: ${tags.join(", ")}` : "No policy tags on the event",
    contribution: hasTags ? "covers" : "gap",
    weight: hasTags ? 0.25 : 0,
  });
  evidence.push({
    id: "messages",
    source: "context.recent_messages",
    observation: hasMsgs ? `${messages.length} context message(s)` : "No conversation context",
    contribution: hasMsgs ? "covers" : "gap",
    weight: hasMsgs ? 0.25 : 0,
  });

  const reqd = requiredPresent(sanitized);
  const completeness = reqd.score;
  if (reqd.missing.length) {
    evidence.push({
      id: "schema",
      source: "event",
      observation: `Missing required fields: ${reqd.missing.join(", ")}`,
      contribution: "gap",
      weight: 0,
    });
  }

  let policyFit = catalog ? 0.82 : 0.45;
  if (tags.includes("prod") && category === "execution") policyFit -= 0.22;
  if (tags.includes("finance") && (category === "data" || category === "comms")) policyFit -= 0.16;
  if (tags.includes("sandbox")) policyFit += 0.08;
  if (forbidden) policyFit = Math.min(policyFit, 0.12);
  policyFit = clamp(policyFit);

  evidence.push({
    id: "policy-fit",
    source: "policy × tool_category × tags",
    observation: `Policy fit ${policyFit.toFixed(2)}`,
    contribution: policyFit >= 0.6 ? "policy" : "gap",
    weight: policyFit,
  });

  const P = policyFit;
  const S = clamp(1 - risk);
  const T = clamp(evScore * (1 - risk));

  const { policy, mode, yolo } = opts;
  const piiTagged = tags.includes("pii");
  const yoloEligible =
    yolo &&
    !forbidden &&
    !piiTagged &&
    risk < policy.yolo_risk &&
    evScore >= policy.yolo_evidence &&
    policyFit >= policy.yolo_policy_fit;

  let decision: Decision;
  let rationale: string;
  let fallback = false;

  if (reqd.score < 1) {
    decision = "defer";
    rationale = `DEFER: schema incomplete (${reqd.missing.join(", ")}). Fail-safe until the producer fills required fields.`;
  } else if (forbidden) {
    decision = "deny";
    rationale = `DENY: forbidden pattern matched (risk ${risk.toFixed(2)}). Tool ${sanitized.tool_name} is blocked regardless of YOLO.`;
  } else if (risk >= policy.deny_threshold) {
    decision = "deny";
    rationale = `DENY: risk ${risk.toFixed(2)} ≥ deny threshold ${policy.deny_threshold.toFixed(2)}. Evidence ${evScore.toFixed(2)}, policy fit ${policyFit.toFixed(2)}.`;
  } else if (evScore < policy.min_evidence && risk > 0.28) {
    decision = "ask";
    rationale = `ASK: evidence ${evScore.toFixed(2)} < min ${policy.min_evidence.toFixed(2)} while risk ${risk.toFixed(2)} is not low. Human review required.`;
  } else if (risk >= policy.ask_threshold) {
    decision = "ask";
    rationale = `ASK: risk ${risk.toFixed(2)} ≥ ask threshold ${policy.ask_threshold.toFixed(2)}. Not eligible for unattended allow.`;
  } else if (risk >= policy.sandbox_threshold) {
    decision = "sandbox";
    rationale = `SANDBOX: risk ${risk.toFixed(2)} in (${policy.sandbox_threshold.toFixed(2)}, ${policy.ask_threshold.toFixed(2)}). Execute only in a constrained modality.`;
  } else if (yolo && mode === "enforce") {
    if (yoloEligible) {
      decision = "allow";
      rationale = `ALLOW (gated YOLO): risk ${risk.toFixed(2)} < ${policy.yolo_risk.toFixed(2)}, evidence ${evScore.toFixed(2)} ≥ ${policy.yolo_evidence.toFixed(2)}, policy fit ${policyFit.toFixed(2)}.`;
    } else {
      decision = "ask";
      rationale = `ASK: YOLO is on, but gates failed (risk ${risk.toFixed(2)}, evidence ${evScore.toFixed(2)}, policy fit ${policyFit.toFixed(2)}${piiTagged ? ", pii tag" : ""}). Auto-approve refused.`;
    }
  } else {
    decision = "allow";
    rationale = `ALLOW: risk ${risk.toFixed(2)} below sandbox ${policy.sandbox_threshold.toFixed(2)} with evidence ${evScore.toFixed(2)}.`;
  }

  if (mode === "observe" && decision !== "defer") {
    rationale += " Observe mode: trace only — AgentRQ is not blocked.";
  }

  const nearest = Math.min(
    Math.abs(risk - policy.deny_threshold),
    Math.abs(risk - policy.ask_threshold),
    Math.abs(risk - policy.sandbox_threshold),
  );
  const confidence = forbidden
    ? 0.95
    : decision === "defer"
      ? 0.42
      : clamp(0.55 + nearest * 1.35, 0.44, 0.97);

  const lineagePayload = {
    input: sanitized,
    policy,
    mode,
    yolo,
    engine_version: ENGINE_VERSION,
    policy_version: POLICY_VERSION,
    metrics: {
      risk: round4(risk),
      evidence: round4(evScore),
      completeness: round4(completeness),
      policy_fit: round4(policyFit),
    },
  };
  const lineage = lineageFrom(lineagePayload);

  let mitigation: DecisionObject["mitigation"];
  if (decision === "sandbox") {
    mitigation = { action: "sandbox", params: { timeout_ms: 30_000, network: "deny" } };
  } else if (decision === "ask") {
    mitigation = { action: "human_review", params: { queue: "agent-approvals" } };
  } else if (decision === "deny") {
    mitigation = { action: "block", params: { persist: true } };
  }

  const decisionObj: DecisionObject = {
    decision_id: lineage.id,
    request_id: sanitized.event_id,
    decision,
    confidence: round4(confidence),
    rationale,
    mitigation,
    lineage_token: lineage.token,
    metrics: {
      risk: round4(risk),
      evidence: round4(evScore),
      completeness: round4(completeness),
      policy_fit: round4(policyFit),
      P: round4(P),
      S: round4(S),
      T: round4(T),
    },
    evidence,
    input_hash: lineage.hash,
    engine_version: ENGINE_VERSION,
    policy_version: POLICY_VERSION,
    diagnostics: {
      exec_time_ms: Math.round((performance.now() - started) * 1000) / 1000,
      fallback,
      mode,
      yolo,
    },
    replay: {
      canonical_input: canonical(sanitized),
      policy_snapshot: canonical(policy),
      engine_version: ENGINE_VERSION,
    },
  };

  return { sanitized, decision: decisionObj };
}


export function replayFromCanonical(
  previous: DecisionObject,
  sanitized: PermissionRequest,
  opts: EvaluateOptions,
): { match: boolean; next: DecisionObject } {
  const { decision } = evaluateRequest(sanitized, opts);
  return {
    match:
      decision.lineage_token === previous.lineage_token &&
      decision.decision === previous.decision,
    next: decision,
  };
}

export function replayRecorded(
  previous: DecisionObject,
  sanitized: PermissionRequest,
): { match: boolean; next: DecisionObject } {
  const policy = JSON.parse(previous.replay.policy_snapshot) as Policy;
  return replayFromCanonical(previous, sanitized, {
    policy,
    mode: previous.diagnostics.mode,
    yolo: previous.diagnostics.yolo,
  });
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}


