/**
 * Pure schedule → cohort/period-matrix helpers shared by the server-side Excel
 * workbook builder (lib/export/timetable.ts) and the client-side export preview
 * modal (components/shared/ExportModals.tsx). This module imports nothing from
 * the Excel or backend world so it is safe on both runtimes.
 */

export interface TimetableExportSchedule {
  scheduleId: string;
  courseCode?: string | null;
  courseName?: string | null;
  staffName?: string | null;
  staffNames?: string[] | null;
  sectionName?: string | null;
  sections?: string[] | null;
  semesterNo?: number | null;
  dayOfWeek: number;
  startPeriodNo: number;
  endPeriodNo: number;
  scheduleType?: string | null;
  meetingType?: string | null;
}

export interface TimetableCohort {
  semesterNo: number;
  section: string;
  items: TimetableExportSchedule[];
}

export const WEEKLY_EXPORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

export const PERIOD_TIME_LABELS = [
  'P1  09:00 \u2013 10:00',
  'P2  10:00 \u2013 11:00',
  'P3  11:00 \u2013 12:00',
  'P4  13:00 \u2013 14:00',
  'P5  14:00 \u2013 15:00',
  'P6  15:00 \u2013 16:00',
] as const;

export const LUNCH_TIME_LABEL = 'LUNCH  12:00 \u2013 13:00';

/** Column headers in the exported sheet, in order: P1..P3, LUNCH, P4..P6. */
export const EXPORT_COLUMN_LABELS = [
  PERIOD_TIME_LABELS[0],
  PERIOD_TIME_LABELS[1],
  PERIOD_TIME_LABELS[2],
  LUNCH_TIME_LABEL,
  PERIOD_TIME_LABELS[3],
  PERIOD_TIME_LABELS[4],
  PERIOD_TIME_LABELS[5],
] as const;

/**
 * Mirrors the on-screen groupSchedulesByCohort: each cohort is one semester +
 * section table; LMS/ASSIGNMENT fillers join every cohort whose cells are free;
 * BREAK fillers are omitted; fillers never create a cohort table.
 */
export function timetableCohorts(schedules: TimetableExportSchedule[]): TimetableCohort[] {
  const map = new Map<string, TimetableCohort>();
  for (const s of schedules) {
    if (s.scheduleType === 'BREAK') continue;
    const semesterNo = typeof s.semesterNo === 'number' ? s.semesterNo : Number(s.semesterNo ?? 0);
    const sections = Array.from(
      new Set(
        (s.sections && s.sections.length > 0 ? s.sections : s.sectionName ? [s.sectionName] : [])
          .map((x) => String(x).trim())
          .filter(Boolean)
      )
    );
    for (const section of sections) {
      const key = `${semesterNo}|${section}`;
      const group = map.get(key) ?? { semesterNo, section, items: [] };
      if (!map.has(key)) map.set(key, group);
      group.items.push(s);
    }
  }
  for (const s of schedules) {
    if (s.scheduleType !== 'LMS' && s.scheduleType !== 'ASSIGNMENT') continue;
    for (const group of map.values()) {
      const occupied = group.items.some(
        (c) =>
          c.scheduleType === 'COURSE' &&
          c.dayOfWeek === s.dayOfWeek &&
          c.startPeriodNo <= s.endPeriodNo &&
          c.endPeriodNo >= s.startPeriodNo
      );
      if (!occupied) group.items.push(s);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.semesterNo - b.semesterNo || a.section.localeCompare(b.section)
  );
}

export function sessionLabel(s: TimetableExportSchedule | null | undefined): string {
  if (!s) return '';
  const parts: string[] = [];
  const code = s.courseCode?.trim();
  const name = s.courseName?.trim();
  if (code && name && code !== name) parts.push(`${code} \u2014 ${name}`);
  else if (name) parts.push(name);
  else if (code) parts.push(code);
  const staff = (s.staffNames ?? []).concat(s.staffName ? [s.staffName] : [])
    .filter(Boolean)
    .join(', ')
    .trim();
  if (staff) parts.push(staff);
  const type =
    s.meetingType === 'LAB' ? 'LAB'
    : s.meetingType === 'LECTURE' ? 'LECTURE'
    : s.scheduleType === 'LMS' ? 'LMS'
    : s.scheduleType === 'ASSIGNMENT' ? 'ASSIGNMENT'
    : '';
  if (type) parts.push(type);
  return parts.join('\n');
}

export interface CohortPreviewRow {
  /** School day this row represents (Mon..Fri). */
  rowLabel: string;
  /** One entry per period column: P1,P2,P3,LUNCH,P4,P5,P6. */
  cells: (string | null)[];
}

/**
 * A compact 5-row preview matrix for one cohort (Mon..Fri × P1..P3, LUNCH,
 * P4..P6). Consecutive periods of the same session collapse into one labelled
 * cell starting at the merged span's first period — the same geometry the
 * Excel sheet uses (the span is one horizontally merged cell).
 */
export function previewMatrix(items: TimetableExportSchedule[]): CohortPreviewRow[] {
  const dayCell: (TimetableExportSchedule | null)[][] = WEEKLY_EXPORT_DAYS.map(() =>
    Array.from({ length: 7 }, () => null as TimetableExportSchedule | null)
  );
  for (const s of items) {
    if (!s || typeof s.dayOfWeek !== 'number') continue;
    const day = s.dayOfWeek >= 1 && s.dayOfWeek <= 5 ? s.dayOfWeek - 1 : -1;
    if (day < 0) continue;
    const start = Math.max(1, s.startPeriodNo ?? 1);
    const end = Math.min(6, s.endPeriodNo ?? start);
    for (let p = start; p <= end; p++) {
      if (p < 1 || p > 6) continue;
      dayCell[day][p] = s;
    }
  }

  const periodCol = (period: number) => (period <= 3 ? period - 1 : period + 1);
  const rows: CohortPreviewRow[] = [];
  for (let di = 0; di < WEEKLY_EXPORT_DAYS.length; di++) {
    const cells: (string | null)[] = Array.from({ length: 7 }, () => null);
    cells[3] = '\u2014';
    let runId: string | null = null;
    for (let p = 1; p <= 6; p++) {
      const s = dayCell[di]?.[p] ?? null;
      const ci = periodCol(p);
      if (s) {
        // Only the first period of a multi-period run keeps the label; the
        // rest collapse into the (merged) continuation cells.
        const sameRun = s.scheduleId !== null && s.scheduleId === runId;
        cells[ci] = sameRun ? null : `${s.courseCode ?? ''}`;
        runId = s.scheduleId ?? null;
      } else {
        runId = null;
      }
    }
    rows.push({ rowLabel: WEEKLY_EXPORT_DAYS[di], cells });
  }
  return rows;
}

export interface CohortCourseRow {
  code: string;
  name: string;
  staff: string;
  sections: string;
  type: string;
}

export function cohortCourses(items: TimetableExportSchedule[]): CohortCourseRow[] {
  const map = new Map<string, TimetableExportSchedule[]>();
  for (const s of items) {
    if ((!s.courseCode && !s.courseName) || s.scheduleType === 'BREAK') continue;
    const key = `${s.courseCode ?? ''}::${s.meetingType ?? ''}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  const rows: CohortCourseRow[] = [];
  for (const [, group] of map) {
    const first = group[0];
    const staff = Array.from(
      new Set(group.flatMap((g) => g.staffName ? [g.staffName] : (g.staffNames ?? [])))
    ).filter(Boolean).join(', ');
    const sections = Array.from(
      new Set(
        group.flatMap((g) => (g.sections && g.sections.length ? g.sections : g.sectionName ? [g.sectionName] : []))
      )
    ).filter(Boolean).join(', ');
    const type =
      first.meetingType === 'LAB' ? 'Lab'
      : first.meetingType === 'LECTURE' ? 'Lecture'
      : first.scheduleType === 'LMS' ? 'LMS'
      : first.scheduleType === 'ASSIGNMENT' ? 'Assignment'
      : '';
    rows.push({
      code: first.courseCode?.trim() ?? '',
      name: first.courseName?.trim() ?? '',
      staff,
      sections,
      type,
    });
  }
  return rows;
}