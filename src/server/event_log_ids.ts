/**
 * Side-channel map from event object identity to its persisted event log row ID.
 *
 * Avoids mutating event objects with Object.assign while still allowing SSE handlers
 * to read the log ID without creating a circular import through index.ts.
 */
export const eventLogIds = new Map<object, number>();
