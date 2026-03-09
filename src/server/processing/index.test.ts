/**
 * Smoke tests for the processing barrel index.
 * Ensures all public exports are defined and importable.
 */

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as processing from './index.js';

describe('processing barrel exports', () => {
  it('exports NdjsonStream', () => {
    expect(processing.NdjsonStream).toBeDefined();
    expect(typeof processing.NdjsonStream).toBe('function');
  });

  it('exports SectionDetector', () => {
    expect(processing.SectionDetector).toBeDefined();
    expect(typeof processing.SectionDetector).toBe('function');
  });

  it('exports processSessionPipeline', () => {
    expect(processing.processSessionPipeline).toBeDefined();
    expect(typeof processing.processSessionPipeline).toBe('function');
  });

  it('exports runPipeline', () => {
    expect(processing.runPipeline).toBeDefined();
    expect(typeof processing.runPipeline).toBe('function');
  });

  it('exports waitForPipelines', () => {
    expect(processing.waitForPipelines).toBeDefined();
    expect(typeof processing.waitForPipelines).toBe('function');
  });
});
