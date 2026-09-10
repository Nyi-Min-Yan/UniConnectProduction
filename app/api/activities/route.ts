import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { saveFile } from '@/lib/storage';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const activities = db.prepare('SELECT * FROM activities ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    return NextResponse.json({ activities });
  } catch (error) {
    console.error('Get activities error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let kind = 'photo';
    let caption: string | null = null;
    let media_url: string | null = null;
    let media_urls: string[] | null = null;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      kind = (formData.get('kind') as string) || 'photo';
      caption = (formData.get('caption') as string) || null;
      const single = formData.get('file') as File | null;
      const multiple = formData.getAll('files') as File[];
      const files = (multiple.length > 0 ? multiple : single && single.size > 0 ? [single] : []).filter(
        (f) => f.size > 0
      );
      if (files.length > 0) {
        const urls: string[] = [];
        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const { publicUrl } = await saveFile('activities', file.name, buffer);
          urls.push(publicUrl);
        }
        media_url = urls[0];
        media_urls = urls.length > 1 ? urls : null;
      }
    } else {
      const body = await request.json();
      kind = body.kind || 'photo';
      caption = body.caption || null;
      media_url = body.media_url || null;
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO activities (id, author_email, author_name, author_initials, author_role, kind, caption, media_url, media_urls, created_at, likes_count, comments_count, shares_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, payload.email, payload.name, payload.initials, payload.role, kind || 'photo', caption || null, media_url || null, media_urls ? JSON.stringify(media_urls) : null, now, 0, 0, 0);

    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
    broadcast(WS_EVENTS.ACTIVITY_CREATED, activity);
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error('Create activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
