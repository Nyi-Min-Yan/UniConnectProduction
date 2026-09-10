import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const postId = new URL(request.url).searchParams.get('post_id') || id;

    const db = getDb();
    const comments = db
      .prepare('SELECT * FROM post_comments WHERE post_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
      .all(postId);

    return NextResponse.json({ data: comments });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing comment id' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { content?: string };
    const text = (body.content ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Empty comment' }, { status: 400 });

    const db = getDb();
    const comment = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    if (comment.author_email !== user.email && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('UPDATE post_comments SET content = ?, updated_at = unixepoch() WHERE id = ?').run(text, id);

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
    if (!id) return NextResponse.json({ error: 'Missing comment id' }, { status: 400 });

    const db = getDb();
    const comment = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    if (comment.author_email !== user.email && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('UPDATE post_comments SET deleted_at = unixepoch() WHERE id = ?').run(id);

    db.prepare(
      'UPDATE posts SET comments_count = MAX(comments_count - 1, 0) WHERE id = ?'
    ).run(comment.post_id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
