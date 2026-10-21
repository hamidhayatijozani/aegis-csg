import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = path.resolve("scripts/csg-runtime-preflight.mjs");

async function withConfig(config, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "csg-preflight-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(file, JSON.stringify(config));
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function execute(configPath, server = "agent-tools") {
  return spawnSync(process.execPath, [script, "--config", configPath, "--server", server, "--proxy-path", "scripts/csg-mcp-proxy.mjs"], { encoding: "utf8" });
}

test("passes when named MCP server routes through the expected proxy", async () => {
  await withConfig({ mcpServers: { "agent-tools": { command: "node", args: ["scripts/csg-mcp-proxy.mjs"], env: { CSG_API_TOKEN: "do-not-print" } } } }, (file) => {
    const result = execute(file);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /PREFLIGHT_PASS/);
    assert.doesNotMatch(result.stdout, /do-not-print/);
  });
});

test("fails closed when server connects directly without the proxy", async () => {
  await withConfig({ mcpServers: { "agent-tools": { command: "npx", args: ["some-mcp-server"] } } }, (file) => {
    const result = execute(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not reference expected CSG proxy/);
    assert.doesNotMatch(result.stdout, /PREFLIGHT_PASS/);
  });
});

test("fails when the requested server is missing", async () => {
  await withConfig({ mcpServers: {} }, (file) => {
    const result = execute(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /was not found/);
  });
});

test("fails on invalid JSON", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "csg-preflight-"));
  const file = path.join(dir, "mcp.json");
  await writeFile(file, "{ invalid");
  try {
    const result = execute(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
