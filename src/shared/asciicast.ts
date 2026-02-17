/**
 * asciicast v3 parser and validator.
 *
 * Parses NDJSON format: first line is header, subsequent lines are events.
 * Converts relative timestamps to cumulative for display and navigation.
 *
 * Shared module: used by server (validation on upload) and client (rendering).
 */

import type {
  AsciicastHeader,
  AsciicastEvent,
  AsciicastFile,
  ParsedEvent,
  Marker,
  ValidationResult,
} from './asciicast-types';

/**
 * Validates asciicast v3 content without full parsing.
 * Checks version, JSON validity, and basic structure.
 */
export function validateAsciicast(content: string): ValidationResult {
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      error: 'File is empty',
      line: 0,
    };
  }

  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      valid: false,
      error: 'File contains no valid lines',
      line: 0,
    };
  }

  // Validate header (first line)
  let header: AsciicastHeader;
  try {
    header = JSON.parse(lines[0]);
  } catch (err) {
    return {
      valid: false,
      error: 'Invalid JSON in header',
      line: 1,
    };
  }

  if (!header || typeof header !== 'object') {
    return {
      valid: false,
      error: 'Header must be a JSON object',
      line: 1,
    };
  }

  if (header.version !== 3) {
    return {
      valid: false,
      error: `Unsupported version: ${header.version}. Only version 3 is supported.`,
      line: 1,
    };
  }

  if (typeof header.width !== 'number' || typeof header.height !== 'number') {
    return {
      valid: false,
      error: 'Header must include width and height',
      line: 1,
    };
  }

  // Validate events (remaining lines)
  for (let i = 1; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]);
      if (!Array.isArray(event) || event.length < 3) {
        return {
          valid: false,
          error: 'Event must be an array with at least 3 elements',
          line: i + 1,
        };
      }
      if (typeof event[0] !== 'number') {
        return {
          valid: false,
          error: 'Event timestamp must be a number',
          line: i + 1,
        };
      }
      if (typeof event[1] !== 'string') {
        return {
          valid: false,
          error: 'Event type must be a string',
          line: i + 1,
        };
      }
    } catch (err) {
      return {
        valid: false,
        error: `Invalid JSON in event: ${err instanceof Error ? err.message : String(err)}`,
        line: i + 1,
      };
    }
  }

  return { valid: true };
}

/**
 * Parses asciicast v3 content into structured format.
 * Throws error if content is invalid.
 */
export function parseAsciicast(content: string): AsciicastFile {
  const validation = validateAsciicast(content);
  if (!validation.valid) {
    throw new Error(`Invalid asciicast file at line ${validation.line}: ${validation.error}`);
  }

  const lines = content.split('\n').filter(line => line.trim().length > 0);

  const header: AsciicastHeader = JSON.parse(lines[0]);
  const rawEvents: AsciicastEvent[] = lines.slice(1).map(line => JSON.parse(line));

  const events = computeCumulativeTimes(rawEvents);
  const markers = extractMarkers(events);

  return {
    header,
    events,
    markers,
  };
}

/**
 * Converts relative timestamps to cumulative.
 * asciicast v3 uses delta times - each event time is relative to previous.
 */
export function computeCumulativeTimes(events: AsciicastEvent[]): ParsedEvent[] {
  let cumulativeTime = 0;
  const parsed: ParsedEvent[] = [];

  for (const event of events) {
    const [relativeTime, type, data] = event;
    cumulativeTime += relativeTime;

    parsed.push({
      time: cumulativeTime,
      relativeTime,
      type,
      data,
    });
  }

  return parsed;
}

/**
 * Extracts markers (type "m") from events.
 * Returns markers with cumulative timestamps and event indices.
 */
export function extractMarkers(events: ParsedEvent[]): Marker[] {
  const markers: Marker[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'm') {
      markers.push({
        time: event.time,
        label: String(event.data),
        index: i,
      });
    }
  }

  return markers;
}
