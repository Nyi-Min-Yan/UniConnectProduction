import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const RETENTION_SECONDS = 3 * 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const result = db.prepare(
      `DELETE FROM notifications
       WHERE (recipient_email = ? OR (recipient_email IS NULL AND recipient_role = ?))
         AND created_at < unixepoch() - ?`
    ).run(user.email, user.role, RETENTION_SECONDS);

    return NextResponse.json({ ok: true, deleted: result.changes });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
