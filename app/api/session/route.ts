import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/auth';

export async function GET() {
  const store = await cookies();
  const raw = store.get('uniconnect_session')?.value;
  if (!raw) return NextResponse.json({ user: null });
  try {
    const session = JSON.parse(raw);
    if (!session?.role || !session?.email) return NextResponse.json({ user: null });
    return NextResponse.json({ user: session });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const store = await cookies();
  const raw = store.get('uniconnect_session')?.value;
  if (!raw) return NextResponse.json({ user: null });
  try {
    const session = JSON.parse(raw);
    const user = { ...session, ...body };
    const response = NextResponse.json({ user });
    response.cookies.set('uniconnect_session', JSON.stringify(user), sessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ user: null });
  }
}
