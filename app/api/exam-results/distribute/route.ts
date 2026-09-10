import 'server-only';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { saveFile } from '@/lib/storage';
import { emitToUser } from '@/lib/realtime/io';
import { WS_EVENTS } from '@/lib/realtime/events';

const ROLL_RE = /^(UCSTGO-\d+|USTGO-\d+)$/i;

interface DistributeFile {
  fileName: string;
  rollNo: string;
  base64: string;
  semester?: string;
  studentId?: string;
  studentUserId: string;
  studentEmail: string;
  studentName: string;
}

interface FileResult {
  fileName: string;
  rollNo: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const user = authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'student-affair') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      examType?: string;
      semester?: string;
      academicYear?: string;
      files?: DistributeFile[];
    } | null;

    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    const examType = typeof body.examType === 'string' ? body.examType.trim() : '';
    const semester = typeof body.semester === 'string' ? body.semester.trim() : '';
    const academicYear = typeof body.academicYear === 'string' ? body.academicYear.trim() : '';
    const files = Array.isArray(body.files) ? body.files : [];

    if (!examType) return NextResponse.json({ error: 'Exam type is required' }, { status: 400 });
    if (!semester) return NextResponse.json({ error: 'Semester is required' }, { status: 400 });
    if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    const db = getDb();
    const batchId = crypto.randomUUID();

    db.prepare(
      `INSERT INTO exam_result_batches (id, exam_type, semester, academic_year, total_files, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, unixepoch())`
    ).run(batchId, examType, semester, academicYear || '', files.length, user.email);

    const results: FileResult[] = [];
    let successCount = 0;
    let failCount = 0;
    const successfulResults: Array<{ studentEmail: string; studentName: string; rollNo: string; fileName: string }> = [];

    for (const file of files) {
      const rollNo = file.rollNo || '';
      if (!ROLL_RE.test(rollNo)) {
        results.push({ fileName: file.fileName, rollNo, ok: false, error: 'Invalid roll number format' });
        failCount++;
        continue;
      }

      try {
        const base64Data = file.base64;
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        const safeName = `${rollNo}-${file.fileName}`.replace(/[^\w.\-]/g, '_');
        const result = await saveFile('exam-results', safeName, pdfBuffer);

        const resultId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO exam_results (id, user_id, recipient_email, roll_number, year, semester, file_name, file_url, storage_path, batch_id, student_name, student_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
        ).run(
          resultId,
          file.studentUserId || '',
          file.studentEmail,
          rollNo,
          file.studentId || '',
          semester,
          file.fileName,
          result.publicUrl,
          result.filePath,
          batchId,
          file.studentName || '',
          file.studentId || ''
        );

        results.push({ fileName: file.fileName, rollNo, ok: true });
        successCount++;
        successfulResults.push({
          studentEmail: file.studentEmail,
          studentName: file.studentName || '',
          rollNo,
          fileName: file.fileName,
        });
      } catch (err) {
        results.push({ fileName: file.fileName, rollNo, ok: false, error: err instanceof Error ? err.message : 'Upload failed' });
        failCount++;
      }
    }

    db.prepare(
      `UPDATE exam_result_batches SET status = 'PUBLISHED', total_files = ? WHERE id = ?`
    ).run(files.length, batchId);

    const now = Math.floor(Date.now() / 1000);
    for (const r of successfulResults) {
      const notifId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO notifications (id, recipient_email, type, message, actor_email, actor_name, created_at)
         VALUES (?, ?, 'exam-result', ?, ?, ?, ?)`
      ).run(notifId, r.studentEmail, `Your ${examType} result for ${semester} is now available`, user.email, user.name, now);
      emitToUser(r.studentEmail, WS_EVENTS.NOTIFICATION_CREATED, {
        id: notifId, recipient_email: r.studentEmail, type: 'exam-result',
        message: `Your ${examType} result for ${semester} is now available`,
        actor_email: user.email, actor_name: user.name, created_at: now, read: 0,
      });
    }

    return NextResponse.json({ batchId, results, sent: successfulResults.length }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
