import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

const GROUP_META_EMAIL = '__GROUP__';

export async function GET(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    const db = getDb();
    let conversations;
    if (status) {
      conversations = db.prepare(`
        SELECT * FROM conversations
        WHERE participant_ids LIKE ? AND status = ?
        ORDER BY created_at DESC
      `).all(`%"${payload.email}"%`, status);
    } else {
      conversations = db.prepare(`
        SELECT * FROM conversations
        WHERE participant_ids LIKE ? AND (hidden_map IS NULL OR hidden_map NOT LIKE ?)
        ORDER BY last_message_at DESC
      `).all(`%"${payload.email}"%`, `%"${payload.email}":true%`);
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
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
    const { type, groupName, participants, participantEmail, otherEmail, otherName, otherInitials } = body;

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    if (type === 'group') {
      if (!groupName || !participants || !Array.isArray(participants) || participants.length === 0) {
        return NextResponse.json({ error: 'Group name and participants required' }, { status: 400 });
      }

      const id = crypto.randomUUID();
      const typedParticipants = participants as { email: string; name?: string; initials?: string }[];
      const allEmails = [payload.email, ...typedParticipants.map((p) => p.email.toLowerCase())];
      const participantIds = JSON.stringify(allEmails);
      const unreadMapObj: Record<string, number> = {};
      allEmails.forEach((e) => { unreadMapObj[e] = 0; });
      const unreadMap = JSON.stringify(unreadMapObj);
      const meta = [
        { email: GROUP_META_EMAIL, name: groupName, initials: groupName.slice(0, 2).toUpperCase() },
        { email: payload.email, name: payload.name, initials: payload.initials },
        ...typedParticipants.map((p) => ({
          email: p.email.toLowerCase(),
          name: p.name || p.email.split('@')[0],
          initials: p.initials || p.email.slice(0, 2).toUpperCase(),
        })),
      ];

      db.prepare(`
        INSERT INTO conversations (id, participant_ids, status, requested_by, created_at, last_message_at, unread_map, hidden_map, participant_meta)
        VALUES (?, ?, 'active', ?, ?, ?, ?, '{}', ?)
      `).run(id, participantIds, payload.email, now, now, unreadMap, JSON.stringify(meta));

      for (const email of allEmails) {
        emitToUser(email, WS_EVENTS.CONVERSATION_CREATED, { id, participant_ids: allEmails });
      }

      return NextResponse.json({ conversationId: id }, { status: 201 });
    }

    // 1-on-1 conversation
    const targetEmail = (participantEmail || otherEmail)?.toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: 'Participant email required' }, { status: 400 });
    }

    if (targetEmail === payload.email) {
      return NextResponse.json({ error: 'Cannot create conversation with yourself' }, { status: 400 });
    }

    // Check if active conversation already exists
    const existing = db.prepare(`
      SELECT id FROM conversations
      WHERE participant_ids LIKE ? AND participant_ids LIKE ? AND status = 'active'
    `).get(`%"${targetEmail}"%`, `%"${payload.email}"%`);

    if (existing) {
      return NextResponse.json({ conversationId: (existing as { id: string }).id });
    }

    // Check if pending request already exists
    const existingPending = db.prepare(`
      SELECT id FROM conversations
      WHERE participant_ids LIKE ? AND participant_ids LIKE ? AND status = 'pending'
    `).get(`%"${targetEmail}"%`, `%"${payload.email}"%`);

    if (existingPending) {
      return NextResponse.json({ conversationId: (existingPending as { id: string }).id, status: 'pending' });
    }

    const id = crypto.randomUUID();
    const participantIds = JSON.stringify([payload.email, targetEmail]);
    const unreadMap = JSON.stringify({ [payload.email]: 0, [targetEmail]: 0 });
    const meta = [
      { email: payload.email, name: payload.name, initials: payload.initials },
      {
        email: targetEmail,
        name: otherName || targetEmail.split('@')[0],
        initials: otherInitials || targetEmail.slice(0, 2).toUpperCase(),
      },
    ];

    // Create as pending - receiver must accept
    db.prepare(`
      INSERT INTO conversations (id, participant_ids, status, requested_by, created_at, last_message_at, unread_map, hidden_map, participant_meta)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, '{}', ?)
    `).run(id, participantIds, payload.email, now, now, unreadMap, JSON.stringify(meta));

    // Notify only the sender initially; recipient gets notification via notification system
    emitToUser(payload.email, WS_EVENTS.CONVERSATION_CREATED, { id, participant_ids: [payload.email, targetEmail], status: 'pending' });
    emitToUser(targetEmail, WS_EVENTS.CONVERSATION_CREATED, { id, participant_ids: [payload.email, targetEmail], status: 'pending' });

    // Create notification for recipient
    const notifId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, message, conversation_id, actor_email, actor_name, created_at)
       VALUES (?, ?, 'message_request', ?, ?, ?, ?, ?)`
    ).run(notifId, targetEmail, `${payload.name} wants to message you`, id, payload.email, payload.name, now);
    emitToUser(targetEmail, WS_EVENTS.NOTIFICATION_CREATED, {
      id: notifId, recipient_email: targetEmail, type: 'message_request',
      message: `${payload.name} wants to message you`, conversation_id: id,
      actor_email: payload.email, actor_name: payload.name, created_at: now, read: 0,
    });

    return NextResponse.json({ conversationId: id, status: 'pending' }, { status: 201 });
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
