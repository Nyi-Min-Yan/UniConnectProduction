import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: postId } = await params;
    const body = await request.json();
    const { recipients } = body;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO post_shares (id, post_id, sharer_email, sharer_name, recipients, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, postId, payload.email, payload.name, JSON.stringify(recipients || []), now);

    db.prepare('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?').run(postId);

    broadcast(WS_EVENTS.POST_SHARE, { post_id: postId, sharer_email: payload.email, sharer_name: payload.name, recipients, created_at: now });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Share post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
