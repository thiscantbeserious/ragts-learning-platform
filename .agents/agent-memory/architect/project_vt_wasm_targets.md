---
name: vt-wasm wasm-pack target behavior
description: wasm-pack targets (nodejs/web/bundler) produce fundamentally different module formats and init patterns — not just syntax changes
type: project
---

wasm-pack `--target nodejs` produces CJS with sync `require('fs')` WASM loading. `--target web` produces ESM but with async `init()` ceremony. `--target bundler` produces ESM expecting a bundler to handle WASM imports. None are drop-in replacements for each other.

**Why:** Discovered during typia-shared-ddl ADR cycle (2026-03-15). The ADR initially understated the vt-wasm ESM conversion as "change a flag in build.sh" when it actually requires rethinking the WASM init pattern in `packages/vt-wasm/index.ts`.

**How to apply:** Any future design touching vt-wasm must account for the init pattern change, not just module syntax. The current `index.ts` wrapper uses `await import()` + sync `mod.create()`, which would need adaptation for `--target web`'s async init.
