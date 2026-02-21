# AGENTS.md

This file defines the **custom instructions and policies** for Codex/GPT-5 agents that will interact with this repository. These policies are designed to:

* Enforce **clear separation of planning vs execution**
* Require **conservative, critical confidence scoring** for all plans
* Encourage **incremental, safe, and auditable development steps**
* Maintain **context integrity** and prevent unsafe or unintended actions
* Ensure **continuous Memory Bank management** to keep context current and accurate

---

## 1. Core Principles

### Planning vs Execution

* The agent **MUST NOT directly execute build or dev commands**.
* The agent may **suggest commands**, but the user alone will execute them.
* Every plan must include:

  * **Step-by-step tasks**
  * **Risks and mitigations**
  * **Confidence score** with rationale

### Confidence Scoring

* All plans **must include a `confidence_score`**.
* Scale: **0-10**, where:

  * 0 = No confidence
  * 5 = Moderate confidence
  * 10 = Very high confidence, strong evidence
* Be **critical and conservative**; default low unless justified by data or prior success.

**Example**

```json
{
  "step": "Validate configuration schema",
  "confidence_score": 6,
  "rationale": "Validation passed but with warnings. Manual review recommended."
}
```

### Baby Steps Methodology

* Break down changes into **smallest meaningful steps**.
* After each step: validate result, document what was done, reflect and improve.
* “**Process is product**”: documentation is as important as the change itself.

---

## 2. Memory Bank Management

Before **any new task**, read and interpret:

* `activeContext.md` – source of truth for priorities
* `progress.md` – task state (derived from Active Context)
* `integrations.md` – key dependencies and systems
* `context_gaps_log.md` – known discrepancies or conflicts

**If discrepancies are found**

1. Log a new entry in `context_gaps_log.md` with a unique Gap ID.
2. Lower confidence scores for all impacted plans until resolved.

**Confidence adjustment**

* If any relevant file has `status: partial`, **cap step confidence at 6/10**.
* If an unresolved gap exists, **overall plan confidence ≤ 5/10**.

### Plan Storage Protocol

* Store every approved plan JSON under `memory-bank/plans/`.
* Use the naming pattern `plan_YYYYMMDD_<slug>.json` (UTC date, descriptive slug).
* Ensure `memory-bank/plans/` exists before writing—create it if necessary and log the creation in `memory_bank_review_log.md`.
* Cross-reference active plans from `activeContext.md` and/or `progress.md` when:
  * the plan drives an active task (listed in priorities or in-flight work), or
  * the plan file will remain in the repository for more than 7 days.
* Cross-references must use the format `[Plan: plan_YYYYMMDD_slug](memory-bank/plans/plan_YYYYMMDD_slug.json)`.
* When a plan is archived after completion +30 days, update the cross-reference to note the retention decision or remove the link if no longer needed.

**Periodic review tiers**

* **Tier 1 (on change):** Append one-line entry to `memory_bank_review_log.md`.
* **Tier 2 (every 25 changes):** Consistency sweep across all Memory Bank files.
* **Tier 3 (every 100 changes):** Full structural audit of the Memory Bank.

**End-of-task**

1. Write a raw reflection to `raw_reflection_log.md`.
2. Sync durable insights to `consolidated_learnings.md`.
3. Append a Tier 1 summary to `memory_bank_review_log.md`.

---

## 3. Context Management

**Thresholds**

* Warning: 0.75
* Caution: 0.85
* Emergency: 0.90

| Threshold             | Action                                                              |
| --------------------- | ------------------------------------------------------------------- |
| **Warn (≥0.75)**      | Summarize, compress, snapshot progress, update memory bank          |
| **Caution (≥0.85)**   | Prioritize P0/P1 info, propose session handoff                      |
| **Emergency (≥0.90)** | Force memory update, generate handoff prompt, halt non-critical ops |

---

## 4. Reflection & Continuous Improvement

After each plan/task:

* Write a **raw reflection** to `memory-bank/raw_reflection_log.md`.
* Consolidate durable lessons in `memory-bank/consolidated_learnings.md`.
* Reflection is **mandatory before task completion**.

---

## 5. Session Continuity

When context is limited, create a **handoff package** using templates:

* `standard`
* `development`
* `research`
* `problem_solving`
* `emergency`

---

## 6. Tool Usage Policies

* **Read before modify** (always inspect file contents first).
* **Replace requires exact match** (avoid unintended globals).
* **Batch related edits** (group related changes).
* **Pre-validate risky ops** (identify possible breaking changes).
* **Error recovery playbook** (always specify rollback steps).

**Forbidden Actions (never run directly)**

* `rm` or file deletions
* `git push`
* `npm run build`
* `npm run dev`

Only **propose** these actions; do not execute.

---

## 7. Subagent Policies

* External code-assist subagents may be used **only in planning mode**, unless explicitly approved.
* Default configuration:

  * `permission_mode = plan_only`
  * `max_turns_default = 10`
  * Allowed tools: `Read`, `Write`
  * Disallowed tools: `Bash(rm)`, `Bash(git push)`, `Bash(npm run build)`, `Bash(npm run dev)`

### 7.1 Plan-Reviewer Workflow

**Scope (mandatory):** Any plan that changes code/config **or** has `overall_confidence.score < 8`. Trivial documentation work may skip automation only when risk is negligible **and** a human approver explicitly signs off.

#### 7.1.1 Preflight checklist

Complete these items before launching a reviewer CLI:

1. **Plan saved:** Ensure the plan JSON lives in `memory-bank/plans/` using the standard naming pattern and is cross-referenced from active work when required.
2. **Repository HOME context:** CLI commands must use the repo as HOME (e.g., `HOME=/path/to/repo`). Copy `.claude/`, `.claude.json`, and any Gemini settings into the workspace if they normally reside in your real HOME directory.
3. **Network access:** Confirm outbound access to `api.anthropic.com` and Gemini endpoints. If offline, skip automation and seek human approval instead.
4. **Credential sanity check:** Run `HOME=/path/to/repo claude --version` (and Gemini equivalent) to verify the CLI boots without prompting for login.
5. **Confidence cap:** If an authentication gap (e.g., 9e0987c6) is still open, keep overall plan confidence ≤ 5 until resolved and document the manual override.

#### 7.1.2 Automated reviewer order

Detailed CLI guidance is maintained in [docs/claude/subagent.md](../claude/subagent.md), [docs/gemini/subagent.md](../gemini/subagent.md), and the [Qwen interim guide](../qwen/subagent.md).

1. **Claude CLI (primary):**

   Preferred invocation (runner script with staged preflight + deterministic logging):

   ```bash
   HOME=/path/to/repo node scripts/run-plan-review.mjs \
     --plan-file memory-bank/plans/<PLAN_ID>.json \
     --plan-id <PLAN_ID> \
     --timeout-seconds 600 \
     --output-mode stream-json
   ```

   Direct invocation (fallback/manual):

   ```bash
   HOME=/path/to/repo claude -p --output-format json \
     --permission-mode plan \
     --max-turns 10 \
     --agents '{
       "plan-reviewer": {
         "description": "Validates and critiques development plans based on AGENTS.md policies.",
         "prompt": "You are a meticulous reviewer. Examine plan structure, risk coverage, confidence scoring, Memory Bank references, and consistency with validation requirements. Identify omissions, policy violations, and propose concrete fixes.",
         "tools": ["Read"]
       }
     }' \
     "Review this plan: <PLAN_JSON>"
   ```

   **Timeout-safe invocation (preferred):** run with a longer execution window (recommendation: ≥600s for full plan reviews), persist output artifacts, and include exit code + elapsed metadata in `audit/plan_reviews.log`.

   ```bash
   HOME=/path/to/repo claude -p --output-format json \
     --permission-mode plan \
     --max-turns 10 \
     --agents '{
       "plan-reviewer": {
         "description": "Validates and critiques development plans based on AGENTS.md policies.",
         "prompt": "You are a meticulous reviewer. Examine plan structure, risk coverage, confidence scoring, Memory Bank references, and consistency with validation requirements. Identify omissions, policy violations, and propose concrete fixes.",
         "tools": ["Read"]
       }
     }' \
     "Review this plan: <PLAN_JSON>" \
     > audit/plan_review_outputs/<PLAN_ID>_round1.json
   ```

2. **Gemini CLI (fallback):** Run only if Claude cannot authenticate/reach network or fallback matrix permits retry.

   ```bash
   HOME=/path/to/repo gemini -p "You are the fallback plan reviewer for AGENTS.md policies. Apply the same standards as the Claude path. Identify policy gaps, missing mitigations, or confidence issues. Review this plan: <PLAN_JSON>"
   ```

#### 7.1.3 Iterations & conflicts

* Maximum **10 total review rounds** (Claude + Gemini combined).
* If reviewer feedback conflicts with validation results, collect the evidence, revise once, and resubmit. Escalate to a human if disagreement remains.
* Stuck-vs-slow heuristic:
  * classify as `slow_but_progressing` when stream events continue within 60s intervals.
  * classify as `stuck` when no stream events arrive for >60s and elapsed time exceeds 75% of timeout budget.

#### 7.1.4 Failure & escalation

* If Claude fails, log `claude_failed` to `audit/plan_reviews.log` (capture stderr/output) and attempt Gemini.
* If Gemini also fails, log `fallback_failed`, include error details, set status `human_review_needed`, and pause work.
* Obtain explicit human approval before proceeding; document the approval timestamp and reviewer identity in the audit log and plan notes.
* Maintain the lowered confidence score (≤5) while automation gaps persist.

#### 7.1.5 Audit logging & approval criteria

Log each attempt to `audit/plan_reviews.log` with: timestamp, plan ID, reviewer (`claude-plan-reviewer`, `gemini-plan-reviewer`, or `human`), iteration count, command metadata, result (`approved`, `approved_with_revisions`, `claude_failed`, `fallback_failed`, `human_review_needed`), summary, and errors.

Approval requires either:

* Automated reviewer returns `approved` / `approved_with_revisions` **and** any required validators pass, or
* Human approver documents acceptance when automation is unavailable.

---

### 7.2 Code-Review Workflow

Once a plan earns approval under Section 7.1, agents must complete a code review before merging or deploying changes. This phase validates the actual edits, enforces Baby Steps, and ensures automation failures fall back to manual oversight.

#### 7.2.1 Plan vs code review comparison

| Trigger | Input artifact | Reviewer/subagent | Output | Authority | Fallback |
| --- | --- | --- | --- | --- | --- |
| Plan authored that touches code/config | Plan JSON | `claude-plan-reviewer` (Gemini fallback) | `approved` / `approved_with_revisions` / `human_review_needed` | Blocks plan execution | Human governance owner (manual approval) |
| Post-plan implementation code change (default) | Commit diff / PR | Subagent pre-review (Claude/Gemini) + manual reviewer (project maintainer by default) | Subagent findings + `approved` / `revisions_requested` notes in `audit/code_reviews.log` | Blocks merge until resolved | For hotfixes, review may occur post-merge but must be logged within 24h |
| Post-plan implementation during automation pilot | Commit diff / PR | Automated code-review prompt (Claude/Gemini) + manual reviewer | Automated verdict + manual confirmation | Blocks merge; automation cannot auto-merge | After two automation failures, switch to manual-only flow |

#### 7.2.2 Manual-first flow (Baby Steps)

1. Complete Section 7.1 plan-review approval.
2. Implement the smallest meaningful change (≤1 function or ≤50 LOC). For larger efforts, commit in increments; multi-file refactors require per-module checkpoints.
3. Run a post-implementation subagent review on the increment diff (Claude first, Gemini fallback) and capture the output before requesting human review.
4. Request code review from the designated reviewer (currently the project maintainer, Shawn) before merging each increment.
5. Log the outcome in `audit/code_reviews.log` with Baby Steps context (e.g., which function, LOC count, follow-up actions).
6. Address feedback, rerun required validators, and repeat until all increments merge.

#### 7.2.3 Automation pilot

* Criteria to enable automation: ≥95% successful reviewer authentication for 30 consecutive days, ≤1 outage longer than 30 minutes, and stakeholder approval logged in `memory-bank/progress.md`.
* When enabled, run the automated code-review prompt (Claude/Gemini). Manual reviewer must still confirm the outcome before merge.
* Disable automation if any of the following occur: two consecutive automation failures, authentication gaps logged in `context_gaps_log.md`, or stakeholder veto. Revert to manual-only flow until criteria are re-met.

#### 7.2.4 Tooling checkpoints & fallbacks

* **Pre-session commands:**
  * `HOME=/repo claude --version`
  * `HOME=/repo gemini --version` (if automation pilot enabled)
  * `npm run lint -- --check` (or repo-specific equivalent) to ensure static analysis tooling is healthy.
* **Failure handling:** Retry each command once. If it still fails, switch to manual diff review, record the incident in `memory-bank/context_gaps_log.md` (new GAP ID) and `audit/code_reviews.log`, and notify the project maintainer.
* **Emergency hotfixes:** If production impact forces immediate merge, log the hotfix and complete manual code review within 24 hours.

#### 7.2.5 Logging & audit expectations

* Record every review in `audit/code_reviews.log` using the schema `timestamp | component:code-review | reviewer | outcome | fallback_triggered | notes`.
* Example entries:

  ```
  2025-10-22T09:15:03Z | component:code-review | reviewer:shawn | outcome:approved | fallback_triggered:false | Baby Steps checkpoint: cart.ts refactor (32 LOC)
  2025-10-22T09:47:55Z | component:code-review | reviewer:shawn | outcome:revisions_requested | fallback_triggered:false | Missing analytics event update
  2025-10-22T10:05:11Z | component:code-review | reviewer:automation_pilot | outcome:manual_override | fallback_triggered:true | Automated reviewer timeout; manual diff review completed
  ```
* Manual review notes should reference Baby Steps increments. Automated reviews must append the automation transcript or link to the CLI output when available.

---

## 8. Example Plan Output

```json
{
  "steps": [
    {
      "description": "Run configured static checks on all files",
      "confidence_score": 7,
      "rationale": "Previous run passed with only minor warnings."
    },
    {
      "description": "Generate asset build plan",
      "confidence_score": 5,
      "rationale": "Some new scripts have not been validated yet."
    }
  ],
  "risks": [
    {"description": "Potential build errors due to new dependencies"},
    {"description": "Missing required metadata fields during deployment"}
  ],
  "overall_confidence": {"score": 6, "rationale": "Static checks green; gaps remain on runtime validation."}
}
```

---

## 9. Security & Audit

* **Audit trail enabled:** log every plan-review invocation, code review decision, and validation result to `audit/`.
* **Code review log:** append each Baby Steps checkpoint to `audit/code_reviews.log` using the schema from Section 7.2.5 (`timestamp | component:code-review | reviewer | outcome | fallback_triggered | notes`). Include manual override reasons when automation pilot is active.
* **Tooling readiness checklist:** before each review session validate CLI authentication (`HOME=/repo claude --version`, `HOME=/repo gemini --version`) and lint/format tooling (`npm run lint -- --check` or equivalent). Record failures and fallback actions in `memory-bank/context_gaps_log.md` and `audit/code_reviews.log`.
* **Source validation:** trust but verify code/data sources.
* **Rollback:** Governance owner (project maintainer) may revert the policy when triggers occur: stakeholder veto within 7 days, >3 sequencing conflicts per two-week cycle, or reviewer tooling outage >72 hours. Execute rollback within 24 hours, notify stakeholders within 48 hours, and document remediation within 72 hours.

### 9.1 Post-implementation metrics & review cadence

* **Baseline metrics:** capture current defect escape rate and average review turnaround time before rollout. Update baselines in `memory-bank/progress.md` when metrics are recorded.
* **Leading indicators:** number of issues caught during code review, average review turnaround per Baby Steps increment, tooling uptime percentage. Reviewed weekly by governance owner.
* **Lagging indicators:** production incidents linked to unreviewed code, number of manual overrides triggered, compliance audit findings. Reviewed monthly.
* **Remediation loop:** if metrics show degradation (e.g., turnaround >2 days or frequent manual overrides), revisit automation readiness, retrain reviewers, or adjust Baby Steps thresholds. Document follow-up actions in `memory-bank/progress.md` and `memory-bank/consolidated_learnings.md`.

---

## 10. Summary

This `AGENTS.md` ensures Codex/GPT-5 operates in a **safe, auditable, incremental** way with:

* Rigorous planning and conservative confidence scoring
* Structured subagent review (**Claude**, with **Gemini** fallback)
* Strong tool restrictions and error handling
* Continuous improvement via Memory Bank reflections


---
