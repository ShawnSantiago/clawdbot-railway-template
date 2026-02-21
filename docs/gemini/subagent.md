# Gemini Fallback Guide

## Purpose
- Fallback reviewer when Claude path fails or fallback matrix requires retry.

## Invocation
```bash
HOME=/path/to/repo gemini -p "You are the fallback plan reviewer for AGENTS.md policies. Apply the same standards as the Claude path. Identify policy gaps, missing mitigations, or confidence issues. Review this plan: <PLAN_JSON>"
```

## Expected Artifacts
- Fallback output: `audit/plan_review_outputs/<PLAN_ID>_round<N>_gemini.txt`
- Summary log line: `audit/plan_reviews.log`

## Notes
- Run only when Claude fails or fallback matrix permits.
- If Gemini requires interactive auth in non-interactive mode, classify as fallback failure and escalate per `AGENTS.md`.
