/**
 * Shared constants used by both server and client for virtual scrolling
 * and section pagination behavior.
 */

/**
 * Sessions with this many sections or fewer use the small session passthrough:
 * bulk GET with full content, no virtualizer, no section navigator.
 */
export const SMALL_SESSION_THRESHOLD = 5;

/**
 * Default number of lines returned per page in the per-section content endpoint.
 * Client and server must agree on this value; callers may override with ?limit=.
 */
export const DEFAULT_SECTION_PAGE_LIMIT = 500;

/**
 * Hard cap on the number of sections the bulk content endpoint will serve.
 * Sessions exceeding this count must use the per-section endpoint instead.
 */
export const BULK_MAX_SECTIONS = 200;
