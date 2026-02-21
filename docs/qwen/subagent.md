# Qwen Interim Guide

## Purpose
- Interim reference for environments using Qwen-based fallback review tooling.

## Current Status
- Not the default reviewer path in this repository.
- Use only when explicitly enabled by governance policy or maintainer override.

## Baseline Expectations
- Keep invocation non-interactive where possible.
- Persist review output under `audit/plan_review_outputs/`.
- Append one-line outcome metadata to `audit/plan_reviews.log` with iteration and result.
