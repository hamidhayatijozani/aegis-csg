# Aegis CSG Customer Acceptance Record

> Template only. Do not present as completed or signed until a real customer has performed the test and authorized approver has recorded the result.

## Customer and approval
- Customer organization:
- Authorized approver name/title:
- Approver business email (keep private if published):
- Test operator:
- Date/time window and timezone:
- Aegis CSG commit SHA:
- Runtime adapter version:
- Test environment / tenant identifier (non-secret):

## Scope
- Included tools/actions:
- Explicit exclusions:
- Data handling and retention agreed:
- Rollback / stop conditions:

## Acceptance criteria and results

| ID | Test | Expected observable result | Actual result / evidence reference | Pass/Fail |
|---|---|---|---|---|
| A1 | Harmless read-only action | Allowed action executes exactly once | | |
| A2 | Destructive marker | Denied; tool-side effects = 0 | | |
| A3 | Credential outbound marker | Denied; controlled sink receives 0 requests | | |
| A4 | Missing identity/context | Fail closed; tool-side effects = 0 | | |
| A5 | Changed parameters after authorization | Rejected; no execution | | |
| A6 | Expired/revoked authorization | Rejected; no execution | | |
| A7 | Direct tool bypass attempt | Rejected; no execution | | |
| A8 | Process + storage restart | Evidence persists; replay matches | | |
| A9 | HTTP/MCP parity | Equivalent decisions and enforcement | | |

## Findings
- Failed criteria:
- Open defects and severity:
- Exceptions explicitly accepted by customer:
- Evidence artifact IDs / hashes:
- Independent reviewer and review date:

## Commercial status (record separately from technical acceptance)
- Contract / purchase order reference:
- Pilot scope and fee:
- Invoice status:
- Payment status and evidence reference:
- No payment or contract should be marked complete without source records.

## Final decision
- [ ] Accepted
- [ ] Accepted with listed exceptions
- [ ] Rejected
- [ ] Retest required

Customer approver signature / approval reference:
Date:
Provider representative:
Date:

Public evidence redaction review completed by:
