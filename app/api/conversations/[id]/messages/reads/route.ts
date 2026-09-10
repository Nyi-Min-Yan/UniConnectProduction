import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
    if (!participantIds.includes(user.email)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    const reads = db.prepare('SELECT message_id, reader_email, read_at FROM message_reads WHERE conversation_id = ?').all(id);
    return NextResponse.json({ reads });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
    if (!participantIds.includes(user.email)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // Mark messages as read and track reads
    const unreadMessages = db.prepare(
      'SELECT id FROM chat_messages WHERE conversation_id = ? AND sender_email != ? AND is_read = 0'
    ).all(id, user.email);

    if (unreadMessages.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const insert = db.prepare(
        'INSERT OR IGNORE INTO message_reads (id, conversation_id, message_id, reader_email, read_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const msg of unreadMessages) {
        insert.run(crypto.randomUUID(), id, (msg as { id: string }).id, user.email, now);
      }
      db.prepare('UPDATE chat_messages SET is_read = 1 WHERE conversation_id = ? AND sender_email != ? AND is_read = 0')
        .run(id, user.email);
    }

    const unreadMap: Record<string, number> = typeof conv.unread_map === 'string'
      ? JSON.parse(conv.unread_map || '{}')
      : (conv.unread_map ?? {}) as Record<string, number>;
    unreadMap[user.email] = 0;
    db.prepare('UPDATE conversations SET unread_map = ? WHERE id = ?')
      .run(JSON.stringify(unreadMap), id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
