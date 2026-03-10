# Coding Principles

Guidelines for maintaining clean, readable, and maintainable code.

## File Naming

**All source files use `snake_case` — NO EXCEPTIONS**

- `pipeline_events.ts` not `pipeline-events.ts`
- `event_bus.ts` not `event-bus.ts`
- `emitter_event_bus.test.ts` not `emitter-event-bus.test.ts`

This applies to all `.ts`, `.vue`, `.css`, and `.test.ts` files under `src/`, `packages/`, and `tests/`. Only exceptions are config files at root level (`vite.config.ts`, `eslint.config.js`, etc.) which follow their ecosystem conventions.

## File Size

**Target: ~400 lines max per file - NO EXCEPTIONS**

All files must stay within this limit, including entry points. Large entry points should delegate to focused modules.

### When to Split

- File exceeds 400 lines
- File handles multiple distinct responsibilities
- Logical groupings emerge that could stand alone

### How to Split

**Modules:** Group by responsibility, keep public API surface small.

**Entry points:** Keep routing/dispatch in the entry point, move handlers to separate modules. The entry point should only:
- Define routes / CLI structure
- Parse input
- Dispatch to handler modules
- Handle top-level errors

## Function Size

**Target: ~20 lines max per function**

Functions should do one thing well. If a function exceeds 20 lines, consider:
- Extracting helper functions
- Breaking into sequential steps
- Separating concerns

### Exceptions

A central dispatch function (like a router or command dispatcher) may exceed 20 lines when it consists primarily of routing to other functions with minimal logic.

## Single Responsibility

**Each function should have one clear intent**

Ask: "What does this function do?" If the answer contains "and", split it.

## Nesting Depth

**Max 3 levels of indentation**

Deep nesting indicates complex logic that should be extracted. Reduce nesting with:
- Early returns / guard clauses
- Extracting inner logic into helper functions

## Documentation

**Document the non-obvious, not the obvious**

Each public function/type should have 1-2 sentences covering:
- Purpose (if not clear from name)
- Connections to other components
- Important constraints or side effects

### What to Document

- **Connections:** "Reads sessions from the Session bounded context"
- **Side effects:** "Creates directory if it doesn't exist"
- **Constraints:** "Requires authenticated user context"
- **Non-obvious behavior:** "Returns empty list for anonymous users"

### What NOT to Document

- Self-evident behavior
- Implementation details that may change
- Redundant type information

## Shared Code Organization (`src/shared/`)

**All types shared between server and client live in `src/shared/types/`**

Organize by domain:
- `src/shared/types/session.ts` — session domain types
- `src/shared/types/pipeline.ts` — pipeline events, stages, status
- `src/shared/types/errors.ts` — error types used in API responses
- `src/shared/types/index.ts` — barrel re-exports

Rules:
- If a type is used by both server and client, it MUST live in `src/shared/types/`
- Never put shared types in `src/server/` or `src/client/`
- Design types to be reusable — avoid server-only concerns (DB rows, adapter interfaces stay in server)
- API response/request shapes belong in shared since both sides need them

**Non-type shared code goes in purpose-based subfolders:**
- `src/shared/parsers/` — parsing utilities (e.g., asciicast parser)
- `src/shared/utils/` — general utilities

Do NOT put loose files directly in `src/shared/` — always use a subfolder.

## Summary Checklist

Before committing, verify:

- [ ] No file exceeds ~400 lines
- [ ] No function exceeds ~20 lines (dispatch-only routing functions may exceed)
- [ ] Each function has single responsibility
- [ ] Nesting depth stays at 3 levels max
- [ ] Public items have 1-2 sentence docs covering non-obvious details
- [ ] Shared types live in `src/shared/types/`, not scattered in server/client
- [ ] No loose files in `src/shared/` — use subfolders by purpose
