// @vitest-environment node
import assert from 'node:assert';
import { describe, it, expect } from 'vitest';
import { validateHeader, sanitizeFilename, countMarkers } from './upload_service.js';

describe('validateHeader', () => {
  it('returns ok:true for valid v3 asciicast header', () => {
    const content = '{"version":3,"width":80,"height":24}\n[0,"o","hello"]';
    expect(validateHeader(content)).toEqual({ ok: true });
  });

  it('returns 400 when first line is not valid JSON', () => {
    const content = 'not json at all\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(400);
    expect(result.error.error).toContain('JSON');
  });

  it('returns 400 when first line is a JSON array', () => {
    const content = '[1,2,3]\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(400);
    expect(result.error.error).toContain('object');
  });

  it('returns 400 when first line is a JSON string', () => {
    const content = '"just a string"\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(400);
    expect(result.error.error).toContain('object');
  });

  it('returns 400 when first line is JSON null', () => {
    const content = 'null\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(400);
  });

  it('returns 422 when header fails Typia validation (version 2)', () => {
    const content = '{"version":2,"width":80,"height":24}\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(422);
    expect(result.error.error).toContain('validation');
  });

  it('returns 422 when header fails Typia validation (width 0)', () => {
    const content = '{"version":3,"width":0,"height":24}\n[0,"o","hello"]';
    const result = validateHeader(content);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.status).toBe(422);
  });

  it('returns ok:true for empty lines before header', () => {
    const content = '\n\n{"version":3,"width":80,"height":24}\n[0,"o","hello"]';
    expect(validateHeader(content)).toEqual({ ok: true });
  });
});

describe('sanitizeFilename', () => {
  it('keeps safe characters', () => {
    expect(sanitizeFilename('test-file.cast')).toBe('test-file.cast');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('file with spaces & (parens).cast')).toBe(
      'file_with_spaces____parens_.cast',
    );
  });

  it('extracts basename from path with slashes', () => {
    expect(sanitizeFilename('/some/path/file.cast')).toBe('file.cast');
  });

  it('extracts basename from Windows-style path', () => {
    expect(sanitizeFilename('C:\\Users\\test\\file.cast')).toBe('file.cast');
  });

  it('returns unnamed.cast for empty string after cleaning', () => {
    expect(sanitizeFilename('')).toBe('unnamed.cast');
  });

  it('returns unnamed.cast when all characters are unsafe', () => {
    expect(sanitizeFilename('////')).toBe('unnamed.cast');
  });

  it('truncates to 255 characters', () => {
    const longName = 'a'.repeat(300) + '.cast';
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
  });
});

describe('countMarkers', () => {
  it('counts marker events', () => {
    const content =
      '{"version":3,"width":80,"height":24}\n[0,"o","hello"]\n[1,"m","marker1"]\n[2,"m","marker2"]';
    expect(countMarkers(content)).toBe(2);
  });

  it('returns 0 for content with no markers', () => {
    const content = '{"version":3,"width":80,"height":24}\n[0,"o","hello"]\n[1,"o","world"]';
    expect(countMarkers(content)).toBe(0);
  });

  it('skips malformed lines containing "m"', () => {
    const content = '{"version":3}\nnot valid json with "m"\n[1,"m","valid"]';
    expect(countMarkers(content)).toBe(1);
  });

  it('does not count lines where "m" is in data, not type', () => {
    const content = '{"version":3}\n[0,"o","message with m in it"]';
    expect(countMarkers(content)).toBe(0);
  });
});
