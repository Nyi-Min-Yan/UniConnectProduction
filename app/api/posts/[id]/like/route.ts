import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast, emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const db = getDb();
    const likes = db.prepare('SELECT post_id, user_email, created_at FROM post_likes WHERE post_id = ? ORDER BY created_at DESC').all(postId);
    return NextResponse.json(likes);
  } catch (error) {
    console.error('Get likes error:', error);
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

    const { id: postId } = await params;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    const existing = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_email = ?').get(postId, payload.email);
    if (existing) {
      return NextResponse.json({ error: 'Already liked' }, { status: 400 });
    }

    const likeId = crypto.randomUUID();
    db.prepare('INSERT INTO post_likes (id, post_id, user_email, created_at) VALUES (?, ?, ?, ?)').run(likeId, postId, payload.email, now);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);

    const countRow = db.prepare('SELECT likes_count FROM posts WHERE id = ?').get(postId) as { likes_count: number } | undefined;
    const likes = countRow?.likes_count ?? 0;

    const likeRow = { id: likeId, post_id: postId, user_email: payload.email, created_at: now };
    broadcast(WS_EVENTS.POST_LIKE, likeRow);

    // Notify post author
    const post = db.prepare('SELECT author_email FROM posts WHERE id = ?').get(postId) as { author_email: string } | undefined;
    if (post && post.author_email !== payload.email) {
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, post_id, actor_email, actor_name, created_at)
         VALUES (?, ?, 'like', ?, ?, ?, ?, ?)`
      ).run(notifId, post.author_email, `${payload.name} liked your post`, postId, payload.email, payload.name, now);
      emitToUser(post.author_email, WS_EVENTS.NOTIFICATION_CREATED, {
        id: notifId, recipient_email: post.author_email, type: 'like',
        message: `${payload.name} liked your post`, post_id: postId,
        actor_email: payload.email, actor_name: payload.name, created_at: now, read: 0,
      });
    }

    return NextResponse.json({ success: true, liked: true, likes });
  } catch (error) {
    console.error('Like post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: postId } = await params;
    const db = getDb();

    const result = db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_email = ?').run(postId, payload.email);
    if (result.changes > 0) {
      db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(postId);
      broadcast(WS_EVENTS.POST_UNLIKE, { post_id: postId, user_email: payload.email });
    }

    const countRow = db.prepare('SELECT likes_count FROM posts WHERE id = ?').get(postId) as { likes_count: number } | undefined;

    return NextResponse.json({ success: true, liked: false, likes: countRow?.likes_count ?? 0 });
  } catch (error) {
    console.error('Unlike post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
