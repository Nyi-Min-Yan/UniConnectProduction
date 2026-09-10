import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const db = getDb();

    const likes = db
      .prepare(
        'SELECT user_email, created_at FROM post_likes WHERE post_id = ? ORDER BY created_at DESC LIMIT 200'
      )
      .all(postId);

    return NextResponse.json({ likes });
  } catch (error) {
    console.error('Get post likes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
