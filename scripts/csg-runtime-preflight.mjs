#!/usr/bin/env node
/**
 * CSG Runtime Preflight
 *
 * Checks that an MCP client configuration routes a named server through the
 * expected CSG proxy before an operator attempts a live attachment.
 * This is a configuration check, not proof that a live agent uses the config.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Usage: node scripts/csg-runtime-preflight.mjs --config <path> --server <name> --proxy-path <path>");
    process.exitCode = 2;
    return;
  }

  if (!options.config || !options.server || !options["proxy-path"]) {
    console.error("Usage: node scripts/csg-runtime-preflight.mjs --config <path> --server <name> --proxy-path <path>");
    process.exitCode = 2;
    return;
  }

  const configPath = path.resolve(options.config);
  const expectedProxy = options["proxy-path"].replaceAll("\\", "/");
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
    pass("MCP configuration is readable JSON");
  } catch {
    fail("MCP configuration is missing, unreadable, or invalid JSON");
    return;
  }

  const servers = config.mcpServers ?? config.servers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    fail("No mcpServers/servers object found");
    return;
  }

  const server = servers[options.server];
  if (!server || typeof server !== "object") {
    fail(`Server entry "${options.server}" was not found`);
    return;
  }
  pass(`Server entry "${options.server}" exists`);

  if (typeof server.command !== "string" || !server.command.trim()) {
    fail("Server command is missing");
    return;
  }
  if (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== "string")) {
    fail("Server args must be an array of strings");
    return;
  }
  pass("Server command and args have valid types");

  const commandAndArgs = [server.command, ...server.args].join(" ").replaceAll("\\", "/");
  if (!commandAndArgs.includes(expectedProxy)) {
    fail(`Server does not reference expected CSG proxy path: ${expectedProxy}`);
    return;
  }
  pass("Server command routes through the expected CSG proxy");

  if (server.disabled === true || server.enabled === false) {
    fail("Server is explicitly disabled");
    return;
  }
  pass("Server is not explicitly disabled");

  const env = server.env && typeof server.env === "object" ? server.env : {};
  const secretKeys = Object.keys(env).filter((key) => /TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY/i.test(key));
  const missingSecretKeys = secretKeys.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");
  if (missingSecretKeys.length) {
    fail(`Required-looking environment variables are empty: ${missingSecretKeys.join(", ")}`);
    return;
  }
  if (secretKeys.length) pass(`Secret-like environment variables are present (${secretKeys.join(", ")}); values were not printed`);
  else console.log("INFO  No secret-like environment variables declared in this server entry");

  console.log("RESULT  PREFLIGHT_PASS");
  console.log("LIMIT   This checks configuration only; it does not prove the running agent loads this file or that bypass paths are closed.");
}

main().catch(() => {
  console.error("FAIL  Unexpected preflight error; details suppressed to avoid leaking configuration");
  process.exitCode = 1;
});
