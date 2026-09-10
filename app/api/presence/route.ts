import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    const db = getDb();
    const thirtySecondsAgo = Math.floor(Date.now() / 1000) - 30;

    if (email) {
      const user = db.prepare('SELECT email, last_seen FROM user_presence WHERE email = ?').get(email) as { email: string; last_seen: number } | undefined;
      if (!user) return NextResponse.json({ online: false, last_seen: 0 });
      return NextResponse.json({ online: user.last_seen > thirtySecondsAgo, last_seen: user.last_seen });
    }

    const online = db.prepare('SELECT email, last_seen FROM user_presence WHERE last_seen > ?').all(thirtySecondsAgo);
    return NextResponse.json({ online });
  } catch (error) {
    console.error('Get presence error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    const body = await request.json().catch(() => ({}));
    const online = body.online ?? true;
    const lastSeen = body.last_seen ?? now;

    db.prepare(`
      INSERT INTO user_presence (id, email, last_seen, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET last_seen = excluded.last_seen, updated_at = excluded.updated_at
    `).run(crypto.randomUUID(), payload.email, lastSeen, now);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update presence error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
