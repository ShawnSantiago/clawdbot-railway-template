# Consolidated Learnings

## Durable Insights
- Keep a ready baseline Memory Bank in-repo to enforce consistent planning and audit behavior.
- Treat `status: partial` files as explicit confidence constraints until completed.
- Before planning fixes from external suggestions, verify current code first to avoid duplicate work (e.g., already-shipped health endpoints/logging).
- Automated reviewer invocations can hang when given very large inline plan payloads; keep audit evidence and require manual approval fallback immediately after primary+fallback failure.
- For long non-interactive reviewer runs, `--output-format json` may produce empty artifacts when killed early; stream output plus explicit timeout/exit-code logging materially improves diagnosis.
- Track account-state failures (credit/auth) as separate context gaps from transport/timeouts; remediation paths differ and should not share a single ambiguous gap.
- Transient reviewer failures can self-resolve on retry; retain full attempt history and avoid collapsing distinct outcomes into a single final status.
- A dedicated runner script with staged preflight and deterministic classification materially reduces manual triage time compared to ad-hoc shell invocations.
- Capturing preflight stage artifacts separately from final reviewer artifacts makes it easier to close or reopen context gaps with concrete evidence.
- Audit command metadata should redact plan payloads; full plan content belongs in artifacts, not in one-line audit records.
- For stream-json reviewer output, classify success/failure from terminal `type:"result"` events first; broad keyword scans over assistant text can create false failure escalations.
- Keeping AGENTS “script-first” reviewer invocations aligned with actual repository docs/scripts prevents policy drift and failed operational handoffs.
- `error_max_turns` can appear with `is_error:false`; approval logic should prefer terminal subtype semantics over optimistic text heuristics when classifying review outcomes.
- When a newer successful attempt exists, keep prior anomalous attempts in audit history but explicitly track unresolved classifier issues as open context gaps.
- Treat terminal subtype `error_max_turns` as a hard non-approval state even when `is_error:false`; reviewers may exhaust turns before issuing a valid verdict.
- For direct `claude -p` code-review runs, `--output-format json` avoids the `stream-json` + `--print` verbosity constraint and yields a stable artifact for audit parsing.
- Manual signoff entries are more auditable when medium-risk findings are explicitly dispositioned inline and linked to the originating review artifact.
