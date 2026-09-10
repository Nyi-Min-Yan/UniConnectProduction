import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const db = getDb();
    const batches = db.prepare('SELECT * FROM exam_result_batches ORDER BY created_at DESC').all();
    return NextResponse.json({ batches });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
