import { describe, it, expect } from 'bun:test';
import {
  httpError,
  formatErrorResponse,
  formatValidationError,
  handleRouteError,
  isSensitiveDatabaseMessage,
} from './errors';

describe('Error Sanitization and Handling Utility', () => {
  describe('isSensitiveDatabaseMessage', () => {
    it('detects raw Drizzle failed query messages', () => {
      const msg =
        'Failed query: insert into "organization_members" ("id", "org_id") values ($1, $2)\nparams: foo, bar';
      expect(isSensitiveDatabaseMessage(msg)).toBe(true);
    });

    it('detects sql keywords and postgres internal table errors', () => {
      expect(isSensitiveDatabaseMessage('select * from users where id = 1')).toBe(true);
      expect(isSensitiveDatabaseMessage('update "cards" set title = $1')).toBe(true);
      expect(isSensitiveDatabaseMessage('delete from "refresh_tokens"')).toBe(true);
      expect(isSensitiveDatabaseMessage('relation "users" does not exist')).toBe(true);
      expect(
        isSensitiveDatabaseMessage('invalid input value for enum org_member_role: "viewer"')
      ).toBe(true);
    });

    it('allows normal human-readable messages', () => {
      expect(isSensitiveDatabaseMessage('Please provide a valid email address.')).toBe(false);
      expect(
        isSensitiveDatabaseMessage('User is already an active member of this organization.')
      ).toBe(false);
      expect(isSensitiveDatabaseMessage('Organization not found.')).toBe(false);
    });
  });

  describe('formatErrorResponse', () => {
    it('formats safe HttpError correctly with its status', () => {
      const err = httpError(400, 'Invalid email address provided.');
      const res = formatErrorResponse(err);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid email address provided.' });
    });

    it('formats 409 Conflict HttpError correctly', () => {
      const err = httpError(409, 'User is already an active member of this organization.');
      const res = formatErrorResponse(err);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'User is already an active member of this organization.' });
    });

    it('intercepts and sanitizes HttpError if message accidentally contains SQL query', () => {
      const err = httpError(
        500,
        'Failed query: insert into "organization_members" ("id") values (1)'
      );
      const res = formatErrorResponse(err);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('An unexpected database error occurred. Please try again later.');
      expect(res.body.error).not.toContain('Failed query');
      expect(res.body.error).not.toContain('organization_members');
    });

    it('sanitizes raw Drizzle/Postgres database error without leaking queries or params', () => {
      const rawDbError = new Error(
        'Failed query: insert into "organization_members" ("id", "organization_id", "user_id", "role", "status", "invited_by") values (default, $1, $2, $3, $4, $5) returning "id"\nparams: 35771ba9-6793-475f-82d0-79b92d6394ce,a909b3ea-f1c8-432f-8ffe-e2999618095a,viewer,active,8f54498c-61b8-4496-9839-dc67cdf43738'
      );
      const res = formatErrorResponse(rawDbError);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('An unexpected database error occurred. Please try again later.');
      expect(res.body.error).not.toContain('Failed query');
      expect(res.body.error).not.toContain('35771ba9');
      expect(res.body.error).not.toContain('organization_members');
    });

    it('translates Postgres unique constraint code 23505 to human-readable message', () => {
      const dbErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      });
      const res = formatErrorResponse(dbErr);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('A record with this information already exists in the system.');
    });

    it('translates Postgres foreign key code 23503 to human-readable message', () => {
      const dbErr = Object.assign(new Error('foreign key constraint failed'), { code: '23503' });
      const res = formatErrorResponse(dbErr);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('The referenced resource or parent record does not exist.');
    });

    it('translates Postgres invalid identifier code 22P02 to human-readable message', () => {
      const dbErr = Object.assign(new Error('invalid input syntax for type uuid'), {
        code: '22P02',
      });
      const res = formatErrorResponse(dbErr);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid identifier or parameter format provided.');
    });

    it('handles general unexpected JavaScript exceptions cleanly', () => {
      const unexpectedErr = new TypeError('Cannot read properties of undefined');
      const res = formatErrorResponse(unexpectedErr);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('An unexpected error occurred while processing your request.');
    });
  });

  describe('handleRouteError', () => {
    it('sets status on response context and returns sanitized body', () => {
      const setObj: { status?: number | string } = {};
      const err = httpError(404, 'User profile not found.');
      const body = handleRouteError(err, setObj);
      expect(setObj.status).toBe(404);
      expect(body).toEqual({ error: 'User profile not found.' });
    });
  });

  describe('formatValidationError', () => {
    it('formats raw stringified TypeBox email error into human-readable message', () => {
      const typeBoxError = {
        message: JSON.stringify({
          type: 'validation',
          on: 'body',
          property: '/email',
          message: "Expected string to match 'email' format",
          errors: [
            {
              path: '/email',
              message: "Expected string to match 'email' format",
            },
          ],
        }),
      };

      const res = formatValidationError(typeBoxError);
      expect(res.error).toBe('Validation failed');
      expect(res.message).toBe(
        "Field 'email' must be a valid email address (e.g. user@example.com)"
      );
      expect(res.details?.[0]?.field).toBe('email');
    });

    it('formats missing required property errors cleanly', () => {
      const typeBoxError = {
        message: JSON.stringify({
          errors: [
            {
              path: '/password',
              message: 'Expected required property',
            },
          ],
        }),
      };

      const res = formatValidationError(typeBoxError);
      expect(res.error).toBe('Validation failed');
      expect(res.message).toBe("Field 'password' is required");
    });
  });
});
