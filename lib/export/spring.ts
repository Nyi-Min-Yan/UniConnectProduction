import type { NextRequest } from 'next/server';
import { authenticateRequest, sessionCookieOptions } from '@/lib/auth';
import type { NextResponse } from 'next/server';

// The university server's token/refresh contract — a copy of the behaviour in
// app/api/backend/[...path]/route.ts, kept here so the export route handlers
// can talk to the Spring backend directly (with the same BASE + cookie) while
// enforcing their own permission gate.
const SPRING_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function readTokens(cookieHeader: string): { accessToken?: string; refreshToken?: string } | null {
  const backendCookie = cookieHeader
    .split(';')
    .find((c) => c.trim().startsWith('uniconnect_backend='));
  if (!backendCookie) return null;
  try {
    const value = backendCookie.split('=').slice(1).join('=');
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

async function refreshAccess(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${SPRING_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export interface SpringFetchResult {
  res: Response;
  /** Present when a refresh was performed; the caller should persist it to the cookie. */
  newTokens?: { accessToken: string; refreshToken: string };
}

/**
 * Authenticated fetch to the Spring backend using the same uniconnect_backend
 * cookie the browser holds, refreshing the access token once on 401/403.
 */
export async function springFetchWithAuth(cookieHeader: string, path: string): Promise<SpringFetchResult> {
  const tokens = readTokens(cookieHeader);
  if (!tokens?.accessToken) {
    return {
      res: new Response(JSON.stringify({ message: 'Not authenticated with university server' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    };
  }
  const call = (token: string) =>
    fetch(`${SPRING_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  let res = await call(tokens.accessToken);
  if ((res.status === 401 || res.status === 403) && tokens.refreshToken) {
    try {
      const refreshed = await refreshAccess(tokens.refreshToken);
      res = await call(refreshed.accessToken);
      return { res, newTokens: refreshed };
    } catch {
      return {
        res: new Response(JSON.stringify({ message: 'Session expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      };
    }
  }
  return { res };
}

export type ExportAuthorizeError = { status: number; message: string };

export type ExportAuthResult = { allowed: boolean; error: ExportAuthorizeError | null };

/**
 * Server-enforced export permission. Admins may always export; lecturers may
 * export only when their staff record carries a lecturer position ('LECTURER'
 * or 'HOD', per the User Management position defaults). Everyone else — and
 * lecturers without an appropriate position — is denied.
 */
export async function authorizeExporter(request: NextRequest): Promise<ExportAuthResult> {
  const cookieHeader = request.headers.get('cookie') || '';
  const user = authenticateRequest(request);
  if (!user) {
    return { allowed: false, error: { status: 401, message: 'You must be signed in to export.' } };
  }
  if (user.role === 'admin') return { allowed: true, error: null };
  if (user.role !== 'lecturer') {
    return {
      allowed: false,
      error: { status: 403, message: 'You do not have permission to export this data.' },
    };
  }
  const { res } = await springFetchWithAuth(cookieHeader, '/api/staff/me');
  if (!res.ok) {
    return {
      allowed: false,
      error: { status: 403, message: 'You do not have permission to export this data.' },
    };
  }
  const staff = await res.json().catch(() => null);
  const positions: string[] = Array.isArray(staff?.positions) ? staff.positions : [];
  if (positions.includes('LECTURER') || positions.includes('HOD')) return { allowed: true, error: null };
  return {
    allowed: false,
    error: { status: 403, message: 'You do not have permission to export this data.' },
  };
}

/** Attach refreshed tokens back onto the outbound response cookie, matching the proxy. */
export function carryFreshTokens(
  response: NextResponse,
  newTokens: { accessToken: string; refreshToken: string },
  request: NextRequest,
): NextResponse {
  response.cookies.set('uniconnect_backend', JSON.stringify(newTokens), sessionCookieOptions(request));
  return response;
}