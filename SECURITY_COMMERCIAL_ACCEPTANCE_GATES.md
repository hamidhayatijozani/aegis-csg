# Aegis CSG: Security, Commercial, and Customer Acceptance Gates

**Status:** evidence plan; not a claim of production certification or customer acceptance.  
**Scope:** `hamidhayatijozani/aegis-csg`.  
**Rule:** a green unit-test workflow is not evidence that an external tool was actually blocked.

## 1. What the repository can prove locally

The security-contract test suite checks deterministic engine behavior for:
- destructive shell patterns are denied even when YOLO is enabled;
- destructive SQL is denied;
- credential-like data sent to an outbound destination is denied;
- incomplete requests return `defer`;
- replay of the same sanitized request matches its recorded lineage;
- replay detects changed request data;
- email/token-like values are redacted by the sanitizer.

These tests exercise the decision engine via Vite's SSR module loader. They do **not** prove that an agent runtime honors the decision, that a tool cannot bypass the gate, or that evidence survives process/database restart.

## 2. Required independent runtime proof (not yet established)

The repository's own RFC-0000.5 explicitly says enforcement is out of scope until Go and that this build has no live AgentRQ socket. Therefore, the current branch can test the decision engine but cannot honestly demonstrate end-to-end blocking in an external tool runtime. The UI's `enforce` mode is a decision-engine mode, not proof of an external execution interlock.

Run only against a dedicated, non-production test tenant and a harmless test tool. Record timestamp, commit SHA, environment identity, sanitized request, gate response, tool-side effect counter, durable event ID, and replay result. Do not include credentials or real personal data.

| Case | Required observable result |
|---|---|
| Allowed read-only action | Gate allows; test tool executes exactly once |
| Destructive command marker | Gate denies; tool-side effect counter remains zero |
| Outbound credential marker | Gate denies; no outbound request reaches the controlled sink |
| Missing required identity/context | Fail closed; tool-side effect counter remains zero |
| Replay same event | Decision and lineage match exactly |
| Mutate request after approval | Old authorization cannot be reused; execution is rejected |
| Expire/revoke authorization | Subsequent execution is rejected |
| Restart gate and storage | Prior evidence is still queryable and replayable |
| Direct tool invocation bypassing gate | Tool rejects request; no side effect |
| HTTP and MCP paths | Equivalent policy outcome; neither path bypasses enforcement |

**Acceptance rule:** fail the release if any denied, expired, mutated, or bypass attempt produces a tool-side effect. Save raw test logs as a CI artifact and independently review them. A browser counter or synthetic demo event is not a tool-side effect.

## 3. Commercial license gate

At review time, the root `LICENSE` path was not found and `package.json` declares `"private": true`. This is **not** a legal conclusion about ownership or permission. It means commercial redistribution/use terms are not established by the checked repository evidence.

Before offering a paid pilot:
1. The rights holder must select and approve the intended license or proprietary terms.
2. Add the approved license/terms and third-party notices.
3. Review dependency licenses and any inherited code/assets.
4. Record who approved the terms and the effective date.
5. Obtain qualified legal review where needed.

No license text is invented by this change. Do not claim “commercially cleared” until the owner-approved terms and dependency review are recorded.

## 4. Customer acceptance gate

A demo, repository star, verbal interest, or internal test is not customer acceptance. Obtain a real customer-approved record containing:
- customer organization and authorized approver;
- agreed scope and exclusions;
- test environment and test window;
- objective acceptance criteria, including denied-action side effects = zero;
- observed results, unresolved defects, and exceptions;
- explicit written acceptance or rejection;
- pilot fee, invoice/contract status, and payment evidence kept separately.

Redact confidential identifiers in public evidence. Do not fabricate customer names, signatures, contracts, invoices, or payment status.

## 5. Release status vocabulary

- **PASS:** artifact and evidence directly establish the gate.
- **FAIL:** a required condition was observed to fail.
- **BLOCKED:** required external access/approval is missing.
- **UNKNOWN:** evidence is insufficient to decide.
- **NOT_RUN:** the test has not been executed.

Current known status when this document was authored:
- Engine unit-level security contract: **NOT_RUN in CI** until this branch's workflow completes.
- Real external tool enforcement / bypass / restart persistence: **UNKNOWN**.
- Commercial license approval: **BLOCKED** pending rights-holder decision and dependency review.
- Customer acceptance: **BLOCKED** pending a real customer-run test and written acceptance.
- Paid pilot/payment: **NOT EVIDENCED**.

Do not promote the product to production security claims based on this checklist or unit tests alone.
