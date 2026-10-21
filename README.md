# Aegis CSG

Decision governance for agent tool calls. AgentRQ stays the control plane. Aegis scores each `permission_request` and returns allow, deny, ask, sandbox, or defer, with evidence, a lineage token, and a replay that another engineer can run from the recorded input.

## What you can do

- Watch a live stream of permission requests and open any decision.
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
