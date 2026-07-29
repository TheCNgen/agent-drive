import { NextResponse } from 'next/server';

/**
 * Typed error for auth/principal-resolution failures. Carries the HTTP
 * status and machine-readable `code` the SDK branches on, plus any extra
 * fields that belong in the JSON body (e.g. `requiredScope`).
 */
export class PrincipalError extends Error {
  status: number;
  code: string;
  extra?: Record<string, any>;

  constructor(status: number, code: string, message: string, extra?: Record<string, any>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * Converts a PrincipalError into a NextResponse; returns null for anything
 * else so callers can fall through to their normal error handling.
 */
export function principalErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof PrincipalError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...error.extra },
      { status: error.status }
    );
  }
  return null;
}
