# Aegis CSG

Three desks in one app.

- **Aegis** decides whether an agent tool call is trusted: allow, deny, ask, sandbox, or defer, with evidence, a lineage token, and replay.
- **Thoth** scores a fixed synthetic price series with Shannon entropy, Wilder ADX, and EMA momentum, then runs a paper backtest. It does not send orders.
- **Claims** splits a paragraph into observations, inferences, explanations, and ontology claims, and shows which sentence fails to support the next.

## What you can do

- Watch a local synthetic demo stream of permission requests and open any decision.
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

## Security and commercial status

This repository currently demonstrates the CSG decision engine and replay workflow. The stream's `liveEvent()` entries are generated locally; they are **not** proof of requests intercepted from an external agent or tool runtime. The UI and replay corpus do not establish production enforcement, bypass resistance, or durable evidence after restart.

Before making production-security or paid-commercial claims, review [Security, Commercial, and Customer Acceptance Gates](./SECURITY_COMMERCIAL_ACCEPTANCE_GATES.md). Commercial license approval and customer acceptance must be supported by actual owner/customer records; they are not implied by passing CI.
