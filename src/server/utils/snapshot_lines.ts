/** Parse snapshot JSON into SnapshotLine array; handles both TerminalSnapshot and raw array formats. */
import type { SnapshotLine } from '#vt-wasm/types';

export function parseSnapshotLines(snapshot: string | null): SnapshotLine[] {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot);
    if (Array.isArray(parsed)) return parsed as SnapshotLine[];
    if (parsed && Array.isArray(parsed.lines)) return parsed.lines as SnapshotLine[];
    return [];
  } catch {
    return [];
  }
}
