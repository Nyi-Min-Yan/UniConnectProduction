import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = authenticateRequest(_request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: eventId } = await params;
    const db = getDb();

    const registrations = db
      .prepare(
        'SELECT id, event_id, user_email, user_name, created_at FROM event_registrations WHERE event_id = ? ORDER BY created_at DESC'
      )
      .all(eventId);

    return NextResponse.json({ documents: registrations });
  } catch (error) {
    console.error('List registrations error:', error);
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

    const { id: eventId } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM event_registrations WHERE event_id = ? AND user_email = ?').get(eventId, payload.email);
    if (existing) {
      return NextResponse.json({ error: 'Already registered' }, { status: 400 });
    }

    const event = db.prepare('SELECT max_attendees FROM events WHERE id = ?').get(eventId) as { max_attendees: number | null } | undefined;
    if (event?.max_attendees) {
      const count = db.prepare('SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?').get(eventId) as { count: number };
      if (count.count >= event.max_attendees) {
        return NextResponse.json({ error: 'Event is full' }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare('INSERT INTO event_registrations (id, event_id, user_email, user_name, created_at) VALUES (?, ?, ?, ?, ?)').run(id, eventId, payload.email, payload.name, now);

    broadcast(WS_EVENTS.EVENT_REGISTRATION, { event_id: eventId, user_email: payload.email, user_name: payload.name, created_at: now });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Register event error:', error);
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

    const { id: eventId } = await params;
    const db = getDb();

    db.prepare('DELETE FROM event_registrations WHERE event_id = ? AND user_email = ?').run(eventId, payload.email);

    broadcast(WS_EVENTS.EVENT_UNREGISTRATION, { event_id: eventId, user_email: payload.email });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unregister event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
