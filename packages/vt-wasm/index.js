/**
 * TypeScript wrapper for vt-wasm (avt WASM bridge).
 * Provides a typed API for processing terminal escape sequences.
 *
 * This is the compiled JS output of index.ts.
 * The import map in package.json resolves #vt-wasm to this file.
 */

let wasmModule = null;

/**
 * Initialize the WASM module. Call this once before creating VT instances.
 * Uses dynamic import to load the WASM module.
 */
export async function initVt() {
  if (wasmModule) {
    return;
  }

  try {
    const mod = await import('./pkg/vt_wasm.js');
    if (typeof mod.create !== 'function') {
      throw new Error(
        'WASM module missing create() function. Binary may be corrupted or out of sync.',
      );
    }
    wasmModule = mod;
  } catch (error) {
    throw new Error(
      `Failed to load vt-wasm module: ${error instanceof Error ? error.message : String(error)}. ` +
        `Ensure the WASM binary has been built by running ./build.sh in packages/vt-wasm/.`,
    );
  }
}

/**
 * Create a new VT instance.
 *
 * @param {number} cols - Terminal width in columns
 * @param {number} rows - Terminal height in rows
 * @param {number} [scrollbackLimit] - Maximum scrollback lines (optional, 0 = unlimited)
 * @returns {object} VT instance
 */
export function createVt(cols, rows, scrollbackLimit) {
  if (!wasmModule) {
    throw new Error('WASM module not initialized. Call initVt() before createVt().');
  }

  const wasmInstance = wasmModule.create(cols, rows, scrollbackLimit ?? 0);

  return {
    feed(data) {
      return wasmInstance.feed(data);
    },

    getView() {
      return wasmInstance.get_view();
    },

    getAllLines() {
      return wasmInstance.get_all_lines();
    },

    getCursor() {
      const result = wasmInstance.get_cursor();
      if (result === null) return null;
      return { col: result[0], row: result[1] };
    },

    getSize() {
      const result = wasmInstance.get_size();
      return { cols: result[0], rows: result[1] };
    },

    resize(cols, rows) {
      wasmInstance.resize(cols, rows);
    },

    free() {
      wasmInstance.free();
    },
  };
}
