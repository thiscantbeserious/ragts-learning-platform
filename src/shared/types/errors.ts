/**
 * Typed error class for service-layer business rule violations.
 *
 * Routes catch ServiceError and map its statusCode to the HTTP response,
 * keeping HTTP concerns out of service logic.
 */

/** Semantic error codes that map to HTTP status codes in route handlers. */
export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'VALIDATION_ERROR';

/**
 * Thrown by service methods when a business rule is violated.
 * Carries a machine-readable code and a suggested HTTP status code.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ServiceErrorCode,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
