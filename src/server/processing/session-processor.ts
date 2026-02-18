/**
 * SessionProcessor - Server-side pipeline for processing asciicast v3 sessions.
 *
 * Streams .cast files, processes terminal output through VT instance,
 * and captures snapshots at specified boundary events.
 */

import { createVt, type TerminalSnapshot } from '../../../packages/vt-wasm/index.js';
import type { AsciicastHeader } from '../../shared/asciicast-types.js';
import { normalizeHeader } from '../../shared/asciicast.js';
import { NdjsonStream } from './ndjson-stream.js';

export interface ProcessingResult {
  header: AsciicastHeader;
  eventCount: number;
  snapshots: Array<{
    boundaryEvent: number;
    snapshot: TerminalSnapshot;
  }>;
}

/**
 * Process a .cast file and capture terminal snapshots at boundary events.
 *
 * @param filePath - Path to the .cast file
 * @param boundaryEvents - Array of event indices where snapshots should be captured
 * @returns Processing result with header, event count, and snapshots
 */
export async function processSession(
  filePath: string,
  boundaryEvents: number[]
): Promise<ProcessingResult> {
  const stream = new NdjsonStream(filePath);
  const boundarySet = new Set(boundaryEvents);
  const snapshots: Array<{ boundaryEvent: number; snapshot: TerminalSnapshot }> = [];

  let header: AsciicastHeader | null = null;
  let vt: ReturnType<typeof createVt> | null = null;
  let eventIndex = 0;

  for await (const item of stream) {
    if (item.header) {
      // First item is always the header — normalize v3 term.cols/rows
      header = normalizeHeader(item.header as Record<string, any>);

      // Create VT instance with dimensions from header
      vt = createVt(header.width, header.height);
      continue;
    }

    if (item.event) {
      // Process event
      const [_timestamp, eventType, data] = item.event;

      // Only process output events through VT
      if (eventType === 'o' && vt && data !== undefined) {
        vt.feed(String(data));
      }

      // Check if this is a boundary event
      if (boundarySet.has(eventIndex) && vt) {
        snapshots.push({
          boundaryEvent: eventIndex,
          snapshot: vt.getView(),
        });
      }

      eventIndex++;
    }
  }

  if (!header) {
    throw new Error('No header found in .cast file');
  }

  // Free WASM resources
  vt?.free();

  return {
    header,
    eventCount: eventIndex,
    snapshots,
  };
}
