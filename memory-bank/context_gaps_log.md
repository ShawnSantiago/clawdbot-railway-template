# Context Gaps Log

`last_updated_utc`: 2026-02-21T04:17:25Z

## Open Gaps
- None.

## Closed Gaps
- GAP-20260221-004: Closed after updating runner classification to treat terminal `error_max_turns` as `claude_max_turns_reached` and validating via forced max-turn run.
- GAP-20260221-001: Closed after scripted reviewer run succeeded with deterministic timeout/output handling and non-dry-run rehearsal artifacts.
- GAP-20260221-002: Closed after preflight and reviewer probes returned successful non-interactive CLI execution.
- GAP-20260221-003: Closed after fixing false `claude_credit_or_quota_failure` classification caused by broad keyword matching in stream-json output.

## Gap Entry Template
| Gap ID | Date Detected (UTC) | Description | Impact | Owner | Status | Resolution Date (UTC) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-20260221-004 | 2026-02-21T04:06:12Z | `plan_20260221_railway_reliability_hardening_round5_claude.json` ended with terminal subtype `error_max_turns`, but runner recorded `approved_with_revisions`. | Potential false-positive approval outcomes in audit log until classifier is fixed. | project maintainer | closed | 2026-02-21T04:17:25Z | Fixed in `scripts/run-plan-review.mjs` by mapping terminal subtype `error_max_turns` to `claude_max_turns_reached`; validated by round7 forced max-turn run in `audit/plan_reviews.log`. |
| GAP-20260221-001 | 2026-02-21T02:42:33Z | Claude and Gemini plan-review CLIs timed out/hung when invoked non-interactively with full plan JSON payload. | Automated review unavailable; plan execution must pause for explicit human approval; confidence remains capped at <=5. | project maintainer | closed | 2026-02-21T03:27:47Z | Mitigated via `scripts/run-plan-review.mjs`; verified by `audit/plan_review_outputs/plan_20260221_reviewer_automation_stability_round7_claude.json`. |
| GAP-20260221-002 | 2026-02-21T03:05:27Z | Claude CLI returned `Credit balance is too low` during non-interactive reviewer test runs. | Automation can fail immediately regardless of timeout tuning; confidence remains capped at <=5 until billing/credits are restored. | project maintainer | closed | 2026-02-21T03:27:47Z | Latest preflight probes passed for Claude/Gemini; see `audit/plan_review_outputs/preflight_validation_20260221.log`. |
| GAP-20260221-003 | 2026-02-21T03:32:12Z | Claude stream-json classifier marked a successful run as `claude_credit_or_quota_failure` because response text mentioned quota-related terms. | False `human_review_needed` escalation and invalid Step 6 evidence until classifier fix is applied. | project maintainer | closed | 2026-02-21T03:34:53Z | Fixed in `scripts/run-plan-review.mjs` by parsing terminal `type:"result"` events and narrowing credit/quota error signatures; validated by `audit/plan_review_outputs/plan_20260221_reviewer_automation_stability_round9_claude.json`. |
| GAP-YYYYMMDD-001 | 2026-02-21T00:00:00Z | Example discrepancy | Confidence cap, plan delay | TBD | open | TBD | Replace template row with real entries. |
