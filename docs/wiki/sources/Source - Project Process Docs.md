---
title: "Source - Project Process Docs"
type: source
tags: [process, multi-agent, provenance]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["AGENTS.md", "CLAUDE.md", "docs/team-integration.md", "docs/agent-workflow.md", "docs/decisions/", "docs/tasks/", "docs/handoffs/", "docs/workflow/"]
---

# Source - Project Process Docs

## Summary

This repo is built by a human product owner (William), a human frontend developer (Harry), a human map developer (Pinyuan), and a rotating set of AI coding agents (Claude Code, Gemini, Codex/GPT) coordinated by an orchestrator role ("Northstar") through a tool called Maestri, each agent working in its own Git worktree on one bounded ticket at a time. The root checkout's branch is actively switched by this orchestration process, not only by a human — this wiki pins its claims to commit `6c69d94` on branch `t-00-agent-workflow` for that reason. This source page exists so code-focused wiki pages can link to "the process" without duplicating it.

## Key Points

- Canonical scope split: agents build functional backend/logic core; the human frontend teammate owns visual polish; the human map teammate owns all map/geocoding/pin UI decisions (`AGENTS.md`, `docs/team-integration.md`).
- Original plan was web-first with a feed home screen; a later product-direction update (`docs/team-integration.md`, "Product direction update — October 3, 2026") changed this to: a real installed iOS app, map as the home screen, Instagram-native-share as the dominant demo path, with screenshot/flyer upload as additional input methods.
- Every external provider integration (Gemini, Geoapify, Nominatim, the old Reel-scraping API) is gated behind an explicit `*_USAGE_AUTHORIZED` environment flag, separate from whether an API key is configured — see [[Environment Gated Providers]]. This is a direct response to a standing rule: never fabricate or imply live provider/device evidence that hasn't actually run.
- The codebase distinguishes, in comments and handoffs, between "synthetic/in-memory test evidence," "live provider evidence," and "real iPhone acceptance evidence" — these are never conflated. `docs/workflow/coverage.md` tracks ticket-by-ticket which category of evidence exists for each feature.
- Two independently-built extraction pipelines (Reel-video and "teammate workflow") exist side by side rather than merged; `docs/decisions/0001-teammate-backend-integration.md` is the ADR explaining why (preserve both, reconcile field mappings, don't build a competing system blind). See [[Reel Ingestion Workflow]] and [[Teammate Workflow Pipeline]].
- Ticket IDs referenced in code comments (e.g. "T-08G-B", "N-FORM-UI", "N-REMOTE-A") correspond to packets in `docs/tasks/` and handoffs in `docs/handoffs/`; `docs/workflow/tasks.json` is the live manifest.

## Entities Mentioned

- [[Environment Gated Providers]] — the `*_USAGE_AUTHORIZED` pattern this process enforces.
- [[Reel Ingestion Workflow]], [[Teammate Workflow Pipeline]] — the two pipelines whose coexistence is explained by `docs/decisions/0001-teammate-backend-integration.md`.

## Concepts Covered

- Parallel multi-agent development with isolated worktrees and one-ticket-at-a-time scoping.
- Evidence-tier discipline (synthetic vs. live vs. device-acceptance).

## Raw Notes

- `AGENTS.md` (repo root) — agent operating instructions, current as of each run; states "Root main is human-owned" and "All autonomous workers use separate worktrees."
- `docs/team-integration.md` — ownership boundaries plus the October 3, 2026 product-direction update (source: a Codex interview with William).
- `docs/agent-workflow.md` — the worktree/branch roster, Git loop, and model-routing history.
- `docs/decisions/0001-teammate-backend-integration.md` — ADR on preserving the teammate's extraction branch.
- `docs/workflow/coverage.md` — the running ticket-by-ticket evidence ledger (dense, append-only; read selectively).
- `docs/tasks/`, `docs/handoffs/` — individual ticket packets and completion handoffs.

This page is a pointer, not a replica — read the originals for anything process/status-related; this wiki documents the code, not the schedule.
