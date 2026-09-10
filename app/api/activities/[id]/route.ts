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
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

    return NextResponse.json({ data: activity });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { caption?: unknown };
    if (typeof body.caption !== 'string') {
      return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
    }
    const caption = body.caption.trim().slice(0, 500);

    const db = getDb();
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    if (activity.author_email !== user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('UPDATE activities SET caption = ? WHERE id = ?').run(caption, id);

    const updated = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
    broadcast(WS_EVENTS.ACTIVITY_UPDATED, updated);
    return NextResponse.json({ ok: true });
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
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

    if (activity.author_email !== user.email && user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('DELETE FROM activities WHERE id = ?').run(id);

    broadcast(WS_EVENTS.ACTIVITY_DELETED, { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
