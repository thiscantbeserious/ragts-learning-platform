/**
 * NdjsonStream - Streaming parser for asciicast v3 .cast files.
 *
 * Reads NDJSON format line-by-line:
 * - First line: header (JSON object with version, width, height)
 * - Subsequent lines: events (JSON arrays: [timestamp, event_type, data])
 *
 * Handles malformed lines gracefully by skipping them.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export type NdjsonItem =
  | { header: any; event?: never }
  | { event: any; header?: never };

/**
 * Streaming parser for .cast files.
 * Yields header first, then events one at a time.
 * Tracks malformed lines (invalid JSON or non-array events) via malformedLineCount.
 */
export class NdjsonStream {
  /** Count of lines that were skipped due to malformed JSON or invalid event format. */
  public malformedLineCount = 0;

  constructor(private filePath: string) {}

  async *[Symbol.asyncIterator](): AsyncIterator<NdjsonItem> {
    const fileStream = createReadStream(this.filePath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let isFirstLine = true;

    for await (const line of rl) {
      // Skip empty lines
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);

        if (isFirstLine) {
          // First non-empty line is always the header
          isFirstLine = false;
          yield { header: parsed };
        } else {
          // Subsequent lines are events
          // Skip if not an array (invalid event format)
          if (Array.isArray(parsed)) {
            yield { event: parsed };
          } else {
            // Invalid event format: count and skip
            this.malformedLineCount++;
          }
        }
      } catch {
        // Malformed JSON: count and skip
        this.malformedLineCount++;
        continue;
      }
    }
  }
}
