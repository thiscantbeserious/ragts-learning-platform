/**
 * Snapshot tests for NDJSON stream parser.
 * Locks down parsed header/event structure from .cast fixtures.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { NdjsonStream } from '../../../src/server/processing/ndjson-stream.js';

const fixturesDir = join(__dirname, '../../fixtures');

/** Collect all items from stream into arrays. */
async function collectStream(filePath: string) {
  const stream = new NdjsonStream(filePath);
  let header: any = null;
  const events: any[] = [];

  for await (const item of stream) {
    if (item.header) header = item.header;
    if (item.event) events.push(item.event);
  }

  return { header, events, eventCount: events.length };
}

describe('ndjson-stream snapshots', () => {
  it('valid-with-markers.cast — header snapshot', async () => {
    const { header, eventCount } = await collectStream(
      join(fixturesDir, 'valid-with-markers.cast')
    );

    expect(header).toMatchSnapshot();
    expect(eventCount).toMatchSnapshot();
  });

  it('valid-with-markers.cast — first 5 events', async () => {
    const { events } = await collectStream(
      join(fixturesDir, 'valid-with-markers.cast')
    );

    const firstFive = events.slice(0, 5);
    expect(firstFive).toMatchSnapshot();
  });

  it('valid-without-markers.cast — header and event count', async () => {
    const { header, eventCount } = await collectStream(
      join(fixturesDir, 'valid-without-markers.cast')
    );

    expect(header).toMatchSnapshot();
    expect(eventCount).toMatchSnapshot();
  });

  it('header-only.cast — empty events', async () => {
    const { header, eventCount } = await collectStream(
      join(fixturesDir, 'header-only.cast')
    );

    expect(header).toMatchSnapshot();
    expect(eventCount).toBe(0);
  });

  it('malformed-json.cast — handles malformed lines gracefully', async () => {
    const { header, eventCount } = await collectStream(
      join(fixturesDir, 'malformed-json.cast')
    );

    // Malformed lines should be skipped, but valid ones parsed
    expect(header).toMatchSnapshot();
    expect(eventCount).toMatchSnapshot();
  });

  it('synthetic-tui-session.cast — header and event count', async () => {
    const { header, eventCount } = await collectStream(
      join(fixturesDir, 'synthetic-tui-session.cast')
    );

    expect(header).toMatchSnapshot();
    expect(eventCount).toMatchSnapshot();
  });
});
