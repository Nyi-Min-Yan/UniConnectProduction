import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id, messageId } = await params;

    const db = getDb();
    const msg = db
      .prepare('SELECT * FROM chat_messages WHERE id = ? AND conversation_id = ?')
      .get(messageId, id) as Record<string, unknown> | undefined;
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

    return NextResponse.json({ data: msg });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id, messageId } = await params;
    const { content } = (await request.json().catch(() => ({ content: undefined }))) as { content?: string };
    const text = (content ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

    const db = getDb();
    const msg = db
      .prepare('SELECT * FROM chat_messages WHERE id = ? AND conversation_id = ?')
      .get(messageId, id) as Record<string, unknown> | undefined;
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (msg.sender_email !== user.email) {
      return NextResponse.json({ error: 'Only the sender can edit this message' }, { status: 403 });
    }

    db.prepare('UPDATE chat_messages SET content = ? WHERE id = ? AND conversation_id = ?')
      .run(text, messageId, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id, messageId } = await params;

    const db = getDb();
    const msg = db
      .prepare('SELECT * FROM chat_messages WHERE id = ? AND conversation_id = ?')
      .get(messageId, id) as Record<string, unknown> | undefined;
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (msg.sender_email !== user.email) {
      return NextResponse.json({ error: 'Only the sender can delete this message' }, { status: 403 });
    }

    db.prepare('DELETE FROM chat_messages WHERE id = ? AND conversation_id = ?')
      .run(messageId, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
