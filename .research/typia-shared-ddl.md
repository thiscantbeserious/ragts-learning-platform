# Research: Typia as Shared DDL Layer

> Date: 2026-03-15
> Status: Decision made — Typia + @hono/vite-dev-server + @hono/typia-validator
> Triggered by: Empty session fix needs shared model layer between server and client

## Problem

Erika uses plain TypeScript interfaces in `src/shared/types/` with zero runtime validation. The empty session bug exposed that the client makes rendering decisions based on nullable field checks scattered across templates instead of a proper validated model. Both server and client need a single source of truth that provides: shape definition, runtime validation, TypeScript inference, and derived properties.

## Candidates Evaluated

### Zod v4
- **Pros:** Largest ecosystem, works everywhere (tsx, Vite, vitest), zero setup, incremental adoption, `.transform()` for derived properties, Hono middleware (`@hono/zod-validator`)
- **Cons:** Builder API syntax (`z.object()`) — user dislikes it. 15 kB client bundle (Zod Mini = 1.85 kB). Runtime parsing, not compiled.
- **Verdict:** Reliable but rejected on DX preference

### Valibot
- **Pros:** 1.5 kB bundle, tree-shakeable, Hono support via `@hono/standard-validator`
- **Cons:** Smaller ecosystem than Zod, similar builder syntax
- **Verdict:** Good alternative but same syntax issue as Zod

### ArkType
- **Pros:** 3-4x faster than Zod (independent benchmarks — the "100x" claim is marketing based on outdated Zod v3 comparisons). TS-like string syntax.
- **Cons:** Pre-1.0, smaller ecosystem, breaking changes possible
- **Verdict:** Too immature

### Typia ✅ CHOSEN
- **Pros:** AOT compilation — validates via generated optimized JS functions. Pure TypeScript interfaces as schemas (no DSL). Tops moltar/typescript-runtime-type-benchmarks. Official Hono middleware (`@hono/typia-validator`). Official docs for Hono integration.
- **Cons:** Requires compiler plugin — tsx watch doesn't support it. No runtime schema composition. No `.transform()` for derived properties.
- **Verdict:** Best DX (plain TS interfaces), best performance, build pipeline solved via @hono/vite-dev-server

## The tsx Watch Problem (Solved)

`tsx watch` uses esbuild's Transform API which skips TypeScript compiler plugins. Typia's `typia.validate<T>()` calls become empty stubs at runtime.

### Solutions Evaluated

| Approach | Viability | Notes |
|----------|-----------|-------|
| @typia/unplugin + tsx | ❌ | tsx ignores esbuild plugins |
| vite-node --watch | ❌ **Deprecated** | Replaced by Vite 6 Environment API / Module Runner |
| **@hono/vite-dev-server** | **✅ CHOSEN** | **Official Hono package. Runs Hono through Vite's plugin pipeline. All Vite plugins apply to server code.** |
| tsc --watch + nodemon | ✅ | Guaranteed but slow (~40% of tsx speed) |
| Bun runtime | ❌ | better-sqlite3 incompatible |
| @ryoppippi/unplugin-typia | ❌ | Deprecated (archived June 2025) |

### Decision: @hono/vite-dev-server (Vite 6 native)

**vite-node is deprecated.** Vite 6 has a built-in Environment API and Module Runner that replaces it. `@hono/vite-dev-server` is the official Hono package that runs Hono through Vite's plugin pipeline.

Benefits:
- One `vite` command runs both Hono server and Vue client
- All Vite plugins (@typia/unplugin, vue, etc.) apply to server code automatically
- No tsx, no ts-patch, no vite-node
- HMR for server files (warm reload, not full process restart)
- Watch mode built in
- Single `vite.config.ts` for everything

### Benchmark: Cold Start (2026-03-15, MacOS, Node 25.5.0)

Tested vite-node (before discovering it was deprecated) to validate that the Vite pipeline approach has acceptable performance:

| | Run 1 | Run 2 | Run 3 | Avg |
|---|---|---|---|---|
| **tsx** | 1.331s | 0.728s | 0.726s | **0.93s** |
| **Vite pipeline + @typia/unplugin** | 1.201s | 1.213s | 1.197s | **1.20s** |

**Delta: ~300ms slower** — imperceptible in practice. Typia plugin confirmed active. Server boots and responds 200. @hono/vite-dev-server uses the same Vite pipeline, so performance should be comparable.

## Official Integration Stack

All packages are officially maintained:

| Layer | Package | Maintainer |
|---|---|---|
| Validation runtime | `typia` | samchon |
| Vite plugin | `@typia/unplugin/vite` | samchon (Typia team) |
| Hono validation middleware | `@hono/typia-validator` | Hono team |
| Hono dev server in Vite | `@hono/vite-dev-server` | Hono team |
| Typia + Hono docs | [typia.io/docs/utilization/hono/](https://typia.io/docs/utilization/hono/) | Typia team |

### Unified Vite Config

```typescript
// vite.config.ts — ONE config for server + client + tests
import { defineConfig } from 'vite'
import devServer from '@hono/vite-dev-server'
import UnpluginTypia from '@typia/unplugin/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    UnpluginTypia(),                              // Typia AOT transforms
    devServer({ entry: 'src/server/start.ts' }),  // Hono through Vite
    vue(),                                         // Vue frontend
  ],
  // ... rest of config
})
```

### Route Validation Pattern

```typescript
import { typiaValidator } from '@hono/typia-validator'
import typia from 'typia'

// Plain TypeScript interface — this IS the schema
interface CreateSession {
  filename: string
  size_bytes: number & tags.Minimum<0>
}

app.post('/api/sessions',
  typiaValidator('json', typia.createValidate<CreateSession>()),
  (c) => {
    const data = c.req.valid('json') // fully typed + validated
    // ...
  }
)
```

## tRPC Evaluation (Explored, Deferred)

User initially wanted Typia + tRPC to replace Hono entirely. Research showed:
- tRPC runs on Hono via `@hono/trpc-server` ✅
- tRPC SSE subscriptions (v11+) could replace current EventSource SSE ✅
- **Blockers:** No native file upload (multipart), Vue 3 adapter is community-only, adds complexity for 5 routes
- **Decision:** Defer tRPC to a future cycle. Use Typia with Hono directly for now.

## Migration Plan (High Level)

1. Install `typia`, `@typia/unplugin`, `@hono/vite-dev-server`, `@hono/typia-validator`
2. Update `vite.config.ts` with unified config (server + client + Typia)
3. Replace `tsx watch` in `dev:server` with `@hono/vite-dev-server` (may merge dev:server + dev:client into single `vite` command)
4. Run `npx typia setup` to configure TypeScript plugin (needed for production builds via tsc)
5. Incrementally convert `src/shared/types/*.ts` to use Typia validation tags
6. Add `typiaValidator()` middleware to Hono routes
7. Add runtime validation in client composables for API responses
8. Derived properties: helper functions alongside interfaces (Typia doesn't support transforms)

## Open Questions

- **Derived properties:** Typia can't compute fields during validation. Need a pattern: validate raw data, then enrich with computed fields in a separate step. Is this acceptable or dealbreaker?
- **vitest:** Confirm @typia/unplugin works with vitest plugin pipeline (likely yes — vitest uses Vite internally)
- **Production build:** tsc + ts-patch for production, or Vite build for server too?
- **Error response format:** Typia error objects → API error responses mapping
- **Single vs dual dev server:** Can @hono/vite-dev-server serve both API (port 3000) and Vue client (port 5173), or do we keep separate ports?
- **better-sqlite3 native module:** Confirm it works when server runs through Vite's pipeline (needs to be externalized, not bundled)

## Known Issues

- **VSCode debugger breakpoints:** Typia's AOT compilation can break breakpoints in Hono dev mode ([Issue #777](https://github.com/honojs/middleware/issues/777))
- **"No Transform Configured" error:** Occurs when `typia.createValidate()` is called without the plugin active ([Issue #1177](https://github.com/samchon/typia/issues/1177))

## References

- [Typia Documentation](https://typia.io/)
- [Typia + Hono Guide](https://typia.io/docs/utilization/hono/)
- [Typia + tRPC Guide](https://typia.io/docs/utilization/trpc/)
- [@hono/typia-validator](https://github.com/honojs/middleware/tree/main/packages/typia-validator)
- [@hono/vite-dev-server](https://www.npmjs.com/package/@hono/vite-dev-server)
- [Vite 6 Environment API](https://vite.dev/guide/api-environment)
- [Vite 6 Module Runner (replaces vite-node)](https://vite.dev/changes/ssr-using-modulerunner)
- [moltar/typescript-runtime-type-benchmarks](https://github.com/moltar/typescript-runtime-type-benchmarks)
- [Hono Third-party Middleware](https://hono.dev/docs/middleware/third-party)
