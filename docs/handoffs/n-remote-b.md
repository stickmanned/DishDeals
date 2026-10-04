# N-REMOTE-B handoff

- Status: review (local commits only). Branch `t-19-backend-preservation-integration`, base `475146057701b7f4ea6d7e8e3484b40cd9ba6447`. Head SHA: see commit reply.
- Commits: patch applied via `git am --3way` (a7248c4, 30c406a), corrections `3dc4b26`, docs commit.
- Details, matrix and corrected CLI notes: `docs/integration/backend-preservation-applied.md`.
- Done: Anonymous restored beside Password; new workflow outputs `needs_review`; typed env everywhere preserved; explicit models; separate workflow gate; Instagram/Meta block kept; `.env.example` names.
- Checks: see commit reply for exact tsc/eslint/vitest/workflow/guard results.
- Unrun: target inspection, backup, deploy, codegen, live providers, hosting, frontend/native, phone. No cloud or secret access.
- Needs decisions: guests (Anonymous) can use sign-in-only canonical features; deployments must set the explicit model names; frontend must send Instagram captions as text.
- Stop condition met; no next ticket started.
