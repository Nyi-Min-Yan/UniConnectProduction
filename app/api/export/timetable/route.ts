import { NextRequest, NextResponse } from 'next/server';
import { authorizeExporter, springFetchWithAuth, carryFreshTokens } from '@/lib/export/spring';
import { buildTimetableWorkbook, type TimetableExportSchedule } from '@/lib/export/timetable';

export const dynamic = 'force-dynamic';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const source = params.get('source') === 'generation' ? 'generation' : 'published';
  const termId = params.get('termId') ?? '';
  const generationId = params.get('generationId') ?? '';

  if (source === 'published' && !termId) {
    return NextResponse.json({ message: 'termId is required to export the published timetable.' }, { status: 400 });
  }
  if (source === 'generation' && !generationId) {
    return NextResponse.json({ message: 'generationId is required to export the generation workspace.' }, { status: 400 });
  }

  const authz = await authorizeExporter(request);
  if (!authz.allowed) {
    return NextResponse.json({ message: authz.error?.message ?? 'Forbidden' }, { status: authz.error?.status ?? 403 });
  }

  const path =
    source === 'generation'
      ? `/api/generations/${encodeURIComponent(generationId)}/schedules`
      : `/api/schedules/published?termId=${encodeURIComponent(termId)}`;

  const cookieHeader = request.headers.get('cookie') || '';
  const { res, newTokens } = await springFetchWithAuth(cookieHeader, path);
  if (!res.ok) {
    return NextResponse.json(
      { message: 'Could not load schedules from the university server. Please try again.' },
      { status: 502 }
    );
  }
  const schedules = (await res.json().catch(() => null)) as TimetableExportSchedule[] | null;
  if (!Array.isArray(schedules)) {
    return NextResponse.json({ message: 'The university server returned an unexpected response.' }, { status: 502 });
  }

  const workbook = buildTimetableWorkbook(schedules, {
    sourceLabel: source === 'generation' ? `Generation ${generationId}` : 'Published Timetable',
    generatedAt: new Date(),
  });
  const buffer = await workbook.xlsx.writeBuffer();

  const response = new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': `attachment; filename="weekly-timetable-${source}.xlsx"`,
    },
  });
  if (newTokens) return carryFreshTokens(response, newTokens, request);
  return response;
}