import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing activity id' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      recipients?: { email?: string; name?: string; initials?: string }[];
    };
    const recipients = (body.recipients ?? [])
      .map((r) => ({
        email: (r.email ?? '').trim().toLowerCase(),
        name: (r.name ?? '').trim() || (r.email ?? '').split('@')[0],
        initials: (r.initials ?? '').trim() || (r.email ?? '').slice(0, 2).toUpperCase(),
      }))
      .filter((r) => r.email && r.email !== user.email);
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients provided' }, { status: 400 });
    }

    const db = getDb();
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

    const shareId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO activity_shares (id, activity_id, sharer_email, sharer_name, recipients, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(shareId, id, user.email, user.name, JSON.stringify(recipients.map(r => r.email)), now);

    db.prepare(
      'UPDATE activities SET shares_count = shares_count + ? WHERE id = ?'
    ).run(recipients.length, id);

    const convIds: string[] = [];
    const preview = `Shared an activity: ${(String(activity.caption ?? '')).slice(0, 100)}`;

    for (const r of recipients) {
      const participantIds = [user.email, r.email].sort();
      const participantIdsJson = JSON.stringify(participantIds);
      const participantMeta = JSON.stringify([
        { email: user.email, name: user.name, initials: user.initials },
        { email: r.email, name: r.name, initials: r.initials },
      ]);

      const existing = db
        .prepare('SELECT * FROM conversations WHERE participant_ids = ? AND status = ?')
        .get(participantIdsJson, 'active') as Record<string, unknown> | undefined;

      let convId: string | null = null;

      if (existing) {
        convId = existing.id as string;
        db.prepare(
          'UPDATE conversations SET requested_by = ?, participant_meta = ?, last_message_at = ? WHERE id = ?'
        ).run(user.email, participantMeta, now, convId);
      } else {
        convId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO conversations (id, participant_ids, status, requested_by, participant_meta, last_message_at, preview)
           VALUES (?, ?, 'active', ?, ?, ?, ?)`
        ).run(convId, participantIdsJson, user.email, participantMeta, now, preview);
      }

      if (!convId) continue;
      convIds.push(convId);

      const msgId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO chat_messages (id, conversation_id, sender_email, sender_name, content, created_at, is_read)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      ).run(msgId, convId, user.email, user.name, String(activity.caption ?? ''), now);

      const unreadMap: Record<string, number> = {};
      unreadMap[r.email] = 1;
      db.prepare(
        'UPDATE conversations SET last_message_at = ?, preview = ?, unread_map = ? WHERE id = ?'
      ).run(now, preview, JSON.stringify(unreadMap), convId);
    }

    for (const r of recipients) {
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, actor_email, actor_name, activity_id, created_at)
         VALUES (?, ?, 'share', ?, ?, ?, ?, ?)`
      ).run(notifId, r.email, `${user.name} shared an activity with you`, user.email, user.name, id, now);
    }

    broadcast(WS_EVENTS.ACTIVITY_SHARE, { activity_id: id, sharer_email: user.email, sharer_name: user.name, recipients: recipients.map(r => r.email), created_at: now });
    return NextResponse.json({ id: shareId, conversations: convIds }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
