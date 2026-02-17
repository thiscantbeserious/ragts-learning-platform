/* tslint:disable */
/* eslint-disable */

/**
 * Virtual terminal wrapper
 */
export class Vt {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Feed input to the terminal and return changed row indices.
     * Returns null if avt panics (e.g. unsupported sequence) instead of crashing WASM.
     */
    feed(s: string): any;
    /**
     * Get cursor position as [col, row] or null if cursor is hidden
     */
    get_cursor(): any;
    /**
     * Get terminal size as [cols, rows]
     */
    get_size(): any;
    /**
     * Get the current terminal view as a structured snapshot
     */
    get_view(): any;
}

/**
 * Create a new virtual terminal instance
 */
export function create(cols: number, rows: number, scrollback_limit: number): Vt;
