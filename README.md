# Aegis CSG

Decision governance for agent tool calls. AgentRQ stays the control plane. Aegis scores each `permission_request` and returns allow, deny, ask, sandbox, or defer, with evidence, a lineage token, and a replay that another engineer can run from the recorded input.

## What you can do

- Watch a **local synthetic demo stream** of permission requests and open any decision.
- Replay a stored decision from its canonical input and policy snapshot.
- Read RFC-0000 through RFC-0009 in the Contract tab.
- Compare the corpus (200 events, 50 gold labels) against the Go / No-Go budget.
- Export JSONL traces and a metrics CSV.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080.

## Real MCP execution boundary (experimental)

A stdio gateway is available at `scripts/csg-mcp-proxy.mjs`. It evaluates each JSON-RPC `tools/call` **before forwarding it** to the upstream MCP server. Only a decision exactly equal to `allow` is forwarded; `deny`, `ask`, `sandbox`, `defer`, missing identity, malformed calls, evaluation errors, and audit-write errors fail closed. The decision record is appended and fsynced before an allowed call is sent upstream.

Example (replace the upstream command with the MCP server you actually use):

```bash
CSG_WORKSPACE_ID=team-sandbox \
CSG_AGENT_ID=agent-01 \
CSG_AUDIT_PATH=.csg/audit.jsonl \
node scripts/csg-mcp-proxy.mjs -- npx -y @modelcontextprotocol/server-filesystem /safe/root
```

Configure the agent/MCP client to launch **this proxy command instead of the upstream server command**. Do not register a parallel direct connection to the upstream server, or the gate can be bypassed. Use a dedicated test workspace first. The proxy is a local process boundary; it does not automatically intercept unrelated agents, HTTP APIs, or an AgentRQ scheduler. The current rule engine is lexical and conservative: unknown tools and higher-risk actions are held/blocked rather than automatically approved. This experimental gateway is not a production security certification.

## Security and commercial status

This repository includes a deterministic decision engine and an experimental local MCP stdio gateway. The UI's demo stream is generated locally; it is not external runtime evidence. The gateway enforces only calls routed through its configured process. It does not prove that other connection paths are disabled or that a customer production environment is secure.

Before making production-security or paid-commercial claims, review [Security, Commercial, and Customer Acceptance Gates](./SECURITY_COMMERCIAL_ACCEPTANCE_GATES.md). Commercial license approval and customer acceptance require actual owner/customer records; passing CI does not imply either.
