# Architect Memory

## Project Knowledge

- [project_vt_wasm_targets.md](project_vt_wasm_targets.md) — wasm-pack targets (nodejs/web/bundler) produce different module formats AND init patterns, not drop-in replacements
- [project_typia_aot_production.md](project_typia_aot_production.md) — Typia validate/assert are compile-time macros; must address both dev (Vite unplugin) and production (Vite server build) paths
- [project_server_entry_point_pattern.md](project_server_entry_point_pattern.md) — Server needs app factory + bootstrap split (app.ts / bootstrap.ts / start.ts / dev.ts) for Vite dev server HMR

## Feedback

- [feedback_self_review_blockers.md](feedback_self_review_blockers.md) — Always run adversarial self-review on ADRs; verify every claim against actual codebase before presenting
