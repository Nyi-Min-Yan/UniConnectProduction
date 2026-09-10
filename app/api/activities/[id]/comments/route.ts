import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast, emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: activityId } = await params;
    const db = getDb();
    const comments = db.prepare('SELECT * FROM activity_comments WHERE activity_id = ? ORDER BY created_at ASC').all(activityId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Get activity comments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: activityId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO activity_comments (id, activity_id, author_email, author_name, author_initials, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, activityId, payload.email, payload.name, payload.initials, content, now);

    db.prepare('UPDATE activities SET comments_count = comments_count + 1 WHERE id = ?').run(activityId);

    const comment = db.prepare('SELECT * FROM activity_comments WHERE id = ?').get(id) as Record<string, unknown>;
    broadcast(WS_EVENTS.ACTIVITY_COMMENT_CREATED, comment);

    // Notify activity author
    const activity = db.prepare('SELECT author_email FROM activities WHERE id = ?').get(activityId) as { author_email: string } | undefined;
    if (activity && activity.author_email !== payload.email) {
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, activity_id, actor_email, actor_name, created_at)
         VALUES (?, ?, 'comment', ?, ?, ?, ?, ?)`
      ).run(notifId, activity.author_email, `${payload.name} commented on your activity`, activityId, payload.email, payload.name, now);
      emitToUser(activity.author_email, WS_EVENTS.NOTIFICATION_CREATED, {
        id: notifId, recipient_email: activity.author_email, type: 'comment',
        message: `${payload.name} commented on your activity`, activity_id: activityId,
        actor_email: payload.email, actor_name: payload.name, created_at: now, read: 0,
      });
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('Create activity comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
