// @vitest-environment node
/**
 * Integration tests for GET /api/pipeline/status SSE endpoint.
 *
 * Tests that the endpoint:
 * - Opens an SSE stream (text/event-stream content type)
 * - Emits a pipeline-status event on connection with the current snapshot
 * - Emits a pipeline-status event when pipeline state changes
 *
 * Uses the full Hono app factory with mocked PipelineStatusService to avoid
 * real DB and job queue dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { handlePipelineStatus } from './pipeline_status.js';
import type { PipelineStatusService } from '../services/pipeline_status_service.js';
import type { PipelineStatusSnapshot } from '../../shared/types/pipeline_status.js';

// ---------------------------------------------------------------------------
// Mock PipelineStatusService
// ---------------------------------------------------------------------------

function makeEmptySnapshot(): PipelineStatusSnapshot {
  return { processing: [], queued: [], recentlyCompleted: [] };
}

function makeMockService(snapshot: PipelineStatusSnapshot = makeEmptySnapshot()): PipelineStatusService {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    onUpdate: vi.fn(),
    offUpdate: vi.fn(),
    destroy: vi.fn(),
  } as unknown as PipelineStatusService;
}

// ---------------------------------------------------------------------------
// App factory helper
// ---------------------------------------------------------------------------

function makeApp(service: PipelineStatusService) {
  const app = new Hono();
  app.get('/api/pipeline/status', (c) => handlePipelineStatus(c, service));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/pipeline/status', () => {
  let mockService: PipelineStatusService;

  beforeEach(() => {
    mockService = makeMockService();
  });

  it('responds with text/event-stream content type', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(new Request('http://localhost/api/pipeline/status'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('sets Cache-Control: no-cache header', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(new Request('http://localhost/api/pipeline/status'));

    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('sends an initial pipeline-status event with current snapshot on connection', async () => {
    const snapshot: PipelineStatusSnapshot = {
      processing: [{ id: 'sess-1', name: 'test.cast', status: 'processing' }],
      queued: [],
      recentlyCompleted: [],
    };
    mockService = makeMockService(snapshot);
    const app = makeApp(mockService);

    const res = await app.fetch(new Request('http://localhost/api/pipeline/status'));
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('event: pipeline-status');
    expect(text).toContain('"type":"pipeline-status"');
    expect(text).toContain('"sess-1"');
    reader.cancel();
  });

  it('calls getSnapshot() on connection to build initial event', async () => {
    const app = makeApp(mockService);
    await app.fetch(new Request('http://localhost/api/pipeline/status'));

    expect(mockService.getSnapshot).toHaveBeenCalled();
  });

  it('registers an onUpdate callback on connection', async () => {
    const app = makeApp(mockService);
    await app.fetch(new Request('http://localhost/api/pipeline/status'));

    expect(mockService.onUpdate).toHaveBeenCalledWith(expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// Data shape validation
// ---------------------------------------------------------------------------

describe('GET /api/pipeline/status — response shape', () => {
  it('emits pipeline-status event with processing, queued, recentlyCompleted arrays', async () => {
    const snapshot: PipelineStatusSnapshot = {
      processing: [{ id: 'p-1', name: 'proc.cast', status: 'processing' }],
      queued: [{ id: 'q-1', name: 'queue.cast', status: 'queued', queuePosition: 1 }],
      recentlyCompleted: [{ id: 'c-1', name: 'done.cast', status: 'completed' }],
    };
    const service = makeMockService(snapshot);
    const app = makeApp(service);

    const res = await app.fetch(new Request('http://localhost/api/pipeline/status'));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('"p-1"');
    expect(text).toContain('"q-1"');
    expect(text).toContain('"c-1"');
    reader.cancel();
  });
});
