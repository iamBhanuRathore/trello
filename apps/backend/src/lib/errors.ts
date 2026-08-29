import { logger } from './logger';

export class HttpError extends Error {
  status: number;
  details?: any;

  constructor(status: number, message: string, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function httpError(status: number, message: string, details?: any): HttpError {
  return new HttpError(status, message, details);
}

/**
 * Checks if a string contains internal/sensitive database queries, SQL keywords, or connection strings.
 */
export function isSensitiveDatabaseMessage(msg: string): boolean {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed query:') ||
    lower.includes('insert into') ||
    lower.includes('select ') ||
    lower.includes('update ') ||
    lower.includes('delete from') ||
    lower.includes('drizzle') ||
    lower.includes('pg_') ||
    lower.includes('syntax error') ||
    lower.includes('relation "') ||
    lower.includes('column "') ||
    lower.includes('table "') ||
    lower.includes('invalid input value for enum') ||
    lower.includes('connection refused') ||
    lower.includes('econnrefused') ||
    lower.includes('params:') ||
    lower.includes('returning ')
  );
}

/**
 * Sanitizes any error into a safe, human-readable format without leaking SQL queries,
 * parameters, or internal file paths to the client.
 */
export function formatErrorResponse(err: unknown): { status: number; body: { error: string; details?: any } } {
  // If it is an explicit HttpError with a custom status code
  if (err && typeof err === 'object' && 'status' in err && typeof (err as any).status === 'number') {
    const status = (err as any).status;
    const rawMessage = (err as any).message || 'Request failed';
    const details = (err as any).details;

    // Check if the message contains sensitive DB traces
    if (isSensitiveDatabaseMessage(rawMessage)) {
      logger.error({ err, rawMessage }, 'Sensitive error query intercepted in HttpError');
      return {
        status: 500,
        body: { error: 'An unexpected database error occurred. Please try again later.' },
      };
    }

    if (status >= 500) {
      logger.error({ err }, 'Server error (5xx)');
      return {
        status,
        body: { error: rawMessage || 'Internal server error', ...(details !== undefined ? { details } : {}) },
      };
    }

    return {
      status,
      body: { error: rawMessage, ...(details !== undefined ? { details } : {}) },
    };
  }

  const errObj = err as any;
  const rawMessage = errObj?.message || String(err || '');
  const code = errObj?.code;

  // Log full error details on the server for debugging
  logger.error(
    {
      err,
      code,
      message: rawMessage,
      stack: errObj?.stack,
    },
    'Internal server error during request execution'
  );

  // Translate known Postgres error codes to human-readable explanations
  if (code === '23505') {
    return {
      status: 409,
      body: { error: 'A record with this information already exists in the system.' },
    };
  }
  if (code === '23503') {
    return {
      status: 400,
      body: { error: 'The referenced resource or parent record does not exist.' },
    };
  }
  if (code === '22P02') {
    return {
      status: 400,
      body: { error: 'Invalid identifier or parameter format provided.' },
    };
  }
  if (code === '22023') {
    return {
      status: 400,
      body: { error: 'Invalid value provided for one of the fields.' },
    };
  }

  // Intercept SQL query failure messages
  if (isSensitiveDatabaseMessage(rawMessage)) {
    return {
      status: 500,
      body: { error: 'An unexpected database error occurred. Please try again later.' },
    };
  }

  // Fallback for general unhandled exceptions
  return {
    status: 500,
    body: { error: 'An unexpected error occurred while processing your request.' },
  };
}

/**
 * Route handler helper to be used in try/catch blocks.
 * Sets the HTTP response status code and returns the sanitized error body.
 */
export function handleRouteError(err: unknown, set: { status?: number | string }) {
  const { status, body } = formatErrorResponse(err);
  set.status = status;
  return body;
}
