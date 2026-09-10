import { NextRequest, NextResponse } from 'next/server';
import { authorizeExporter, springFetchWithAuth, carryFreshTokens } from '@/lib/export/spring';
import {
  buildAttendanceWorkbook,
  type AttendanceExportData,
  type AttendanceExportSession,
  type AttendanceExportStudent,
} from '@/lib/export/attendance';

export const dynamic = 'force-dynamic';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface TimeSlotLike {
  periodNo: number;
  startTime: string;
  endTime: string;
  displayOrder: number;
}

const minutesOf = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// Minutes to subtract from a server-shifted time to land on the real wall clock
// (P1 starts 09:00, P6 ends 16:00) — identical to timeSlotOffsetMinutes in the
// client so the exported session times match the grids.
function timeOffsetMinutes(slots: TimeSlotLike[]): number {
  if (!Array.isArray(slots) || slots.length === 0) return 0;
  const sorted = [...slots].sort((a, b) => a.displayOrder - b.displayOrder || a.periodNo - b.periodNo);
  const p1 = sorted.find((s) => s.periodNo === 1);
  const p1Start = p1 ? minutesOf(p1.startTime) : null;
  if (p1Start === null) return 0;
  const offset = p1Start - 9 * 60;
  const p6 = sorted.find((s) => s.periodNo === 6);
  const p6End = p6 ? minutesOf(p6.endTime) : null;
  if (p6End !== null && p6End - offset !== 16 * 60) return 0;
  return offset;
}

const shiftTime = (hhmm: string | null | undefined, delta: number): string => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return hhmm ?? '';
  const parts = hhmm.split(':');
  let total = Number(parts[0]) * 60 + Number(parts[1] ?? 0);
  total = (((total - delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

interface RollCallHistoryResponseLike {
  schedule?: {
    courseCode?: string | null;
    courseName?: string | null;
    semesterNo?: number | null;
    sectionNames?: string[];
    slots?: { slotId: string; startTime: string; endTime: string }[];
  };
  sessions?: AttendanceExportSession[];
  students?: AttendanceExportStudent[];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const courseCode = params.get('courseCode') ?? '';
  const sectionName = params.get('sectionName') ?? '';
  const fromDate = params.get('fromDate') ?? '';
  const toDate = params.get('toDate') ?? '';
  const semesterNoRaw = params.get('semesterNo');

  if (!courseCode || !fromDate || !toDate) {
    return NextResponse.json(
      { message: 'courseCode, fromDate and toDate are required to export attendance.' },
      { status: 400 }
    );
  }
  const semesterNo = /^\d+$/.test(semesterNoRaw ?? '') ? Number(semesterNoRaw) : 0;

  const authz = await authorizeExporter(request);
  if (!authz.allowed) {
    return NextResponse.json({ message: authz.error?.message ?? 'Forbidden' }, { status: authz.error?.status ?? 403 });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const historyPath =
    `/api/rollcall/history?courseCode=${encodeURIComponent(courseCode)}` +
    `&semesterNo=${semesterNo}` +
    `&sectionName=${encodeURIComponent(sectionName)}` +
    `&fromDate=${encodeURIComponent(fromDate)}` +
    `&toDate=${encodeURIComponent(toDate)}`;

  const [historyResult, slotsResult] = await Promise.all([
    springFetchWithAuth(cookieHeader, historyPath),
    springFetchWithAuth(cookieHeader, '/api/time-slots').catch(() => null),
  ]);

  if (!historyResult.res.ok) {
    return NextResponse.json(
      { message: 'Could not load Roll Call history from the university server. Please try again.' },
      { status: 502 }
    );
  }
  const raw = (await historyResult.res.json().catch(() => null)) as RollCallHistoryResponseLike | null;
  if (!raw) {
    return NextResponse.json({ message: 'The university server returned an unexpected response.' }, { status: 502 });
  }

  // Re-anchor server-shifted session times onto the real 09:00-16:00 grid.
  let offset = 0;
  if (slotsResult?.res.ok) {
    const slots = (await slotsResult.res.json().catch(() => [])) as TimeSlotLike[];
    offset = timeOffsetMinutes(slots);
  }

  const sessions: AttendanceExportSession[] = (raw.sessions ?? []).map((s) => ({
    ...s,
    startTime: shiftTime(s.startTime, offset),
    endTime: shiftTime(s.endTime, offset),
  }));

  const data: AttendanceExportData = {
    courseCode: raw.schedule?.courseCode ?? courseCode,
    courseName: raw.schedule?.courseName ?? null,
    semesterNo: raw.schedule?.semesterNo ?? null,
    sectionNames: raw.schedule?.sectionNames ?? (sectionName ? [sectionName] : []),
    fromDate,
    toDate,
    sessions,
    students: raw.students ?? [],
  };

  const workbook = buildAttendanceWorkbook(data, { generatedAt: new Date() });
  const buffer = await workbook.xlsx.writeBuffer();

  const fileName = `roll-call-${(courseCode || 'attendance').replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`;
  const response = new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': `attachment; filename="${fileName}"`,
    },
  });
  if (historyResult.newTokens) return carryFreshTokens(response, historyResult.newTokens, request);
  return response;
}