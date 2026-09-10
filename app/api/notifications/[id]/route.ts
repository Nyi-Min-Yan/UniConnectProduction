import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    return NextResponse.json({ data: notification });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    const isRecipient = notification.recipient_email === user.email;
    const isRoleRecipient = !notification.recipient_email && notification.recipient_role === user.role;
    if (!isRecipient && !isRoleRecipient) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);

    return NextResponse.json({ ok: true, notification: { ...notification, read: 1 } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    const isRecipient = notification.recipient_email === user.email;
    const isRoleRecipient = !notification.recipient_email && notification.recipient_role === user.role;
    if (!isRecipient && !isRoleRecipient) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
