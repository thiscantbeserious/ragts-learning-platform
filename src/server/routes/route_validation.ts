/**
 * Route validation utilities for Hono handlers.
 *
 * Provides lightweight helpers for validating path/query params and
 * mapping Typia IValidation errors to a structured API error shape.
 *
 * Connections: Used by all route handlers for input and response validation.
 */

import { type IValidation } from 'typia';
import type { Context } from 'hono';

/** Structured validation error returned to clients on 4xx responses. */
export interface ValidationErrorResponse {
  error: string;
  fields?: ValidationFieldError[];
}

/** Per-field validation error detail. */
export interface ValidationFieldError {
  /** JSON path to the invalid field (e.g. "$input.version"). */
  path: string;
  /** Expected type or constraint description. */
  expected: string;
  /** Actual value that failed validation. */
  value: unknown;
}

/**
 * Validate that a path parameter is a non-empty string.
 * Returns a 400 JSON response if the param is empty; otherwise returns null.
 *
 * Usage: `const invalid = validatePathId(c, id); if (invalid) return invalid;`
 */
export function validatePathId(c: Context, id: string | undefined): Response | null {
  if (!id || id.trim().length === 0) {
    const body: ValidationErrorResponse = {
      error: 'Invalid path parameter: id must be a non-empty string',
    };
    return c.json(body, 400);
  }
  return null;
}

/**
 * Validate that a query parameter is a non-empty string.
 * Returns a 400 JSON response if the param is missing or empty; otherwise returns null.
 */
export function validateQueryParam(
  c: Context,
  name: string,
  value: string | undefined,
): Response | null {
  if (!value || value.trim().length === 0) {
    const body: ValidationErrorResponse = { error: `Missing or empty query parameter: ${name}` };
    return c.json(body, 400);
  }
  return null;
}

/**
 * Map Typia IValidation.IError[] to ValidationFieldError[] for the API response.
 * Trims the list to the first 10 errors to avoid oversized error responses.
 */
export function mapTypiaErrors(errors: IValidation.IError[]): ValidationFieldError[] {
  return errors.slice(0, 10).map((e) => ({
    path: e.path,
    expected: e.expected,
    value: e.value,
  }));
}
