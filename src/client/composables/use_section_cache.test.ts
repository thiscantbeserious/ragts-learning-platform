/**
 * Tests for useSectionCache composable — pluggable LRU section content cache.
 *
 * Covers: SectionCache interface contract, InMemoryLruCache get/set/has/delete,
 * LRU eviction order, byte ceiling enforcement, useSectionCache composable reset,
 * and cache size reporting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryLruCache,
  useSectionCache,
  resetSectionCache,
  makeCacheKey,
} from './use_section_cache.js';
import type { SectionCache } from './use_section_cache.js';
import type { SectionContentPage } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(sectionId: string, offset: number, lineCount: number): SectionContentPage {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    index: offset + i,
    text: `line ${offset + i}`,
    spans: [],
  }));
  return {
    sectionId,
    lines,
    totalLines: lineCount,
    offset,
    limit: lineCount,
    hasMore: false,
    contentHash: `hash-${sectionId}-${offset}`,
  };
}

// Each line in the test pages is a simple object. We use byte estimates via
// JSON.stringify so we can predict eviction behaviour in tests.
function approxBytes(page: SectionContentPage): number {
  return JSON.stringify(page).length;
}

// ---------------------------------------------------------------------------
// makeCacheKey
// ---------------------------------------------------------------------------

describe('makeCacheKey', () => {
  it('produces a stable key from sectionId and offset', () => {
    expect(makeCacheKey('sec-1', 0)).toBe('sec-1:0:all');
    expect(makeCacheKey('sec-2', 500)).toBe('sec-2:500:all');
    expect(makeCacheKey('sec-3', 0, 200)).toBe('sec-3:0:200');
  });

  it('produces distinct keys for different sectionIds with same offset', () => {
    const a = makeCacheKey('sec-A', 0);
    const b = makeCacheKey('sec-B', 0);
    expect(a).not.toBe(b);
  });

  it('produces distinct keys for same sectionId with different offsets', () => {
    const a = makeCacheKey('sec-A', 0);
    const b = makeCacheKey('sec-A', 500);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// InMemoryLruCache — core operations
// ---------------------------------------------------------------------------

describe('InMemoryLruCache — core operations', () => {
  let cache: InMemoryLruCache;

  beforeEach(() => {
    cache = new InMemoryLruCache({ maxBytes: 1_000_000 });
  });

  it('returns undefined for a key that was never set', () => {
    expect(cache.get('missing-key')).toBeUndefined();
  });

  it('stores and retrieves a page by key', () => {
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    expect(cache.get('sec-1:0')).toEqual(page);
  });

  it('has() returns false for a missing key', () => {
    expect(cache.has('sec-1:0')).toBe(false);
  });

  it('has() returns true after set()', () => {
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    expect(cache.has('sec-1:0')).toBe(true);
  });

  it('delete() removes an existing entry', () => {
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    cache.delete('sec-1:0');
    expect(cache.has('sec-1:0')).toBe(false);
    expect(cache.get('sec-1:0')).toBeUndefined();
  });

  it('delete() on a missing key is a no-op (no throw)', () => {
    expect(() => cache.delete('nonexistent')).not.toThrow();
  });

  it('overwrites an existing entry on set()', () => {
    const p1 = makePage('sec-1', 0, 5);
    const p2 = makePage('sec-1', 0, 10);
    cache.set('sec-1:0', p1);
    cache.set('sec-1:0', p2);
    expect(cache.get('sec-1:0')).toEqual(p2);
  });

  it('size returns 0 for an empty cache', () => {
    expect(cache.size).toBe(0);
  });

  it('size increments after set()', () => {
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    expect(cache.size).toBe(1);
    cache.set('sec-2:0', makePage('sec-2', 0, 5));
    expect(cache.size).toBe(2);
  });

  it('size does not increment on overwrite of existing key', () => {
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.set('sec-1:0', makePage('sec-1', 0, 10));
    expect(cache.size).toBe(1);
  });

  it('size decrements after delete()', () => {
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.delete('sec-1:0');
    expect(cache.size).toBe(0);
  });

  it('clear() removes all entries', () => {
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.set('sec-2:0', makePage('sec-2', 0, 5));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('sec-1:0')).toBe(false);
  });

  it('usedBytes is 0 for an empty cache', () => {
    expect(cache.usedBytes).toBe(0);
  });

  it('usedBytes increases after set()', () => {
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    expect(cache.usedBytes).toBeGreaterThan(0);
  });

  it('usedBytes decreases after delete()', () => {
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    const before = cache.usedBytes;
    cache.delete('sec-1:0');
    expect(cache.usedBytes).toBeLessThan(before);
  });

  it('usedBytes returns 0 after clear()', () => {
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.clear();
    expect(cache.usedBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// InMemoryLruCache — LRU eviction order
// ---------------------------------------------------------------------------

describe('InMemoryLruCache — LRU eviction', () => {
  it('evicts the least-recently-used entry when the byte ceiling is reached', () => {
    const page1 = makePage('sec-1', 0, 20);
    const page2 = makePage('sec-2', 0, 20);
    const page3 = makePage('sec-3', 0, 20);

    const pageBytes = approxBytes(page1);
    // Set ceiling to just over two pages so the third triggers eviction
    const cache = new InMemoryLruCache({ maxBytes: Math.floor(pageBytes * 2.1) });

    cache.set('sec-1:0', page1);
    cache.set('sec-2:0', page2);

    // Access sec-1 to make sec-2 the LRU
    cache.get('sec-1:0');

    // Adding sec-3 should evict sec-2 (LRU)
    cache.set('sec-3:0', page3);

    expect(cache.has('sec-1:0')).toBe(true);
    expect(cache.has('sec-2:0')).toBe(false);
    expect(cache.has('sec-3:0')).toBe(true);
  });

  it('promotes an entry to MRU on get()', () => {
    const page1 = makePage('sec-1', 0, 20);
    const page2 = makePage('sec-2', 0, 20);
    const page3 = makePage('sec-3', 0, 20);

    const pageBytes = approxBytes(page1);
    const cache = new InMemoryLruCache({ maxBytes: Math.floor(pageBytes * 2.1) });

    cache.set('sec-1:0', page1);
    cache.set('sec-2:0', page2);

    // Touch sec-1 — now sec-2 is the oldest
    cache.get('sec-1:0');

    cache.set('sec-3:0', page3);

    // sec-2 is LRU → evicted
    expect(cache.has('sec-2:0')).toBe(false);
    expect(cache.has('sec-1:0')).toBe(true);
    expect(cache.has('sec-3:0')).toBe(true);
  });

  it('promotes an entry to MRU on set() (overwrite)', () => {
    const page1 = makePage('sec-1', 0, 20);
    const page2 = makePage('sec-2', 0, 20);
    const page3 = makePage('sec-3', 0, 20);

    const pageBytes = approxBytes(page1);
    const cache = new InMemoryLruCache({ maxBytes: Math.floor(pageBytes * 2.1) });

    cache.set('sec-1:0', page1);
    cache.set('sec-2:0', page2);

    // Overwrite sec-1 (promotes to MRU), so sec-2 becomes LRU
    cache.set('sec-1:0', makePage('sec-1', 0, 5));

    cache.set('sec-3:0', page3);

    expect(cache.has('sec-2:0')).toBe(false);
    expect(cache.has('sec-1:0')).toBe(true);
    expect(cache.has('sec-3:0')).toBe(true);
  });

  it('evicts multiple entries if needed to fit a single large page', () => {
    const smallPage = makePage('sec-1', 0, 5);
    const smallBytes = approxBytes(smallPage);
    const cache = new InMemoryLruCache({ maxBytes: Math.floor(smallBytes * 3) });

    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.set('sec-2:0', makePage('sec-2', 0, 5));

    // A big page that is larger than one slot — should evict both to make room
    const bigPage = makePage('sec-big', 0, 30);
    cache.set('sec-big:0', bigPage);

    expect(cache.has('sec-big:0')).toBe(true);
    // At least sec-1 and sec-2 should be gone to make room
    const remaining = [cache.has('sec-1:0'), cache.has('sec-2:0')].filter(Boolean).length;
    expect(remaining).toBeLessThan(2);
  });

  it('does not evict entries when there is sufficient space', () => {
    const cache = new InMemoryLruCache({ maxBytes: 1_000_000 });
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    cache.set('sec-2:0', makePage('sec-2', 0, 5));
    expect(cache.has('sec-1:0')).toBe(true);
    expect(cache.has('sec-2:0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SectionCache interface — InMemoryLruCache satisfies it
// ---------------------------------------------------------------------------

describe('SectionCache interface', () => {
  it('InMemoryLruCache satisfies SectionCache', () => {
    const cache: SectionCache = new InMemoryLruCache({ maxBytes: 1_000_000 });
    const page = makePage('sec-1', 0, 5);
    cache.set('sec-1:0', page);
    expect(cache.get('sec-1:0')).toEqual(page);
    expect(cache.has('sec-1:0')).toBe(true);
    cache.delete('sec-1:0');
    expect(cache.has('sec-1:0')).toBe(false);
    cache.clear();
  });
});

// ---------------------------------------------------------------------------
// useSectionCache composable
// ---------------------------------------------------------------------------

describe('useSectionCache', () => {
  beforeEach(() => {
    resetSectionCache();
  });

  it('returns a cache object with get/set/has/delete/clear', () => {
    const cache = useSectionCache();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.has).toBe('function');
    expect(typeof cache.delete).toBe('function');
    expect(typeof cache.clear).toBe('function');
  });

  it('multiple calls return the same singleton instance', () => {
    const a = useSectionCache();
    const b = useSectionCache();
    const page = makePage('sec-1', 0, 5);
    a.set('sec-1:0', page);
    expect(b.get('sec-1:0')).toEqual(page);
  });

  it('stores and retrieves a page through the composable', () => {
    const cache = useSectionCache();
    const page = makePage('sec-2', 500, 10);
    cache.set('sec-2:500', page);
    expect(cache.get('sec-2:500')).toEqual(page);
  });

  it('resetSectionCache() clears all entries in the singleton', () => {
    const cache = useSectionCache();
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    resetSectionCache();
    const after = useSectionCache();
    expect(after.has('sec-1:0')).toBe(false);
  });

  it('resetSectionCache() resets usedBytes to 0', () => {
    const cache = useSectionCache();
    cache.set('sec-1:0', makePage('sec-1', 0, 5));
    resetSectionCache();
    const after = useSectionCache() as InMemoryLruCache;
    expect(after.usedBytes).toBe(0);
  });
});
