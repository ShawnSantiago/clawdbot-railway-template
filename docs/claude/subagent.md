# Claude Plan-Reviewer Guide

## Purpose
- Primary automated reviewer for plan validation under `AGENTS.md` section 7.1.

## Preferred Invocation
```bash
HOME=/path/to/repo node scripts/run-plan-review.mjs \
  --plan-file memory-bank/plans/<PLAN_ID>.json \
  --plan-id <PLAN_ID> \
  --timeout-seconds 600 \
  --output-mode stream-json
```

## Expected Artifacts
- Review output: `audit/plan_review_outputs/<PLAN_ID>_round<N>_claude.json`
- Summary log line: `audit/plan_reviews.log`

## Notes
- Use repository as `HOME` so CLI credentials/settings resolve in-workspace.
- Prefer `stream-json` for long reviews to preserve progress events and terminal `type:"result"` classification.
