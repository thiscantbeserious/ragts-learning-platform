/**
 * Tests for ServiceError — the typed error class used by the service layer.
 *
 * Covers: construction, message/code/statusCode fields, name override,
 * instanceof relationships, and default statusCode behaviour.
 */
import { describe, it, expect } from 'vitest';
import { ServiceError } from './errors.js';

describe('ServiceError', () => {
  describe('construction', () => {
    it('sets the message correctly', () => {
      const err = new ServiceError('Session not found', 'NOT_FOUND', 404);
      expect(err.message).toBe('Session not found');
    });

    it('sets the code correctly', () => {
      const err = new ServiceError('Bad input', 'BAD_REQUEST', 400);
      expect(err.code).toBe('BAD_REQUEST');
    });

    it('sets the provided statusCode', () => {
      const err = new ServiceError('Conflict', 'CONFLICT', 409);
      expect(err.statusCode).toBe(409);
    });

    it('defaults statusCode to 400 when not provided', () => {
      const err = new ServiceError('Validation failed', 'VALIDATION_ERROR');
      expect(err.statusCode).toBe(400);
    });

    it('overrides the error name to "ServiceError"', () => {
      const err = new ServiceError('Something', 'BAD_REQUEST', 400);
      expect(err.name).toBe('ServiceError');
    });
  });

  describe('instanceof', () => {
    it('is an instance of Error', () => {
      const err = new ServiceError('test', 'NOT_FOUND', 404);
      expect(err).toBeInstanceOf(Error);
    });

    it('is an instance of ServiceError', () => {
      const err = new ServiceError('test', 'NOT_FOUND', 404);
      expect(err).toBeInstanceOf(ServiceError);
    });
  });

  describe('can be thrown and caught', () => {
    it('can be caught and its fields read after throw', () => {
      let caught: ServiceError | null = null;
      try {
        throw new ServiceError('Session not found', 'NOT_FOUND', 404);
      } catch (e) {
        if (e instanceof ServiceError) caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught?.code).toBe('NOT_FOUND');
      expect(caught?.statusCode).toBe(404);
    });
  });
});
