/**
 * useSectionCache — pluggable LRU section content cache composable.
 *
 * Provides a module-level singleton InMemoryLruCache keyed by section id + offset.
 * Callers may inject a custom SectionCache implementation for testing or alternate backends.
 * The default implementation enforces a byte ceiling via LRU eviction.
 */
import type { SectionContentPage } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Pluggable cache interface for SectionContentPage entries.
 * Both key and value types are fixed; the implementation decides eviction strategy.
 */
export interface SectionCache {
  get(key: string): SectionContentPage | undefined;
  set(key: string, value: SectionContentPage): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
}

/** Options for InMemoryLruCache construction. */
export interface InMemoryLruCacheOptions {
  /** Maximum total bytes before LRU eviction occurs. Defaults to DEFAULT_CACHE_MAX_BYTES. */
  maxBytes?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default memory ceiling: 32 MB of section content across all cached pages. */
const DEFAULT_CACHE_MAX_BYTES = 32 * 1024 * 1024;

// ---------------------------------------------------------------------------
// InMemoryLruCache
// ---------------------------------------------------------------------------

/** Internal entry stored alongside the page for size accounting. */
interface CacheEntry {
  page: SectionContentPage;
  bytes: number;
}

/**
 * LRU cache for SectionContentPage values with a configurable byte ceiling.
 * Uses a Map to maintain insertion/access order for O(1) LRU tracking.
 * Evicts least-recently-used entries when usedBytes exceeds maxBytes.
 */
export class InMemoryLruCache implements SectionCache {
  private readonly _maxBytes: number;
  /** Ordered map: oldest entry first, newest entry last. */
  private readonly _store: Map<string, CacheEntry>;
  private _usedBytes: number;

  constructor(options: InMemoryLruCacheOptions = {}) {
    this._maxBytes = options.maxBytes ?? DEFAULT_CACHE_MAX_BYTES;
    this._store = new Map();
    this._usedBytes = 0;
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this._store.size;
  }

  /** Total bytes currently consumed by cached entries. */
  get usedBytes(): number {
    return this._usedBytes;
  }

  get(key: string): SectionContentPage | undefined {
    const entry = this._store.get(key);
    if (entry === undefined) return undefined;
    this._promoteToMru(key, entry);
    return entry.page;
  }

  set(key: string, value: SectionContentPage): void {
    const existing = this._store.get(key);
    if (existing !== undefined) {
      this._usedBytes -= existing.bytes;
      this._store.delete(key);
    }

    const bytes = estimateBytes(value);
    this._evictUntilFits(bytes);

    this._store.set(key, { page: value, bytes });
    this._usedBytes += bytes;
  }

  has(key: string): boolean {
    return this._store.has(key);
  }

  delete(key: string): void {
    const entry = this._store.get(key);
    if (entry === undefined) return;
    this._usedBytes -= entry.bytes;
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
    this._usedBytes = 0;
  }

  /** Moves an existing entry to the most-recently-used position. */
  private _promoteToMru(key: string, entry: CacheEntry): void {
    this._store.delete(key);
    this._store.set(key, entry);
  }

  /** Evicts least-recently-used entries until the new entry can fit within maxBytes. */
  private _evictUntilFits(incomingBytes: number): void {
    while (this._usedBytes + incomingBytes > this._maxBytes && this._store.size > 0) {
      const lruKey = this._store.keys().next().value;
      if (lruKey === undefined) break;
      this.delete(lruKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Byte estimation
// ---------------------------------------------------------------------------

/**
 * Estimates the memory footprint of a SectionContentPage in bytes.
 * Uses JSON serialization length as a proxy — fast and consistent.
 * Actual V8 heap cost may differ but this is sufficient for ceiling enforcement.
 */
function estimateBytes(page: SectionContentPage): number {
  return JSON.stringify(page).length;
}

// ---------------------------------------------------------------------------
// Composable + singleton
// ---------------------------------------------------------------------------

/** Module-level singleton instance, created lazily on first useSectionCache() call. */
let _singleton: InMemoryLruCache | null = null;

/**
 * Returns the module-level singleton SectionCache (InMemoryLruCache by default).
 * All callers share the same cache, so pages fetched in any component are
 * available to all other components without re-fetching.
 *
 * Accepts an optional custom implementation for testing or alternate backends.
 */
export function useSectionCache(cache?: SectionCache): SectionCache {
  if (cache !== undefined) return cache;
  if (_singleton === null) {
    _singleton = new InMemoryLruCache();
  }
  return _singleton;
}

/**
 * Resets the module-level singleton cache to a fresh empty state.
 * Intended for use in tests — do not call in production code.
 */
export function resetSectionCache(): void {
  _singleton = null;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Produces a stable cache key from a section id and line offset.
 * Format: `<sectionId>:<offset>`
 */
export function makeCacheKey(sectionId: string, offset: number, limit: number | 'all' = 'all'): string {
  return `${sectionId}:${offset}:${limit}`;
}
