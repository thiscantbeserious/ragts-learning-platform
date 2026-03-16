# ADR: Generic Worker Pool for Pipeline Processing

## Status
Accepted

## Context

The session processing pipeline (validate, detect, replay, dedup, store) currently has two problems:

1. **Throwaway workers:** `replay.ts` spawns a new `Worker` per job. Each worker loads the WASM binary from scratch (~50ms), processes one job, and dies. No thread reuse, no warm-up amortization.

2. **Main-thread bottleneck:** Only the replay stage is offloaded to a worker. Validate (file I/O + parsing), detect (CPU), and dedup (CPU) all run on the main event loop. While individually fast, they compound under concurrent uploads.

3. **No backpressure:** The orchestrator's `MAX_CONCURRENT = 3` guards at the job level, but there is no queuing or pressure signaling when all slots are occupied — jobs are silently deferred via `drainPending()` polling.

4. **Plain JS worker:** `replay_worker.js` is untyped JavaScript to avoid needing a build step, losing type safety on the message protocol.

5. **No graceful shutdown:** Workers are abandoned on server stop — `PipelineOrchestrator.stop()` waits for in-flight promises but does not terminate workers.

### Forces

- The replay stage is CPU-bound (8+ seconds for large 60K-event sessions) and must not block the main thread.
- Validate does streaming file I/O — `node:fs` and `node:readline` work in worker threads.
- Detect and dedup are pure synchronous CPU — no I/O, no WASM calls at runtime.
- Store needs the SQLite DB connection — `better-sqlite3` is not thread-safe and cannot be shared across workers.
- The WASM module (`#vt-wasm`) resolves via package.json `imports` field, which works in worker threads.
- `initVt()` is a module-global singleton per V8 isolate — each worker must call it once, then it stays warm.
- The Vite server build already compiles TypeScript to JavaScript, so compiled worker paths are available in production.

## Options Considered

### Option 1: Generic Worker Pool with Message Protocol (chosen)

A reusable `WorkerPool<TPayload, TResult>` class that manages N pre-warmed workers. Workers load WASM at startup and stay alive indefinitely. The pool dispatches jobs via `postMessage`, queues excess work in a FIFO, replaces crashed workers automatically, and exposes pool stats for observability.

The pipeline worker runs validate+detect+replay+dedup in sequence, returning a `ProcessedSession` (minus the DB write). Store remains on the main thread.

- Pros: Full control over init timing/message protocol/lifecycle, reusable for future CPU tasks, aligns with project's adapter pattern, no new dependencies
- Cons: More upfront code (~4 files), must handle tsx-in-dev vs compiled-in-prod worker resolution

### Option 2: Piscina (third-party pool)

Use the `piscina` library from the Node.js team for pool lifecycle, queuing, stats, and crash recovery.

- Pros: Battle-tested, less code to maintain, built-in abort support
- Cons: New dependency, less control over WASM init timing, abstracts details needed for debugging, opinionated worker lifecycle

### Option 3: SharedArrayBuffer Zero-Copy

Use `SharedArrayBuffer` + `Atomics` to pass event data without structured clone overhead.

- Pros: Zero-copy for huge sessions
- Cons: Extreme complexity (manual memory layout, atomics), fragile, overkill — structured clone of 60K events is ~10ms vs 8s replay time

## Decision

**Option 1: Generic Worker Pool.** The structured clone overhead is negligible compared to actual processing time. Full control over WASM warm-up, message protocol, and lifecycle aligns with the project's pattern of explicit adapter/impl abstractions. No new dependencies.

### Key Design Decisions

1. **Pool size:** Defaults to `os.availableParallelism() - 1` (leave one core for main thread), configurable via constructor. Minimum 1.

2. **Pre-warmed workers:** Each worker calls `initVt()` on startup and sends a `{ type: 'ready' }` message. The pool waits for all workers to report ready before accepting jobs. This amortizes the ~50ms WASM load across all future jobs.

3. **Message protocol:**
   - Main -> Worker: `{ type: 'job', id: string, payload: TPayload }`
   - Worker -> Main: `{ type: 'ready' }` | `{ type: 'result', id: string, ok: true, result: TResult }` | `{ type: 'result', id: string, ok: false, error: string }`

4. **Pipeline worker scope:** Runs validate+detect+replay+dedup in sequence. Receives `{ filePath, sessionId }`, returns `ProcessedSession` (snapshot JSON, sections, counts). Store stays on main thread because `better-sqlite3` is not shareable across threads.

5. **Backpressure:** When all workers are busy, new jobs enter a FIFO queue. `pool.execute(payload)` returns a Promise that resolves when the job completes (whether immediately dispatched or queued). Queue depth is exposed via `pool.stats()`.

6. **Crash recovery:** If a worker exits unexpectedly (non-zero exit, uncaught error), the pool: (a) rejects the in-flight promise for that worker's job, (b) spawns a replacement worker and waits for its `ready` signal, (c) does NOT auto-retry the failed job — the orchestrator's existing error handling marks it as failed.

7. **Graceful shutdown:** `pool.shutdown()` stops accepting new jobs, waits for in-flight jobs to complete (with a configurable timeout), then terminates all workers. Outstanding queued jobs are rejected with a shutdown error.

8. **TypeScript workers:** Workers are authored as `.ts` files. In production, the Vite server build compiles them to `.js` and the pool uses the compiled path. In development under Vite's dev server, the worker path resolves through the same mechanism as the rest of the server code.

9. **Old worker deletion:** `replay_worker.js` and the worker-spawning wrapper in `replay.ts` are deleted. The `replay.ts` module becomes a pure function (no Worker import) that the pipeline worker calls internally.

10. **Public API stability:** `PipelineOrchestrator`'s public interface (`start()`, `stop()`, `waitForPending()`) remains unchanged. The pool is an internal implementation detail.

## Consequences

- **Easier:** Adding new CPU-intensive tasks (future: syntax highlighting, diff computation) — just write a new worker entry point and reuse the pool.
- **Easier:** Observability — pool stats (busy/idle/queued) available for health endpoint without instrumenting individual stages.
- **Easier:** Throughput — WASM loaded once per worker lifetime instead of once per job.
- **Harder:** Debugging — errors in worker threads produce less helpful stack traces. Mitigated by structured error messages in the protocol.
- **Harder:** Data must be serializable — no passing class instances or DB connections to workers. This is acceptable since validate/detect/replay/dedup only use plain data.
- **Follow-up:** Consider `worker_threads.markAsUntransferable()` or `Transferable` for large buffers if profiling shows structured clone as a bottleneck (unlikely).

## Decision History

1. Option 1 (generic worker pool) chosen over piscina (Option 2) and SharedArrayBuffer (Option 3) for control over WASM init timing and alignment with project's adapter pattern.
2. Store stage stays on main thread — `better-sqlite3` is not thread-safe.
3. Workers are TypeScript files compiled by the existing Vite server build — no separate build step needed.
4. Crash recovery replaces the worker but does NOT retry the job — orchestrator's existing error path handles failure recording.
5. Pool size defaults to `availableParallelism() - 1`, not a fixed constant, to scale with deployment hardware.
