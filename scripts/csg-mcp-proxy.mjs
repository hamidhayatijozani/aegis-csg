#!/usr/bin/env node
/**
 * CSG pre-execution MCP stdio gateway.
 *
 * Usage:
 *   CSG_WORKSPACE_ID=demo CSG_AGENT_ID=my-agent \
 *   node scripts/csg-mcp-proxy.mjs -- npx -y @modelcontextprotocol/server-filesystem /safe/root
 *
 * The agent must connect to this process instead of connecting directly to the
 * upstream MCP server. Only decisions equal to "allow" are forwarded.
 */
import { appendFileSync, closeSync, fchmodSync, fsyncSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";

const AUDIT_PATH = resolve(process.env.CSG_AUDIT_PATH || ".csg/audit.jsonl");
const WORKSPACE_ID = process.env.CSG_WORKSPACE_ID || "";
const AGENT_ID = process.env.CSG_AGENT_ID || "";
const TASK_ID = process.env.CSG_TASK_ID || "";
const POLICY_TAGS = (process.env.CSG_POLICY_TAGS || "")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);

function writeProtocol(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function appendAudit(record) {
  mkdirSync(dirname(AUDIT_PATH), { recursive: true });
  const fd = openSync(AUDIT_PATH, "a", 0o600);
  try {
    appendFileSync(fd, JSON.stringify(record) + "\n", { encoding: "utf8" });
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

async function main() {
  const separator = process.argv.indexOf("--");
  const command = separator >= 0 ? process.argv[separator + 1] : undefined;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!command) {
    console.error(
      "[csg-mcp-proxy] Missing upstream command. Usage: node scripts/csg-mcp-proxy.mjs -- <command> [args...]",
    );
    process.exitCode = 2;
    return;
  }

  const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });

  let engine;
  let types;
  try {
    engine = await vite.ssrLoadModule("/src/lib/csg/engine.ts");
    types = await vite.ssrLoadModule("/src/lib/csg/types.ts");
  } catch (error) {
    await vite.close();
    throw error;
  }

  const upstream = spawn(command, args, {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
    shell: false,
  });
  const upstreamLines = createInterface({ input: upstream.stdout, crlfDelay: Infinity });
  const pendingCalls = new Map();
  let shuttingDown = false;

  const finish = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const [key, call] of pendingCalls) {
      try {
        appendAudit({
          record_type: "execution_interrupted",
          event_id: call.eventId,
          decision_id: call.decision.decision_id,
          timestamp: new Date().toISOString(),
          outcome: "upstream_exited_before_response",
        });
      } catch (error) {
        console.error("[csg-mcp-proxy] Could not persist interruption record:", error);
      }
      pendingCalls.delete(key);
    }
    await vite.close();
    if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = code;
  };

  upstreamLines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      // MCP stdio is JSON-RPC per line. Never forward malformed upstream data
      // to the agent as if it were a valid protocol message.
      console.error("[csg-mcp-proxy] Dropped malformed upstream JSON-RPC line.");
      return;
    }

    if (message && Object.hasOwn(message, "id")) {
      const key = JSON.stringify(message.id);
      const call = pendingCalls.get(key);
      if (call) {
        try {
          appendAudit({
            record_type: "execution_result",
            event_id: call.eventId,
            decision_id: call.decision.decision_id,
            timestamp: new Date().toISOString(),
            outcome: message.error ? "upstream_error" : "upstream_response_received",
            upstream_error_code: message.error?.code,
          });
        } catch (error) {
          // The pre-execution decision is already durable. A completion-log
          // failure must be visible, but cannot undo a tool call already made.
          console.error("[csg-mcp-proxy] Could not persist execution result:", error);
        }
        pendingCalls.delete(key);
      }
    }
    writeProtocol(message);
  });

  upstream.on("error", (error) => {
    console.error("[csg-mcp-proxy] Could not start upstream MCP server:", error.message);
    void finish(1);
  });
  upstream.on("exit", (code, signal) => {
    console.error(`[csg-mcp-proxy] Upstream exited (code=${code}, signal=${signal ?? "none"}).`);
    void finish(code ?? 1);
  });

  const clientLines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  clientLines.on("line", async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.error("[csg-mcp-proxy] Dropped malformed client JSON-RPC line.");
      return;
    }

    const isToolCall =
      message?.jsonrpc === "2.0" &&
      message?.method === "tools/call" &&
      isObject(message.params);

    if (!isToolCall) {
      if (!upstream.stdin.destroyed) upstream.stdin.write(line + "\n");
      return;
    }

    const id = Object.hasOwn(message, "id") ? message.id : null;
    const eventId = randomUUID();
    const toolName = typeof message.params.name === "string" ? message.params.name : "";
    const rawArgs = message.params.arguments;
    const toolParams = isObject(rawArgs) ? rawArgs : {};
    const request = {
      event_type: "permission_request",
      event_id: eventId,
      workspace_id: WORKSPACE_ID,
      task_id: TASK_ID || eventId,
      agent_id: AGENT_ID,
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_params: toolParams,
      context: {
        policy_tags: POLICY_TAGS,
      },
      sensitivity: "med",
    };

    let evaluated;
    try {
      evaluated = engine.evaluateRequest(request, {
        policy: { ...types.DEFAULT_POLICY, fallback: "ask" },
        mode: "enforce",
        yolo: false,
      });
    } catch (error) {
      console.error("[csg-mcp-proxy] Evaluation failed; blocking tool call:", error);
      if (id !== null) writeProtocol(jsonRpcError(id, -32001, "CSG evaluation failed; tool call blocked."));
      try {
        appendAudit({
          record_type: "decision",
          event_id: eventId,
          timestamp: new Date().toISOString(),
          outcome: "blocked",
          reason: "evaluation_exception",
          tool_name: toolName || "[invalid]",
        });
      } catch (auditError) {
        console.error("[csg-mcp-proxy] Audit write failed during evaluation failure:", auditError);
      }
      return;
    }

    const { sanitized, decision } = evaluated;
    const allowed = Boolean(id !== null && WORKSPACE_ID && AGENT_ID && toolName && isObject(rawArgs) && decision.decision === "allow");
    const record = {
      record_type: "decision",
      event_id: eventId,
      timestamp: new Date().toISOString(),
      workspace_id: WORKSPACE_ID || "[missing]",
      agent_id: AGENT_ID || "[missing]",
      tool_name: toolName || "[invalid]",
      sanitized_request: sanitized,
      decision,
      outcome: allowed ? "allowed_for_execution" : "blocked",
      block_reason: allowed ? undefined : id === null
        ? "missing_jsonrpc_request_id"
        : !WORKSPACE_ID || !AGENT_ID
        ? "runtime_identity_missing"
        : !toolName || !isObject(rawArgs)
          ? "invalid_tool_call"
          : decision.decision !== "allow"
            ? decision.decision
            : "unknown",
    };

    try {
      // Persist and fsync the decision BEFORE the upstream tool can see it.
      appendAudit(record);
    } catch (error) {
      console.error("[csg-mcp-proxy] Audit persistence failed; blocking tool call:", error);
      if (id !== null) writeProtocol(jsonRpcError(id, -32002, "CSG audit persistence failed; tool call blocked."));
      return;
    }

    if (!allowed) {
      if (id !== null) {
        writeProtocol({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{
              type: "text",
              text: `CSG blocked tool "${toolName || "[invalid]"}": ${record.block_reason}. Decision=${decision.decision}. ${decision.rationale}`,
            }],
            isError: true,
          },
        });
      }
      return;
    }

    if (id !== null) {
      pendingCalls.set(JSON.stringify(id), { eventId, decision });
    }
    if (!upstream.stdin.destroyed) {
      upstream.stdin.write(line + "\n");
    } else {
      pendingCalls.delete(JSON.stringify(id));
      try {
        appendAudit({
          record_type: "execution_result",
          event_id: eventId,
          decision_id: decision.decision_id,
          timestamp: new Date().toISOString(),
          outcome: "upstream_unavailable",
        });
      } catch (error) {
        console.error("[csg-mcp-proxy] Could not persist upstream-unavailable record:", error);
      }
      if (id !== null) writeProtocol(jsonRpcError(id, -32003, "Upstream MCP server unavailable; tool call not forwarded."));
    }
  });

  process.on("SIGINT", () => {
    upstream.kill("SIGTERM");
    void finish(0);
  });
  process.on("SIGTERM", () => {
    upstream.kill("SIGTERM");
    void finish(0);
  });
  clientLines.on("close", () => {
    if (!upstream.killed) upstream.stdin.end();
  });
}

main().catch((error) => {
  console.error("[csg-mcp-proxy] Fatal startup error; no tool calls can pass:", error);
  process.exitCode = 1;
});
