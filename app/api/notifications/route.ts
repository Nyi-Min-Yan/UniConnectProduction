import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser, broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE recipient_email = ? OR recipient_role = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(payload.email, payload.role);

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { recipientEmail, recipientRole, type, message, postId, activityId, conversationId } = body;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO notifications (id, recipient_email, recipient_role, type, message, read, created_at, post_id, activity_id, conversation_id, actor_email, actor_name)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(id, recipientEmail || null, recipientRole || null, type, message, now, postId || null, activityId || null, conversationId || null, payload.email, payload.name);

    const notification = {
      id, recipient_email: recipientEmail || null, recipient_role: recipientRole || null,
      type, message, read: 0, created_at: now,
      post_id: postId || null, activity_id: activityId || null,
      conversation_id: conversationId || null, actor_email: payload.email, actor_name: payload.name,
    };
    if (recipientEmail) {
      emitToUser(recipientEmail, WS_EVENTS.NOTIFICATION_CREATED, notification);
    } else if (recipientRole) {
      broadcast(WS_EVENTS.NOTIFICATION_CREATED, notification);
    }

    return NextResponse.json({ notificationId: id }, { status: 201 });
  } catch (error) {
    console.error('Create notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let ids: string[] | undefined;
    try {
      const body = await request.json();
      ids = body.ids;
    } catch {
      // No body sent — mark all as read
    }

    const db = getDb();
    if (ids && Array.isArray(ids)) {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders}) AND recipient_email = ?`).run(...ids, payload.email);
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE recipient_email = ?').run(payload.email);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
