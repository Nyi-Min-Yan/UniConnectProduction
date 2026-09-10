import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    return NextResponse.json({ data: event });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Only admins and student affairs can change event visibility' }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { visibility?: unknown };
    if (body.visibility !== 'public' && body.visibility !== 'private') {
      return NextResponse.json({ error: 'Visibility must be "public" or "private"' }, { status: 400 });
    }

    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (event.visibility === body.visibility) return NextResponse.json({ ok: true, unchanged: true });

    db.prepare('UPDATE events SET visibility = ? WHERE id = ?').run(body.visibility, id);

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    broadcast(WS_EVENTS.EVENT_UPDATED, updated);
    return NextResponse.json({ ok: true, visibility: body.visibility });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const canDelete =
      user.role === 'admin' ||
      user.role === 'student-affair' ||
      event.created_by === user.email;
    if (!canDelete) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    db.prepare('DELETE FROM events WHERE id = ?').run(id);

    broadcast(WS_EVENTS.EVENT_DELETED, { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
