import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

const GROUP_META_EMAIL = '__GROUP__';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    return NextResponse.json({ data: conv });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      name?: string;
      email?: string;
      participants?: { email: string; name: string; initials?: string }[];
    };
    const { action } = body;

    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
    const rawMeta = JSON.parse(String(conv.participant_meta ?? '[]'));
    const meta = Array.isArray(rawMeta) ? rawMeta : [];
    const isParticipant = participantIds.includes(user.email);
    if (!isParticipant) return NextResponse.json({ error: 'Not a participant' }, { status: 403 });

    const meIsRequester = conv.requested_by === user.email;

    const isGroup = participantIds.length > 2 || meta.some((m: { email?: string }) => m.email === GROUP_META_EMAIL);
    const creatorEmail = conv.requested_by
      ? conv.requested_by
      : (() => {
          const gi = meta.findIndex((m: { email?: string }) => m.email === GROUP_META_EMAIL);
          return gi >= 0 ? meta[gi + 1]?.email : '';
        })();
    const isCreator = user.email === creatorEmail;

    if (action === 'rename') {
      if (!isGroup) return NextResponse.json({ error: 'Not a group conversation' }, { status: 400 });
      if (!isCreator) return NextResponse.json({ error: 'Only the group creator can rename this group' }, { status: 403 });
      const name = (body.name ?? '').trim();
      if (!name) return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
      const newMeta = meta.map((m: Record<string, unknown>) =>
        m.email === GROUP_META_EMAIL ? { ...m, name, initials: name.slice(0, 2).toUpperCase() } : m
      );
      db.prepare('UPDATE conversations SET participant_meta = ? WHERE id = ?').run(JSON.stringify(newMeta), id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'addMembers') {
      if (!isGroup) return NextResponse.json({ error: 'Not a group conversation' }, { status: 400 });
      if (!isCreator) return NextResponse.json({ error: 'Only the group creator can add members' }, { status: 403 });
      const adds = (body.participants ?? [])
        .map((p) => ({ ...p, email: (p.email ?? '').toLowerCase().trim() }))
        .filter((p) => p.email && p.email !== user.email && !participantIds.includes(p.email));
      if (adds.length === 0) return NextResponse.json({ error: 'No new members to add' }, { status: 400 });
      const newParticipantIds = [...participantIds, ...adds.map((a) => a.email)];
      const newMeta = [
        ...meta,
        ...adds.map((a) => ({
          email: a.email,
          name: a.name || a.email.split('@')[0],
          initials: a.initials || a.email.slice(0, 2).toUpperCase(),
        })),
      ];
      db.prepare('UPDATE conversations SET participant_ids = ?, participant_meta = ? WHERE id = ?')
        .run(JSON.stringify(newParticipantIds), JSON.stringify(newMeta), id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'removeMember') {
      if (!isGroup) return NextResponse.json({ error: 'Not a group conversation' }, { status: 400 });
      if (!isCreator) return NextResponse.json({ error: 'Only the group creator can remove members' }, { status: 403 });
      const email = (body.email ?? '').toLowerCase().trim();
      if (!email) return NextResponse.json({ error: 'Member email is required' }, { status: 400 });
      if (email === user.email) return NextResponse.json({ error: 'You cannot remove yourself — delete the group instead' }, { status: 400 });
      if (email === creatorEmail) return NextResponse.json({ error: 'Cannot remove the group creator' }, { status: 400 });
      if (!participantIds.includes(email)) return NextResponse.json({ error: 'Not a group member' }, { status: 400 });
      const newParticipantIds = participantIds.filter((e: string) => e !== email);
      const newMeta = meta.filter((m: { email?: string }) => m.email !== email);
      db.prepare('UPDATE conversations SET participant_ids = ?, participant_meta = ? WHERE id = ?')
        .run(JSON.stringify(newParticipantIds), JSON.stringify(newMeta), id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'accept') {
      if (meIsRequester) return NextResponse.json({ error: "You can't accept your own request" }, { status: 400 });
      db.prepare('UPDATE conversations SET status = ?, requested_by = NULL WHERE id = ?').run('active', id);

      if (conv.requested_by) {
        const notifId = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);
        db.prepare(
          `INSERT INTO notifications (id, recipient_email, type, message, conversation_id, actor_email, actor_name, created_at)
           VALUES (?, ?, 'message', ?, ?, ?, ?, ?)`
        ).run(notifId, conv.requested_by, `${user.name} accepted your message request`, id, user.email, user.name, now);
        const requesterEmail = String(conv.requested_by);
        if (requesterEmail) {
          emitToUser(requesterEmail, WS_EVENTS.CONVERSATION_UPDATED, { conversationId: id, status: 'active' });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'reject') {
      if (meIsRequester) return NextResponse.json({ error: "You can't decline your own request" }, { status: 400 });
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
      const requesterEmail = String(conv.requested_by ?? '');
      if (requesterEmail) {
        emitToUser(requesterEmail, WS_EVENTS.CONVERSATION_UPDATED, { conversationId: id, status: 'rejected' });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'block') {
      db.prepare('UPDATE conversations SET status = ?, blocked_by = ? WHERE id = ?').run('blocked', user.email, id);
      const otherEmail = participantIds.find((e: string) => e !== user.email);
      if (otherEmail) {
        emitToUser(otherEmail, WS_EVENTS.CONVERSATION_BLOCKED, { conversationId: id, blockedBy: user.email });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'unblock') {
      const cur = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (cur?.blocked_by !== user.email) {
        return NextResponse.json({ error: 'Only the blocker can unblock' }, { status: 403 });
      }
      db.prepare('UPDATE conversations SET status = ?, blocked_by = NULL WHERE id = ?').run('active', id);
      const otherEmail = participantIds.find((e: string) => e !== user.email);
      if (otherEmail) {
        emitToUser(otherEmail, WS_EVENTS.CONVERSATION_UNBLOCKED, { conversationId: id, unblockedBy: user.email });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'hide' || action === 'unhide') {
      const hiddenMap: Record<string, number> = typeof conv.hidden_map === 'string'
        ? JSON.parse(conv.hidden_map || '{}')
        : (conv.hidden_map ?? {}) as Record<string, number>;
      if (action === 'hide') hiddenMap[user.email] = Math.floor(Date.now() / 1000);
      else delete hiddenMap[user.email];
      db.prepare('UPDATE conversations SET hidden_map = ? WHERE id = ?').run(JSON.stringify(hiddenMap), id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'leave') {
      if (!isGroup) return NextResponse.json({ error: 'Not a group conversation' }, { status: 400 });
      if (isCreator) {
        return NextResponse.json({ error: 'The group creator cannot leave — delete the group instead' }, { status: 400 });
      }
      const newParticipantIds = participantIds.filter((e: string) => e !== user.email);
      const newMeta = meta.filter((m: { email?: string }) => m.email !== user.email);
      if (newParticipantIds.length === 0) {
        db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
        return NextResponse.json({ ok: true });
      }
      db.prepare('UPDATE conversations SET participant_ids = ?, participant_meta = ? WHERE id = ?')
        .run(JSON.stringify(newParticipantIds), JSON.stringify(newMeta), id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
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
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
    const rawMeta = JSON.parse(String(conv.participant_meta ?? '[]'));
    const meta = Array.isArray(rawMeta) ? rawMeta : [];
    const isGroup = participantIds.length > 2 || meta.some((m: { email?: string }) => m.email === GROUP_META_EMAIL);
    if (!isGroup) return NextResponse.json({ error: 'Only group conversations can be deleted' }, { status: 400 });
    const creatorEmail = conv.requested_by
      ? conv.requested_by
      : (() => {
          const gi = meta.findIndex((m: { email?: string }) => m.email === GROUP_META_EMAIL);
          return gi >= 0 ? meta[gi + 1]?.email : '';
        })();
    if (creatorEmail !== user.email) {
      return NextResponse.json({ error: 'Only the group creator can delete this group' }, { status: 403 });
    }

    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
