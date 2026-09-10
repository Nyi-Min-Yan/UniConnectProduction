import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const store = await cookies();
    const raw = store.get('uniconnect_session')?.value;
    if (!raw) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const session = JSON.parse(raw);
    if (!session?.email) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const updatedSession = { ...session, ...body };
    const response = NextResponse.json({ user: updatedSession });
    response.cookies.set('uniconnect_session', JSON.stringify(updatedSession), sessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
