import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { saveFile } from '@/lib/storage';

const MAX_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 8;

const ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'txt', 'csv', 'zip',
]);

interface ChatAttachment {
  name: string;
  size: number;
  mime: string;
  path: string;
  url: string;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'file';
}

function getParticipantConv(db: ReturnType<typeof getDb>, id: string, email: string) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!conv) return { conv: null, error: 'Conversation not found' };
  const participantIds = JSON.parse(String(conv.participant_ids ?? '[]')) as string[];
  if (!participantIds.includes(email)) {
    return { conv: null, error: 'Not a participant' };
  }
  return { conv, error: null };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const { conv, error: pErr } = getParticipantConv(db, id, user.email);
    if (!conv) return NextResponse.json({ error: pErr }, { status: 403 });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    }
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'No files selected' }, { status: 400 });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at once` }, { status: 400 });
    }

    for (const file of files) {
      if (file.size === 0) return NextResponse.json({ error: `${file.name} is empty` }, { status: 400 });
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `${file.name} exceeds the ${MAX_SIZE / 1024 / 1024}MB limit` }, { status: 413 });
      }
      if (!ALLOWED_EXT.has(extOf(file.name))) {
        return NextResponse.json({ error: `${file.name}: unsupported file type` }, { status: 415 });
      }
    }

    const uploaded: ChatAttachment[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = sanitizeName(file.name);
      const result = await saveFile('chat', safeName, buffer);
      uploaded.push({
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        path: result.filePath,
        url: result.publicUrl,
      });
    }

    return NextResponse.json({ attachments: uploaded }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;

    const db = getDb();
    const { conv, error: pErr } = getParticipantConv(db, id, user.email);
    if (!conv) return NextResponse.json({ error: pErr }, { status: 403 });

    let paths: string[] = [];
    try {
      paths = JSON.parse(new URL(request.url).searchParams.get('paths') ?? '[]') as string[];
    } catch {
      return NextResponse.json({ error: 'Invalid paths' }, { status: 400 });
    }
    if (paths.length === 0) return NextResponse.json({ urls: {} });
    if (paths.some((p) => typeof p !== 'string')) {
      return NextResponse.json({ error: 'Invalid attachment path' }, { status: 400 });
    }

    const urls: Record<string, { url: string; downloadUrl: string }> = {};
    for (const p of paths) {
      const url = `/api/files/${encodeURIComponent(p)}`;
      urls[p] = { url, downloadUrl: url };
    }
    return NextResponse.json({ urls });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
