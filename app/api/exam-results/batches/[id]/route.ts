import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast, emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(_request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const batch = db.prepare('SELECT * FROM exam_result_batches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    return NextResponse.json({ data: batch });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = body?.action;
    if (action !== 'publish' && action !== 'archive' && action !== 'unarchive') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const db = getDb();
    const batch = db.prepare('SELECT * FROM exam_result_batches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (action === 'publish') {
      if (batch.status !== 'PUBLISHED') {
        db.prepare('UPDATE exam_result_batches SET status = ? WHERE id = ?').run('PUBLISHED', id);

        const results = db.prepare('SELECT * FROM exam_results WHERE batch_id = ?').all(id) as Record<string, unknown>[];
        const notifiedEmails = new Set<string>();
        for (const result of results) {
          const email = result.recipient_email as string;
          if (email && !notifiedEmails.has(email)) {
            notifiedEmails.add(email);
            const notifId = crypto.randomUUID();
            db.prepare(
              `INSERT INTO notifications (id, recipient_email, type, message, actor_email, actor_name, created_at)
               VALUES (?, ?, 'exam-result', ?, ?, ?, unixepoch())`
            ).run(notifId, email, `Your ${batch.exam_type} result for ${batch.semester} is now available`, user.email, user.name);
          }
        }

        return NextResponse.json({ ok: true, notified: notifiedEmails.size });
      }
      broadcast(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, { id, status: 'PUBLISHED' });
      return NextResponse.json({ ok: true });
    }

    if (action === 'archive') {
      if (batch.status !== 'ARCHIVED') {
        db.prepare('UPDATE exam_result_batches SET status = ? WHERE id = ?').run('ARCHIVED', id);
      }
      // Notify students in this batch
      const results = db.prepare('SELECT * FROM exam_results WHERE batch_id = ?').all(id) as Record<string, unknown>[];
      const notifiedEmails = new Set<string>();
      const now = Math.floor(Date.now() / 1000);
      for (const result of results) {
        const email = result.recipient_email as string;
        if (email && !notifiedEmails.has(email)) {
          notifiedEmails.add(email);
          const notifId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO notifications (id, recipient_email, type, message, actor_email, actor_name, created_at)
             VALUES (?, ?, 'exam-result', ?, ?, ?, ?)`
          ).run(notifId, email, `Your ${batch.exam_type} result for ${batch.semester} has been archived`, user.email, user.name, now);
          emitToUser(email, WS_EVENTS.NOTIFICATION_CREATED, {
            id: notifId, recipient_email: email, type: 'exam-result',
            message: `Your ${batch.exam_type} result for ${batch.semester} has been archived`,
            actor_email: user.email, actor_name: user.name, created_at: now, read: 0,
          });
        }
      }
      broadcast(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, { id, status: 'ARCHIVED' });
      return NextResponse.json({ ok: true, notified: notifiedEmails.size });
    }

    if (action === 'unarchive') {
      if (batch.status === 'ARCHIVED') {
        db.prepare('UPDATE exam_result_batches SET status = ? WHERE id = ?').run('PUBLISHED', id);
      }
      // Notify students in this batch
      const results2 = db.prepare('SELECT * FROM exam_results WHERE batch_id = ?').all(id) as Record<string, unknown>[];
      const notifiedEmails2 = new Set<string>();
      const now2 = Math.floor(Date.now() / 1000);
      for (const result of results2) {
        const email = result.recipient_email as string;
        if (email && !notifiedEmails2.has(email)) {
          notifiedEmails2.add(email);
          const notifId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO notifications (id, recipient_email, type, message, actor_email, actor_name, created_at)
             VALUES (?, ?, 'exam-result', ?, ?, ?, ?)`
          ).run(notifId, email, `Your ${batch.exam_type} result for ${batch.semester} is now available`, user.email, user.name, now2);
          emitToUser(email, WS_EVENTS.NOTIFICATION_CREATED, {
            id: notifId, recipient_email: email, type: 'exam-result',
            message: `Your ${batch.exam_type} result for ${batch.semester} is now available`,
            actor_email: user.email, actor_name: user.name, created_at: now2, read: 0,
          });
        }
      }
      broadcast(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, { id, status: 'PUBLISHED' });
      return NextResponse.json({ ok: true, notified: notifiedEmails2.size });
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
    if (user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();

    const batch = db.prepare('SELECT * FROM exam_result_batches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM exam_results WHERE batch_id = ?').run(id);
    db.prepare('DELETE FROM exam_result_batches WHERE id = ?').run(id);

    broadcast(WS_EVENTS.EXAM_RESULT_BATCH_DELETED, { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
