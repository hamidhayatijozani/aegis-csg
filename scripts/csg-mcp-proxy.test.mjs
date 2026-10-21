import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "csg-mcp-gateway-"));
const auditPath = join(tempDir, "audit.jsonl");
const effectPath = join(tempDir, "tool-effects.jsonl");
const filesystemRoot = join(tempDir, "root");
const outsidePath = join(tempDir, "outside-secret.txt");
mkdirSync(filesystemRoot, { recursive: true });
writeFileSync(join(filesystemRoot, "README.md"), "safe test file");
writeFileSync(outsidePath, "outside secret");
symlinkSync(outsidePath, join(filesystemRoot, "leak"));
const fakeServer = String.raw`
  import { createInterface } from "node:readline";
  import { appendFileSync } from "node:fs";
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const msg = JSON.parse(line);
    if (msg.method === "tools/call") {
      appendFileSync(process.env.FAKE_EFFECT_PATH, JSON.stringify({id: msg.id, name: msg.params?.name}) + "\n");
      process.stdout.write(JSON.stringify({jsonrpc:"2.0", id:msg.id, result:{content:[{type:"text",text:"executed"}]}}) + "\n");
    } else if (Object.hasOwn(msg, "id")) {
      process.stdout.write(JSON.stringify({jsonrpc:"2.0", id:msg.id, result:{}}) + "\n");
    }
  });
`;

let proxy;
let lines;
let queue = [];
let waiters = [];

function nextMessage(timeoutMs = 10000) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP proxy response")), timeoutMs);
    waiters.push((message) => {
      clearTimeout(timer);
      resolvePromise(message);
    });
  });
}

before(async () => {
  proxy = spawn(process.execPath, [
    "scripts/csg-mcp-proxy.mjs",
    "--",
    process.execPath,
    "-e",
    fakeServer,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CSG_WORKSPACE_ID: "test-workspace",
      CSG_AGENT_ID: "test-agent",
      CSG_AUDIT_PATH: auditPath,
      CSG_FILESYSTEM_ROOT: filesystemRoot,
      FAKE_EFFECT_PATH: effectPath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  lines = createInterface({ input: proxy.stdout, crlfDelay: Infinity });
  lines.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  proxy.stderr.on("data", () => {});
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("Proxy did not start")), 10000);
    proxy.once("spawn", () => { clearTimeout(timer); resolvePromise(); });
    proxy.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
});

after(async () => {
  if (proxy && proxy.exitCode === null) {
    proxy.stdin.end();
    proxy.kill("SIGTERM");
    await new Promise((resolvePromise) => {
      const timer = setTimeout(resolvePromise, 2000);
      proxy.once("exit", () => { clearTimeout(timer); resolvePromise(); });
    });
  }
  lines?.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("a destructive tool call is blocked before the upstream MCP server receives it", async () => {
  proxy.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "exec_command", arguments: { cmd: "rm -rf /var/data" } },
  }) + "\n");

  const response = await nextMessage();
  assert.equal(response.id, 1);
  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text ?? "", /CSG blocked tool/);
  assert.equal(existsSync(effectPath), false, "denied tool must have zero upstream side effects");
});

test("a filesystem path outside the configured root is blocked before forwarding", async () => {
  proxy.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: "/etc/shadow" } },
  }) + "\n");

  const response = await nextMessage();
  assert.equal(response.id, 3);
  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text ?? "", /filesystem_path_outside_root/);
  assert.equal(existsSync(effectPath), false, "out-of-root file access must have zero upstream side effects");
});

test("a symlink resolving outside the configured root is blocked", async () => {
  proxy.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: "leak" } },
  }) + "\n");

  const response = await nextMessage();
  assert.equal(response.id, 4);
  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text ?? "", /filesystem_path_outside_root/);
  assert.equal(existsSync(effectPath), false, "symlink escape must have zero upstream side effects");
});

test("an allowed read-only tool call is forwarded and produces durable decision/result records", async () => {
  proxy.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "read_file", arguments: { path: "README.md" } },
  }) + "\n");

  const response = await nextMessage();
  assert.equal(response.id, 2);
  assert.equal(response.result?.content?.[0]?.text, "executed");
  assert.equal(existsSync(effectPath), true);
  const effects = readFileSync(effectPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].id, 2);
  assert.equal(effects[0].name, "read_file");

  const records = readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse);
  const denied = records.find((r) => r.record_type === "decision" && r.tool_name === "exec_command");
  const allowed = records.find((r) => r.record_type === "decision" && r.tool_name === "read_file");
  assert.equal(denied?.outcome, "blocked");
  const pathDenied = records.find((r) => r.record_type === "decision" && r.tool_name === "read_file" && r.runtime_guard === "filesystem_root");
  assert.equal(pathDenied?.block_reason, "filesystem_path_outside_root");
  assert.equal(pathDenied?.enforcement_decision, "deny");
  assert.equal(allowed?.outcome, "allowed_for_execution");
  assert.ok(records.some((r) => r.record_type === "execution_result" && r.event_id === allowed.event_id));
});
