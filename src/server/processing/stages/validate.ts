/**
 * Validate stage: reads .cast file, normalizes the header, and extracts events and markers.
 *
 * Extracted from processSessionPipeline step 1 (readCastFile).
 * Pure async function — reads from the file path stored on the session record.
 * The orchestrator emits `session.validated` after this stage succeeds.
 */

import type { AsciicastEvent, AsciicastHeader, Marker } from '../../../shared/types/asciicast.js';
import { normalizeHeader } from '../../../shared/parsers/asciicast.js';
import { NdjsonStream } from '../ndjson_stream.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'stage.validate' });

/** Output of the validate stage. */
export interface ValidateResult {
  header: AsciicastHeader;
  events: AsciicastEvent[];
  markers: Marker[];
  eventCount: number;
}

/**
 * Read and validate a .cast file at the given path.
 * Parses NDJSON, normalizes the header, and extracts events and markers.
 * Throws if the file cannot be read or contains no header.
 */
export async function validate(
  filePath: string,
  sessionId: string
): Promise<ValidateResult> {
  let header: AsciicastHeader | null = null;
  const events: AsciicastEvent[] = [];
  const markers: Marker[] = [];
  const stream = new NdjsonStream(filePath);
  let elapsed = 0;

  for await (const item of stream) {
    if (item.header) {
      header = normalizeHeader(item.header as Record<string, unknown>);
    }
    if (item.event) {
      const event = item.event as AsciicastEvent;
      elapsed += event[0];
      events.push(event);
      if (event[1] === 'm') {
        markers.push({
          time: elapsed,
          label: String(event[2]),
          index: events.length - 1,
        });
      }
    }
  }

  if (stream.malformedLineCount > 0) {
    log.warn({ sessionId, malformedLines: stream.malformedLineCount }, 'Skipped malformed lines');
  }

  if (!header) {
    throw new Error(`No header found in .cast file for session ${sessionId}`);
  }

  return { header, events, markers, eventCount: events.length };
}
