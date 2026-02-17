/**
 * TypeScript wrapper for vt-wasm (avt WASM bridge).
 * Provides a typed API for processing terminal escape sequences.
 *
 * The WASM module is built by the other agent and will be available at ./pkg/vt_wasm.js
 * once the Rust wrapper is complete.
 */

import type {
  TerminalSnapshot,
  CursorPosition,
  TerminalSize,
} from './types.js';

// WASM module interface (will be provided by wasm-pack build output)
interface VtWasmModule {
  create(cols: number, rows: number, scrollback_limit: number): WasmVtInstance;
}

interface WasmVtInstance {
  feed(data: string): number[];
  get_view(): TerminalSnapshot;
  get_cursor(): [number, number] | null; // WASM returns [col, row] array
  get_size(): [number, number]; // WASM returns [cols, rows] array
  free(): void;
}

let wasmModule: VtWasmModule | null = null;

/**
 * Initialize the WASM module. Call this once before creating VT instances.
 * Uses dynamic import to load the WASM module.
 */
export async function initVt(): Promise<void> {
  if (wasmModule) {
    return; // Already initialized
  }

  try {
    // Dynamic import of the WASM module (will be built by other agent)
    // The module exports a default object with the create function
    const mod = await import('./pkg/vt_wasm.js');
    if (typeof mod.create !== 'function') {
      throw new Error('WASM module missing create() function. Binary may be corrupted or out of sync.');
    }
    wasmModule = mod as unknown as VtWasmModule;
  } catch (error) {
    throw new Error(
      `Failed to load vt-wasm module: ${error instanceof Error ? error.message : String(error)}. ` +
      `Ensure the WASM binary has been built by running ./build.sh in packages/vt-wasm/.`
    );
  }
}

/**
 * VT instance interface exposed to consumers.
 */
export interface VtInstance {
  /**
   * Feed terminal output data. Returns array of changed row indices.
   */
  feed(data: string): number[];

  /**
   * Get the current terminal viewport snapshot.
   * Returns structured line/span data representing the visible screen.
   */
  getView(): TerminalSnapshot;

  /**
   * Get the current cursor position, or null if cursor is hidden.
   */
  getCursor(): CursorPosition | null;

  /**
   * Get the terminal size in columns and rows.
   */
  getSize(): TerminalSize;
}

/**
 * Create a new VT instance.
 *
 * @param cols - Terminal width in columns
 * @param rows - Terminal height in rows
 * @param scrollbackLimit - Maximum scrollback lines to retain (optional, default: no limit)
 * @returns VT instance
 */
export function createVt(
  cols: number,
  rows: number,
  scrollbackLimit?: number
): VtInstance {
  if (!wasmModule) {
    throw new Error(
      'WASM module not initialized. Call initVt() before createVt().'
    );
  }

  // Create the underlying WASM instance
  const wasmInstance = wasmModule.create(
    cols,
    rows,
    scrollbackLimit ?? 0 // 0 means unlimited in avt
  );

  // Return typed wrapper
  return {
    feed(data: string): number[] {
      return wasmInstance.feed(data);
    },

    getView(): TerminalSnapshot {
      return wasmInstance.get_view();
    },

    getCursor(): CursorPosition | null {
      const result = wasmInstance.get_cursor();
      if (result === null) return null;
      return { col: result[0], row: result[1] };
    },

    getSize(): TerminalSize {
      const result = wasmInstance.get_size();
      return { cols: result[0], rows: result[1] };
    },
  };
}

// Re-export types for convenience
export type {
  TerminalSnapshot,
  SnapshotLine,
  SnapshotSpan,
  CursorPosition,
  TerminalSize,
} from './types.js';
