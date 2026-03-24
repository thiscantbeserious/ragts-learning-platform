// @vitest-environment node
/**
 * Unit tests for route_validation helpers.
 *
 * Tests path/query param validation and Typia error mapping helpers.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { validatePathId, validateQueryParam, mapTypiaErrors } from './route_validation.js';
import type { IValidation } from 'typia';

// ---------------------------------------------------------------------------
// validatePathId
// ---------------------------------------------------------------------------

describe('validatePathId', () => {
  it('returns null for a valid non-empty id', async () => {
    const app = new Hono();
    app.get('/test/:id', (c) => {
      const id = c.req.param('id');
      const result = validatePathId(c, id);
      expect(result).toBeNull();
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test/abc123'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an empty string id', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validatePathId(c, '');
      if (result) return result;
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('non-empty string');
  });

  it('returns 400 for undefined id', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validatePathId(c, undefined);
      if (result) return result;
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 for whitespace-only id', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validatePathId(c, '   ');
      if (result) return result;
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// validateQueryParam
// ---------------------------------------------------------------------------

describe('validateQueryParam', () => {
  it('returns null for a valid non-empty value', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validateQueryParam(c, 'sessionId', 'abc');
      expect(result).toBeNull();
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test?sessionId=abc'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an empty string value', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validateQueryParam(c, 'sessionId', '');
      if (result) return result;
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('sessionId');
  });

  it('returns 400 for undefined value', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      const result = validateQueryParam(c, 'sessionId', undefined);
      if (result) return result;
      return c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/test'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// mapTypiaErrors
// ---------------------------------------------------------------------------

describe('mapTypiaErrors', () => {
  it('maps IValidation.IError[] to ValidationFieldError[]', () => {
    const errors: IValidation.IError[] = [
      { path: '$input.version', expected: 'number (3)', value: 2 },
      { path: '$input.width', expected: 'number', value: 0 },
    ];

    const result = mapTypiaErrors(errors);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: '$input.version', expected: 'number (3)', value: 2 });
    expect(result[1]).toEqual({ path: '$input.width', expected: 'number', value: 0 });
  });

  it('trims to at most 10 errors', () => {
    const errors: IValidation.IError[] = Array.from({ length: 15 }, (_, i) => ({
      path: `$input.field${i}`,
      expected: 'string',
      value: null,
    }));

    const result = mapTypiaErrors(errors);

    expect(result).toHaveLength(10);
  });

  it('returns empty array for empty input', () => {
    expect(mapTypiaErrors([])).toEqual([]);
  });
});
