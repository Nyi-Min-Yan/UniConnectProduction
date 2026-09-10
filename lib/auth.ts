import type { NextRequest } from 'next/server';
import { getSpringBootUser, refreshSpringBootToken } from './springboot-auth';

function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim().toLowerCase();
    if (first === 'https') return true;
  }
  return request.nextUrl.protocol === 'https:';
}

export function sessionCookieOptions(request: NextRequest) {
  return {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureRequest(request),
  };
}

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  role: string;
  initials?: string;
  major?: string;
}

export async function getAuthUser(cookies: string): Promise<AuthUser | null> {
  try {
    const backendCookie = cookies.split(';').find(c => c.trim().startsWith('uniconnect_backend='));
    if (!backendCookie) return null;

    const value = backendCookie.split('=').slice(1).join('=');
    const { accessToken, refreshToken } = JSON.parse(decodeURIComponent(value));

    if (!accessToken) return null;

    try {
      const user = await getSpringBootUser(accessToken);
      return {
        userId: user.userId || user.id,
        email: user.email,
        name: user.name || user.staffName || user.studentName,
        role: user.roleName || user.role,
        initials: user.initials,
        major: user.major,
      };
    } catch {
      if (refreshToken) {
        try {
          const refreshed = await refreshSpringBootToken(refreshToken);
          const user = await getSpringBootUser(refreshed.accessToken);
          return {
            userId: user.userId || user.id,
            email: user.email,
            name: user.name || user.staffName || user.studentName,
            role: user.roleName || user.role,
            initials: user.initials,
            major: user.major,
          };
        } catch {
          return null;
        }
      }
      return null;
    }
  } catch {
    return null;
  }
}

export function authenticateRequest(request: Request): AuthUser | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const backendCookie = cookieHeader.split(';').find(c => c.trim().startsWith('uniconnect_backend='));
  if (!backendCookie) return null;

  try {
    const value = backendCookie.split('=').slice(1).join('=');
    const { accessToken } = JSON.parse(decodeURIComponent(value));
    if (!accessToken) return null;

    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const rawRole = payload.role || payload.roleName || 'student';
    const email = (payload.email || '').toLowerCase();
    const EMAIL_ROLE_OVERRIDE: Record<string, string> = {
      'kohtet@gmail.com': 'student-affair',
    };
    const roleMap: Record<string, string> = {
      SYSTEM_ADMIN: 'admin',
      STUDENT_AFFAIRS_OFFICER: 'student-affair',
      STAFF: 'lecturer',
      STUDENT: 'student',
    };
    const role = EMAIL_ROLE_OVERRIDE[email] || roleMap[rawRole] || rawRole;
    return {
      userId: payload.sub || '',
      email: payload.email || '',
      name: payload.name || (payload.email || '').split('@')[0] || 'User',
      role,
      initials: payload.initials || (payload.name || payload.email || '')
        .split(/\s+/).filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase(),
    };
  } catch {
    return null;
  }
}

export function extractTokenFromCookies(cookies: string): string | null {
  const backendCookie = cookies.split(';').find(c => c.trim().startsWith('uniconnect_backend='));
  if (!backendCookie) return null;

  try {
    const value = backendCookie.split('=').slice(1).join('=');
    const { accessToken } = JSON.parse(decodeURIComponent(value));
    return accessToken;
  } catch {
    return null;
  }
}

export async function proxyToSpringBoot(
  path: string,
  request: Request,
  options?: { method?: string; body?: any }
): Promise<Response> {
  const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL || 'http://localhost:8080';
  const token = extractTokenFromCookies(request.headers.get('cookie') || '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${SPRING_BOOT_URL}${path}`, {
    method: options?.method || request.method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  return res;
}
