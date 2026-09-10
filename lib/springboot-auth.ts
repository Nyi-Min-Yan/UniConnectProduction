const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL || 'http://localhost:8080';

export interface SpringBootUser {
  userId: string;
  email: string;
  roleName: string;
  isActive: boolean;
}

export interface SpringBootAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  userId: string;
  email: string;
  roleName: string;
  isActive: boolean;
}

export async function loginWithSpringBoot(email: string, password: string): Promise<SpringBootAuthResponse> {
  const res = await fetch(`${SPRING_BOOT_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(error.message || 'Login failed');
  }

  return res.json();
}

export async function refreshSpringBootToken(refreshToken: string): Promise<SpringBootAuthResponse> {
  const res = await fetch(`${SPRING_BOOT_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error('Token refresh failed');
  }

  return res.json();
}

export async function logoutSpringBoot(accessToken: string): Promise<void> {
  await fetch(`${SPRING_BOOT_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });
}

export async function getSpringBootUser(accessToken: string): Promise<any> {
  const res = await fetch(`${SPRING_BOOT_URL}/api/users/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to get user');
  }

  return res.json();
}

export function getSpringBootBaseUrl(): string {
  return SPRING_BOOT_URL;
}
