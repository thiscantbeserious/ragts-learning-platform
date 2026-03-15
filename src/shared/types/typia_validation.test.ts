/**
 * Typia validation tag behaviour tests for shared API-boundary types.
 *
 * Verifies that:
 * 1. AsciicastHeader with extra properties (from the [key: string]: unknown index
 *    signature) is accepted by typia.validate() — asciicast allows custom fields.
 * 2. AsciicastHeader with invalid field values is rejected.
 * 3. The index signature does not cause Typia to reject valid headers.
 *
 * NOTE: These tests require the @typia/unplugin transformer (configured in
 * vite.config.ts). Without it, typia.validate() throws NoTransformConfigurationError.
 */

// @vitest-environment node
import assert from 'node:assert';
import { describe, it, expect } from 'vitest';
import typia from 'typia';
import type { AsciicastHeader } from './asciicast.js';

describe('AsciicastHeader Typia validation', () => {
  describe('valid headers are accepted', () => {
    it('accepts a minimal valid v3 header', () => {
      const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(true);
    });

    it('accepts a header with extra properties (index signature)', () => {
      // asciicast allows arbitrary metadata fields — the [key: string]: unknown
      // index signature must not cause Typia to reject the object.
      const header: AsciicastHeader = {
        version: 3,
        width: 120,
        height: 40,
        custom_field: 'some value',
        another_extra: 42,
        nested_extra: { foo: 'bar' },
      };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(true);
    });

    it('accepts a header with the term block', () => {
      const header: AsciicastHeader = {
        version: 3,
        width: 200,
        height: 50,
        term: { cols: 200, rows: 50, type: 'xterm-256color' },
        title: 'My recording',
        timestamp: 1700000000,
      };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid headers are rejected', () => {
    it('rejects version below 3 (version 2 is not supported)', () => {
      // The parser at src/shared/parsers/asciicast.ts:69 only accepts version 3.
      // version: 2 must be rejected by Typia validation.
      const header = { version: 2, width: 80, height: 24 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.errors.some((e) => e.path.includes('version'))).toBe(true);
    });

    it('rejects version 1', () => {
      const header = { version: 1, width: 80, height: 24 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.errors.some((e) => e.path.includes('version'))).toBe(true);
    });

    it('rejects version above 3 (future versions unsupported)', () => {
      const header = { version: 4, width: 80, height: 24 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.errors.some((e) => e.path.includes('version'))).toBe(true);
    });

    it('rejects width of 0', () => {
      const header = { version: 3, width: 0, height: 24 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.errors.some((e) => e.path.includes('width'))).toBe(true);
    });

    it('rejects height of 0', () => {
      const header = { version: 3, width: 80, height: 0 };
      const result = typia.validate<AsciicastHeader>(header);
      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.errors.some((e) => e.path.includes('height'))).toBe(true);
    });
  });
});
