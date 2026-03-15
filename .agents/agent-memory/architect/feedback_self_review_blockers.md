---
name: Adversarial self-review catches real blockers
description: Always run adversarial self-review on ADRs before presenting — the typia-shared-ddl cycle found 3 blockers that the initial design missed
type: feedback
---

Run an adversarial self-review against the actual codebase before presenting an ADR as ready. Check every assumption against real file contents.

**Why:** The typia-shared-ddl ADR (2026-03-15) initially contained 3 blockers: (1) server entry point incompatible with Vite dev server, (2) node:sqlite still experimental in Node 24, (3) wasm-pack targets don't produce drop-in ESM. All three were caught by reviewing the ADR's claims against actual codebase state. Without the self-review, engineers would have hit these mid-implementation.

**How to apply:** After drafting an ADR, systematically verify: (a) every API/library claim against actual docs or source, (b) every "N files affected" count against actual grep results, (c) every "this is a small change" claim against the actual code shape. Write findings in `.state/<branch>/REVIEW-ARCHITECT.md` and resolve blockers before presenting.
