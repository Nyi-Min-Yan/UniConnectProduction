import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
    const before = url.searchParams.get('before');

    const db = getDb();
    const conversation = db.prepare('SELECT participant_ids, status FROM conversations WHERE id = ?').get(conversationId) as { participant_ids: string; status: string } | undefined;
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const participantIds = JSON.parse(conversation.participant_ids);
    if (!participantIds.includes(payload.email)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    if (conversation.status !== 'active') {
      return NextResponse.json({ messages: [] });
    }

    let messages;
    if (before) {
      messages = db.prepare(
        'SELECT * FROM chat_messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
      ).all(conversationId, parseInt(before, 10), limit);
      messages = ([...messages] as unknown[]).reverse();
    } else {
      messages = db.prepare(
        'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(conversationId, limit);
      messages = ([...messages] as unknown[]).reverse();
    }
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
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

    const { id: conversationId } = await params;
    const body = await request.json();
    const { content, recipientEmail, messageType, fileUrl, fileName, attachments, mentions } = body;

    if (!content && !fileUrl && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: 'Content or file required' }, { status: 400 });
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const conversation = db.prepare('SELECT participant_ids, status FROM conversations WHERE id = ?').get(conversationId) as { participant_ids: string; status: string } | undefined;
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.status !== 'active') {
      return NextResponse.json({ error: 'Message request not accepted yet' }, { status: 403 });
    }

    const participantIds: string[] = JSON.parse(conversation.participant_ids);
    const recipientId = participantIds.find(e => e !== payload.email) || recipientEmail;

    const attachmentsJson = attachments ? JSON.stringify(attachments) : null;
    const mentionsJson = mentions ? JSON.stringify(mentions) : null;

    db.prepare(`
      INSERT INTO chat_messages (id, conversation_id, sender_id, recipient_id, recipient_email, sender_email, sender_name, content, attachments, mentions, message_type, file_url, file_name, created_at, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, conversationId, payload.email, recipientId, recipientEmail || recipientId, payload.email, payload.name, content || '', attachmentsJson, mentionsJson, messageType || 'text', fileUrl || null, fileName || null, now);

    const preview = content?.slice(0, 50) || fileName || 'Attachment';
    db.prepare('UPDATE conversations SET last_message_at = ?, preview = ? WHERE id = ?').run(now, preview, conversationId);

    // Bump unread count for all other participants
    const convRow = db.prepare('SELECT unread_map FROM conversations WHERE id = ?').get(conversationId) as { unread_map: string } | undefined;
    const unreadMap: Record<string, number> = convRow?.unread_map ? JSON.parse(convRow.unread_map) : {};
    for (const pid of participantIds) {
      if (pid !== payload.email) unreadMap[pid] = (unreadMap[pid] ?? 0) + 1;
    }
    db.prepare('UPDATE conversations SET unread_map = ? WHERE id = ?').run(JSON.stringify(unreadMap), conversationId);

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<string, unknown>;

    // Emit realtime event to all participants
    for (const pid of participantIds) {
      emitToUser(pid, WS_EVENTS.MESSAGE_CREATED, message);
    }

    // Create notification for recipients
    for (const pid of participantIds) {
      if (pid === payload.email) continue;
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, conversation_id, actor_email, actor_name, created_at)
         VALUES (?, ?, 'message', ?, ?, ?, ?, ?)`
      ).run(notifId, pid, `${payload.name} sent you a message`, conversationId, payload.email, payload.name, now);
      emitToUser(pid, WS_EVENTS.NOTIFICATION_CREATED, {
        id: notifId, recipient_email: pid, type: 'message',
        message: `${payload.name} sent you a message`, conversation_id: conversationId,
        actor_email: payload.email, actor_name: payload.name, created_at: now, read: 0,
      });
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Create message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id: conversationId } = await params;

    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
    if (!participantIds.includes(user.email)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    // Mark messages as read
    const unread = db.prepare('SELECT id FROM chat_messages WHERE conversation_id = ? AND sender_email != ? AND is_read = 0')
      .all(conversationId, user.email) as { id: string }[];
    db.prepare('UPDATE chat_messages SET is_read = 1 WHERE conversation_id = ? AND sender_email != ? AND is_read = 0')
      .run(conversationId, user.email);

    // Update unread map
    const unreadMap: Record<string, number> = typeof conv.unread_map === 'string'
      ? JSON.parse(conv.unread_map || '{}')
      : (conv.unread_map ?? {}) as Record<string, number>;
    unreadMap[user.email] = 0;
    db.prepare('UPDATE conversations SET unread_map = ? WHERE id = ?')
      .run(JSON.stringify(unreadMap), conversationId);

    // Notify other participants that messages were read
    if (unread.length > 0) {
      for (const pid of participantIds) {
        if (pid !== user.email) {
          emitToUser(pid, WS_EVENTS.MESSAGE_READ, {
            conversation_id: conversationId,
            reader_email: user.email,
            message_ids: unread.map((m) => m.id),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Mark messages read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
