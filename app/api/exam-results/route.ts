import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { broadcast } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

export async function GET(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch_id');

    let query: string;
    let params: (string | number)[];

    if (payload.role === 'admin' || payload.role === 'student-affair' || payload.role === 'student_affairs') {
      if (batchId) {
        query = 'SELECT er.*, b.exam_type AS exam_type FROM exam_results er LEFT JOIN exam_result_batches b ON b.id = er.batch_id WHERE er.batch_id = ? ORDER BY er.created_at DESC';
        params = [batchId];
      } else {
        query = 'SELECT er.*, b.exam_type AS exam_type FROM exam_results er LEFT JOIN exam_result_batches b ON b.id = er.batch_id ORDER BY er.created_at DESC LIMIT 100';
        params = [];
      }
    } else {
      query = 'SELECT er.*, b.exam_type AS exam_type FROM exam_results er LEFT JOIN exam_result_batches b ON b.id = er.batch_id WHERE er.recipient_email = ? ORDER BY er.created_at DESC';
      params = [payload.email];
    }

    const results = db.prepare(query).all(...params);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Get exam results error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = authenticateRequest(request);
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { recipientEmail, rollNumber, year, semester, fileName, fileUrl, storagePath, batchId, studentName, studentId } = body;

    const db = getDb();
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO exam_results (id, user_id, recipient_email, roll_number, year, semester, file_name, file_url, storage_path, created_at, batch_id, student_name, student_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, null, recipientEmail, rollNumber, year, semester, fileName, fileUrl, storagePath, now, batchId || null, studentName || null, studentId || null);

    broadcast(WS_EVENTS.EXAM_RESULT_CREATED, { id, recipient_email: recipientEmail, roll_number: rollNumber, year, semester, file_name: fileName, batch_id: batchId, created_at: now });
    return NextResponse.json({ resultId: id }, { status: 201 });
  } catch (error) {
    console.error('Create exam result error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
