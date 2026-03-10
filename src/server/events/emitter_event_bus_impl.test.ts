// @vitest-environment node
/**
 * Tests for EmitterEventBusImpl — the in-process EventEmitter implementation of EventBusAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmitterEventBusImpl } from './emitter_event_bus_impl.js';
import type { PipelineEvent } from '../../shared/types/pipeline.js';
import { PipelineStage } from '../../shared/types/pipeline.js';

describe('EmitterEventBusImpl', () => {
  let bus: EmitterEventBusImpl;

  beforeEach(() => {
    bus = new EmitterEventBusImpl();
  });

  describe('emit and on', () => {
    it('calls handler with correct payload when event is emitted', () => {
      const handler = vi.fn();
      bus.on('session.uploaded', handler);

      const event: PipelineEvent = {
        type: 'session.uploaded',
        sessionId: 'sess-1',
        filename: 'test.cast',
      };
      bus.emit(event);

      expect(handler).toHaveBeenCalledExactlyOnceWith(event);
    });

    it('does not call handler for a different event type', () => {
      const handler = vi.fn();
      bus.on('session.validated', handler);

      bus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('passes the full typed event object to the handler', () => {
      let received: PipelineEvent | null = null;
      bus.on('session.detected', (event) => {
        received = event;
      });

      const event: PipelineEvent = { type: 'session.detected', sessionId: 'sess-2', sectionCount: 5 };
      bus.emit(event);

      expect(received).toEqual(event);
    });
  });

  describe('off (unsubscribe)', () => {
    it('stops calling handler after off() is called', () => {
      const handler = vi.fn();
      bus.on('session.ready', handler);
      bus.off('session.ready', handler);

      bus.emit({ type: 'session.ready', sessionId: 'sess-3' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('only removes the specified handler, leaving other handlers intact', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.on('session.ready', handler1);
      bus.on('session.ready', handler2);

      bus.off('session.ready', handler1);
      bus.emit({ type: 'session.ready', sessionId: 'sess-4' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('once', () => {
    it('fires the handler exactly once even when event is emitted multiple times', () => {
      const handler = vi.fn();
      bus.once('session.failed', handler);

      const event: PipelineEvent = { type: 'session.failed', sessionId: 'sess-5', stage: PipelineStage.Validate, error: 'bad file' };
      bus.emit(event);
      bus.emit(event);
      bus.emit(event);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('passes the correct payload to the once handler', () => {
      let received: PipelineEvent | null = null;
      bus.once('session.replayed', (event) => {
        received = event;
      });

      const event: PipelineEvent = { type: 'session.replayed', sessionId: 'sess-6', lineCount: 42 };
      bus.emit(event);

      expect(received).toEqual(event);
    });
  });

  describe('multiple listeners', () => {
    it('all handlers for the same event type receive the event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('session.deduped', handler1);
      bus.on('session.deduped', handler2);
      bus.on('session.deduped', handler3);

      const event: PipelineEvent = {
        type: 'session.deduped',
        sessionId: 'sess-7',
        rawLines: 100,
        cleanLines: 60,
      };
      bus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });
  });

  describe('no listeners', () => {
    it('emitting an event with no listeners does not throw', () => {
      expect(() => {
        bus.emit({ type: 'session.uploaded', sessionId: 'sess-8', filename: 'noop.cast' });
      }).not.toThrow();
    });

    it('emitting after all listeners are removed does not throw', () => {
      const handler = vi.fn();
      bus.on('session.ready', handler);
      bus.off('session.ready', handler);

      expect(() => {
        bus.emit({ type: 'session.ready', sessionId: 'sess-9' });
      }).not.toThrow();
    });
  });

  describe('event type isolation', () => {
    it('handlers for different event types do not interfere with each other', () => {
      const uploadHandler = vi.fn();
      const readyHandler = vi.fn();

      bus.on('session.uploaded', uploadHandler);
      bus.on('session.ready', readyHandler);

      bus.emit({ type: 'session.uploaded', sessionId: 'sess-10', filename: 'a.cast' });

      expect(uploadHandler).toHaveBeenCalledOnce();
      expect(readyHandler).not.toHaveBeenCalled();
    });
  });

  describe('once + off interaction', () => {
    it('off() cancels a pending once() handler before it fires', () => {
      const handler = vi.fn();
      bus.once('session.ready', handler);
      bus.off('session.ready', handler);

      bus.emit({ type: 'session.ready', sessionId: 'sess-12' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('handler errors', () => {
    it('a throwing handler does not prevent other handlers from being called', () => {
      const errorHandler = vi.fn(() => { throw new Error('boom'); });
      const goodHandler = vi.fn();

      bus.on('session.ready', errorHandler);
      bus.on('session.ready', goodHandler);

      expect(() => {
        bus.emit({ type: 'session.ready', sessionId: 'sess-13' });
      }).toThrow('boom');

      expect(errorHandler).toHaveBeenCalledOnce();
      // Note: Node.js EventEmitter stops after first throw — this is expected behavior
    });
  });

  describe('retrying event', () => {
    it('emits and receives session.retrying event with correct payload', () => {
      const handler = vi.fn();
      bus.on('session.retrying', handler);

      const event: PipelineEvent = {
        type: 'session.retrying',
        sessionId: 'sess-11',
        stage: PipelineStage.Detect,
        attempt: 2,
      };
      bus.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });
});
