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
    const likes = db.prepare('SELECT * FROM activity_likes WHERE activity_id = ?').all(activityId);
    return NextResponse.json(likes);
  } catch (error) {
    console.error('Get activity likes error:', error);
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
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    const existing = db.prepare('SELECT id FROM activity_likes WHERE activity_id = ? AND user_email = ?').get(activityId, payload.email);
    if (existing) {
      return NextResponse.json({ error: 'Already liked' }, { status: 400 });
    }

    const likeId = crypto.randomUUID();
    db.prepare('INSERT INTO activity_likes (id, activity_id, user_email, created_at) VALUES (?, ?, ?, ?)').run(likeId, activityId, payload.email, now);
    db.prepare('UPDATE activities SET likes_count = likes_count + 1 WHERE id = ?').run(activityId);

    const likeRow = { id: likeId, activity_id: activityId, user_email: payload.email, created_at: now };
    broadcast(WS_EVENTS.ACTIVITY_LIKE, likeRow);

    // Notify activity author
    const activity = db.prepare('SELECT author_email FROM activities WHERE id = ?').get(activityId) as { author_email: string } | undefined;
    if (activity && activity.author_email !== payload.email) {
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, activity_id, actor_email, actor_name, created_at)
         VALUES (?, ?, 'like', ?, ?, ?, ?, ?)`
      ).run(notifId, activity.author_email, `${payload.name} liked your activity`, activityId, payload.email, payload.name, now);
      emitToUser(activity.author_email, WS_EVENTS.NOTIFICATION_CREATED, {
        id: notifId, recipient_email: activity.author_email, type: 'like',
        message: `${payload.name} liked your activity`, activity_id: activityId,
        actor_email: payload.email, actor_name: payload.name, created_at: now, read: 0,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Like activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: activityId } = await params;
    const db = getDb();

    const result = db.prepare('DELETE FROM activity_likes WHERE activity_id = ? AND user_email = ?').run(activityId, payload.email);
    if (result.changes > 0) {
      db.prepare('UPDATE activities SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(activityId);
      broadcast(WS_EVENTS.ACTIVITY_UNLIKE, { activity_id: activityId, user_email: payload.email });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unlike activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
