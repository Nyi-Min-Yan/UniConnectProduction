import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { emitToUser, broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';
import { moderateContent, type ModerationType } from '@/utils/moderate';

const HASHTAG_TAGS: Record<string, { label: string; color: string; emoji: string }> = {
  lostfound: { label: 'Lost & Found', color: 'badge-warning', emoji: '🔍' },
  announcement: { label: 'Announcement', color: 'badge-info', emoji: '📢' },
  event: { label: 'Event', color: 'badge-success', emoji: '🎉' },
  general: { label: 'General', color: 'badge-ghost', emoji: '💬' },
};

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => '\\' + c);
}

export async function GET(request: Request) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20') || 20));
    const offset = Math.max(0, Number(searchParams.get('offset') || '0') || 0);
    const authorEmail = searchParams.get('author');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');

    let query = 'SELECT * FROM posts';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    } else {
      conditions.push('status = ?');
      params.push('approved');
    }

    if (authorEmail) {
      conditions.push('author_email = ?');
      params.push(authorEmail);
    }

    if (tag) {
      const norm = tag.trim().replace(/^#/, '').toLowerCase();
      let labelKey = norm;
      for (const [alias, canonical] of Object.entries(HASHTAG_TAGS)) {
        if (norm === alias) {
          labelKey = canonical.label.toLowerCase();
          break;
        }
      }
      conditions.push("(content LIKE '%#' || ? || '%' ESCAPE '\\' OR LOWER(tags) LIKE ? ESCAPE '\\')");
      params.push(escapeLike(norm), `%"label":"${escapeLike(labelKey)}"%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const posts = db.prepare(query).all(...params);
    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Get posts error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      content?: string;
      image?: string | null;
      images?: string[];
      videoUrl?: string | null;
      video_url?: string | null;
      videoFrame?: string | null;
      tags?: unknown;
      item_status?: unknown;
      item_location?: unknown;
    } | null;
    const content = (body?.content ?? '').trim();
    if (!body ||
        (!content && !body.image && (body.images?.length ?? 0) === 0 && !body.videoUrl && !body.video_url)) {
      return NextResponse.json({ message: 'Write something or add a photo or video first' }, { status: 400 });
    }

    const rawVideoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : typeof body.video_url === 'string' ? body.video_url : null;
    const videoUrl =
      rawVideoUrl && rawVideoUrl.trim().startsWith('https://') || (rawVideoUrl?.trim().startsWith('/api/files/'))
        ? rawVideoUrl.trim().slice(0, 2048)
        : null;
    if (videoUrl && (body.image || (body.images?.length ?? 0) > 0)) {
      return NextResponse.json({ message: 'A post can have either a photo or a video, not both' }, { status: 400 });
    }

    const item_status = body.item_status === 'lost' || body.item_status === 'found' ? body.item_status : null;
    const item_location =
      typeof body.item_location === 'string' && body.item_location.trim()
        ? body.item_location.trim().slice(0, 60)
        : null;

    // Reject oversized images before they reach the DB: every approved post's
    // image is re-downloaded by every feed reader, so a single multi-MB image
    // makes the whole feed slow and trips client timeouts.
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    const MAX_IMAGES = 6;
    const isValidImage = (v: unknown): v is string =>
      typeof v === 'string' && v.startsWith('data:image/');
    const storedImages = (Array.isArray(body.images) ? body.images : []).filter(isValidImage);
    const allImages = storedImages
      .concat(typeof body.image === 'string' && body.image.startsWith('data:image/') ? [body.image] : [])
      .slice(0, MAX_IMAGES);
    if ((body.images?.length ?? 0) > 0 && storedImages.length !== body.images!.length) {
      return NextResponse.json({ message: 'One or more images are not valid image files' }, { status: 400 });
    }
    if (allImages.length > MAX_IMAGES) {
      return NextResponse.json({ message: 'A post can include up to 6 photos' }, { status: 400 });
    }
    for (const img of allImages) {
      const base64 = img.slice(img.indexOf(',') + 1);
      if (base64.length > (MAX_IMAGE_BYTES * 4) / 3 + 8) {
        return NextResponse.json(
          { message: 'Image is too large — please use an image under 2 MB' },
          { status: 400 }
        );
      }
    }
    const firstImage = body.image && body.image.startsWith('data:image/')
      ? body.image
      : storedImages.length > 0
        ? storedImages[0]
        : null;

    const normalizeTag = (s: string) => s.replace(/^#/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const tags = Array.isArray(body.tags) ? (body.tags as { label?: string }[]) : [];
    const tagLabels = new Set(tags.map((t) => normalizeTag(t.label ?? '')));
    for (const match of content.matchAll(/#[\w&]+/gi)) {
      const key = normalizeTag(match[0]);
      const canon = HASHTAG_TAGS[key === 'lostandfound' ? 'lostfound' : key];
      if (canon && !tagLabels.has(normalizeTag(canon.label))) {
        tags.push(canon);
        tagLabels.add(normalizeTag(canon.label));
      }
    }

    // Event and Announcement tags are reserved for official roles. This strips
    // the tags server-side too so a crafted request can't bypass the rule.
    const RESTRICTED_TAGS = new Set(['event', 'announcement']);
    const isOfficialRole = payload.role === 'admin' || payload.role === 'student-affair';
    if (!isOfficialRole) {
      for (let i = tags.length - 1; i >= 0; i -= 1) {
        if (RESTRICTED_TAGS.has(normalizeTag(tags[i].label ?? ''))) tags.splice(i, 1);
      }
    }

    const hasLostFound = tagLabels.has('lostfound');
    const moderationPolicy: 'auto' | 'review' = hasLostFound ? 'review' : 'auto';

    const now = Math.floor(Date.now() / 1000);

    // Pick the AI model group by media type: text post -> text models, photo
    // post -> image models, video post -> video models (frame + caption).
    const moderationType: ModerationType = videoUrl ? 'video' : firstImage ? 'image' : 'text';
    // Client-extracted frame (JPEG data URL) used ONLY for video moderation.
    const videoFrame =
      typeof body.videoFrame === 'string' && body.videoFrame.startsWith('data:') ? body.videoFrame : null;

    // AI content filter runs BEFORE the post is stored (filter before upload).
    // Flagged content is never uploaded to the feed.
    const moderate = await moderateContent(content, videoUrl ? videoFrame : firstImage ?? null, moderationType);
    if (!moderate.safe) {
      return NextResponse.json(
        { message: `Your post was flagged by the AI content filter${moderate.reason ? `: ${moderate.reason}` : ''}` },
        { status: 422 }
      );
    }

    const status = moderationPolicy === 'review' ? 'pending_review' : 'approved';

    const db = getDb();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO posts (id, author_email, author_name, author_initials, author_role, content, image, images, video_url, tags, status, ai_flags, moderation_note, created_at, updated_at, likes_count, comments_count, shares_count, item_status, item_location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, payload.email, payload.name, payload.initials, payload.role,
      content || null, videoUrl ? null : (firstImage ?? null),
      allImages.length > 0 ? JSON.stringify(allImages) : null, videoUrl,
      JSON.stringify(tags || []), status, null, null, now, now, 0, 0, 0,
      item_status || null, item_location || null
    );

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

    if (status === 'pending_review') {
      // Lost & Found posts need a human decision from admin or student affairs.
      const message = `New Lost & Found post by ${payload.name} is awaiting moderation`;
      for (const recipientRole of ['admin', 'student-affair']) {
        const notificationId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO notifications (id, recipient_role, type, message, read, created_at, post_id, actor_email, actor_name)
           VALUES (?, ?, 'moderation', ?, 0, ?, ?, ?, ?)`
        ).run(notificationId, recipientRole, message, now, id, payload.email, payload.name);
        broadcast(WS_EVENTS.NOTIFICATION_CREATED, {
          id: notificationId,
          recipient_email: null,
          recipient_role: recipientRole,
          type: 'moderation',
          message,
          read: 0,
          created_at: now,
          post_id: id,
          actor_email: payload.email,
          actor_name: payload.name,
        });
      }
    } else {
      broadcast(WS_EVENTS.POST_CREATED, post);
    }

    return NextResponse.json({ post, status }, { status: 201 });
  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}