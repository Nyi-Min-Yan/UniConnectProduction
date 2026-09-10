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
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    return NextResponse.json({ data: post });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing post id' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { content?: string; status?: string; moderationNote?: string };

    const db = getDb();
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.content !== undefined) {
      const text = String(body.content).trim();
      if (!text) return NextResponse.json({ error: 'Empty content' }, { status: 400 });
      if (post.author_email !== user.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (post.content === text) {
        return NextResponse.json({ ok: true, unchanged: true });
      }
      updates.push('content = ?');
      values.push(text);
    }

    if (body.status !== undefined || body.moderationNote !== undefined) {
      if (user.role !== 'admin' && user.role !== 'student-affair') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (body.status !== undefined) {
        updates.push('status = ?');
        values.push(body.status);
        updates.push('moderated_at = unixepoch()');
      }
      if (body.moderationNote !== undefined) {
        updates.push('moderation_note = ?');
        values.push(body.moderationNote);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    updates.push('updated_at = unixepoch()');
    values.push(id);

    db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updatedPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    broadcast(WS_EVENTS.POST_UPDATED, updatedPost);

    if (post.author_email && body.status !== undefined) {
      const message =
        body.status === 'approved'
          ? 'Your post was approved and published'
          : `Your post was rejected${body.moderationNote ? `: ${body.moderationNote}` : ''}`;
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, post_id, created_at)
         VALUES (?, ?, 'moderation', ?, ?, unixepoch())`
      ).run(crypto.randomUUID(), post.author_email, message, id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing post id' }, { status: 400 });

    const db = getDb();
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    if (post.author_email !== user.email && user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('DELETE FROM posts WHERE id = ?').run(id);

    broadcast(WS_EVENTS.POST_DELETED, { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
