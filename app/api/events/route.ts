import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast, emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const visibility = searchParams.get('visibility');
    const user = authenticateRequest(request);

    let query: string;
    const params: (string | number)[] = [];

    if (visibility) {
      query = 'SELECT * FROM events WHERE visibility = ?';
      params.push(visibility);
    } else if (user?.role === 'admin' || user?.role === 'student-affair') {
      query = 'SELECT * FROM events';
    } else {
      query = 'SELECT * FROM events WHERE visibility = ?';
      params.push('public');
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY event_date ASC';
    const events = db.prepare(query).all(...params);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const location = formData.get('location') as string;
    const eventDateMs = Number(formData.get('eventDate'));
    const category = formData.get('category') as string;
    const maxAttendees = formData.get('maxAttendees') as string;
    const image_url = formData.get('imageUrl') as string;
    const visibility = formData.get('visibility') as string;

    if (!title || !Number.isFinite(eventDateMs)) {
      return NextResponse.json({ error: 'Title and date required' }, { status: 400 });
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const event_date = Math.floor(eventDateMs);

    db.prepare(`
      INSERT INTO events (id, title, description, location, event_date, category, max_attendees, image_url, visibility, created_by, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description || null, location || null, event_date, category || 'Other', maxAttendees ? Number(maxAttendees) : null, image_url || null, visibility || 'public', payload.email, payload.name, now);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    broadcast(WS_EVENTS.EVENT_CREATED, event);

    const notifId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO notifications (id, recipient_role, type, message, read, created_at, actor_email, actor_name)
      VALUES (?, 'all', 'event', ?, 0, ?, ?, ?)
    `).run(notifId, `New event: ${title}`, now, payload.email, payload.name);

    const notification = {
      id: notifId,
      recipient_role: 'all',
      type: 'event',
      message: `New event: ${title}`,
      read: 0,
      created_at: now,
      actor_email: payload.email,
      actor_name: payload.name,
    };
    broadcast(WS_EVENTS.NOTIFICATION_CREATED, notification);

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
