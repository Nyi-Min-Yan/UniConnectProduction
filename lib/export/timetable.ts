import ExcelJS from 'exceljs';
import {
  WEEKLY_EXPORT_DAYS,
  EXPORT_COLUMN_LABELS,
  timetableCohorts,
  sessionLabel,
  cohortCourses,
  type TimetableExportSchedule,
  type TimetableCohort,
} from './scheduleMatrix';

/**
 * Server-side Excel (xlsx) builder for the weekly timetable.
 *
 * Layout: rows are the school days (Mon..Fri), columns are the persisted
 * period slots (P1 09:00-10:00 … P3 11:00-12:00, a LUNCH column 12:00-13:00,
 * then P4 13:00-14:00 … P6 15:00-16:00). One worksheet per section cohort
 * (semester + section); consecutive periods of the same session (e.g. P1+P2)
 * are merged horizontally into one wide cell; a "Courses & Lecturers" block
 * sits below each sheet.
 */

export type TimetableExportCohort = TimetableCohort;
export { timetableCohorts };
export type { TimetableExportSchedule } from './scheduleMatrix';

export interface TimetableExportMeta {
  sourceLabel: string;
  generatedAt?: Date;
}

// Worksheet geometry (1-indexed) inside each cohort sheet:
// row 4 = header (Day | period columns), rows 5-9 = Mon..Fri,
// column 1 = Day, columns 2-8 = P1..P3, LUNCH, P4..P6.
const HEADER_ROW = 4;
const DAYS_START_ROW = 5;
const DAYS_END_ROW = 9;
const FIRST_BLOCK_ROW = 13;
const periodToCol = (period: number) => (period <= 3 ? period + 1 : period + 2);
const LUNCH_COL = 5;
const COL_LAST = 8; // 1 (Day) + 3 (P1-P3) + 1 (LUNCH) + 3 (P4-P6)

const C = {
  primary: '1D4E89',
  accent: '10325A',
  headerText: 'FFFFFF',
  cellFill: 'E8F4FC',
  emptyFill: 'F6F8FA',
  lunchFill: 'F1F3F5',
  border: 'B8C9D8',
  muted: '6B7A90',
};

/** dayCell[day 0..4][period 1..6] -> schedule occupying that cell. */
function placeDayCells(items: TimetableExportSchedule[]): (TimetableExportSchedule | null)[][] {
  const dayCell: (TimetableExportSchedule | null)[][] = WEEKLY_EXPORT_DAYS.map(() =>
    Array.from({ length: 7 }, () => null as TimetableExportSchedule | null)
  );
  for (const s of items) {
    if (!s || typeof s.dayOfWeek !== 'number') continue;
    const day = s.dayOfWeek >= 1 && s.dayOfWeek <= 5 ? s.dayOfWeek - 1 : -1;
    if (day < 0) continue;
    const start = Math.max(1, s.startPeriodNo ?? 1);
    const end = Math.min(6, s.endPeriodNo ?? start);
    for (let p = start; p <= end; p++) dayCell[day][p] = s;
  }
  return dayCell;
}

function applyBorder(cell: ExcelJS.Cell, style: 'thin' | 'hair' = 'thin') {
  cell.border = {
    top: { style, color: { argb: C.border } },
    left: { style, color: { argb: C.border } },
    bottom: { style, color: { argb: C.border } },
    right: { style, color: { argb: C.border } },
  };
}

export function buildTimetableWorkbook(
  schedules: TimetableExportSchedule[],
  meta: TimetableExportMeta
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UniConnect';
  workbook.created = meta.generatedAt ?? new Date();

  const cohorts = timetableCohorts(schedules);

  if (cohorts.length === 0) {
    const ws = workbook.addWorksheet('Timetable');
    const title = ws.getCell('A1');
    title.value = `Weekly Timetable \u2014 ${meta.sourceLabel}`;
    title.font = { bold: true, size: 14, color: { argb: C.accent } };
    ws.mergeCells(1, 1, 1, COL_LAST);
    ws.getCell('A2').value = 'No schedules were found for this export.';
    ws.getCell('A2').font = { italic: true, color: { argb: C.muted } };
    ws.getColumn(1).width = 24;
    return workbook;
  }

  for (const cohort of cohorts) {
    const sheetName = `Sem ${cohort.semesterNo} Sec ${cohort.section}`.slice(0, 31);
    const ws = workbook.addWorksheet(sheetName);
    const generatedAt = meta.generatedAt ?? new Date();

    // Title block
    const title = ws.getCell('A1');
    title.value = `Weekly Timetable \u2014 ${meta.sourceLabel}`;
    title.font = { bold: true, size: 14, color: { argb: C.accent } };
    ws.mergeCells(1, 1, 1, COL_LAST);

    const subtitle = ws.getCell('A2');
    subtitle.value =
      `Semester ${cohort.semesterNo} \u2022 Section ${cohort.section} \u2022 ` +
      `5-day school week 09:00 \u2013 16:00 \u2022 Generated ${generatedAt.toISOString().slice(0, 10)}`;
    subtitle.font = { size: 10, color: { argb: C.muted } };
    ws.mergeCells(2, 1, 2, COL_LAST);

    const dayCell = placeDayCells(cohort.items);

    // Header row: Day | P1..P3 | LUNCH | P4..P6
    const headerRow = ws.getRow(HEADER_ROW);
    headerRow.height = 40;
    headerRow.getCell(1).value = 'Day';
    EXPORT_COLUMN_LABELS.forEach((label, ci) => {
      headerRow.getCell(ci + 2).value = label;
    });
    for (let col = 1; col <= COL_LAST; col++) {
      const cell = headerRow.getCell(col);
      cell.font = {
        bold: true,
        size: 9,
        color: { argb: col === LUNCH_COL ? 'B45309' : C.headerText },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: col === LUNCH_COL ? 'FFF3E0' : col === 1 ? C.accent : C.primary,
        },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      applyBorder(cell);
    }

    // Day rows (Mon..Fri): column 1 = day, columns 2-8 = period slots
    for (let di = 0; di < WEEKLY_EXPORT_DAYS.length; di++) {
      const row = ws.getRow(DAYS_START_ROW + di);
      row.height = 34;

      const dayCellEl = row.getCell(1);
      dayCellEl.value = WEEKLY_EXPORT_DAYS[di];
      dayCellEl.font = { bold: true, size: 10.5, color: { argb: C.accent } };
      dayCellEl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EAF1F7' } };
      dayCellEl.alignment = { vertical: 'middle', horizontal: 'center' };
      applyBorder(dayCellEl);

      const lunchCell = row.getCell(LUNCH_COL);
      lunchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lunchFill } };
      lunchCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      applyBorder(lunchCell);

      for (let p = 1; p <= 6; p++) {
        const cell = row.getCell(periodToCol(p));
        const s = dayCell[di]?.[p] ?? null;
        if (s) {
          cell.value = sessionLabel(s);
          cell.font = { bold: true, size: 9, color: { argb: C.accent } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cellFill } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        } else {
          cell.value = null;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.emptyFill } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
        applyBorder(cell);
      }
    }

    // LUNCH column label, merged across all five school days.
    const lunchMaster = ws.getCell(DAYS_START_ROW, LUNCH_COL);
    lunchMaster.value = `\u2014 LUNCH BREAK \u2014\n12:00 \u2013 13:00`;
    lunchMaster.font = { italic: true, size: 9.5, color: { argb: C.muted } };
    ws.mergeCells(DAYS_START_ROW, LUNCH_COL, DAYS_END_ROW, LUNCH_COL);

    // Merge consecutive periods of the same session into one wide cell per day
    // (P1+P2, P4+P5,…). Runs are segmented at the lunch boundary so a session
    // spanning P3→P4 never merges across the LUNCH column, and the two lunch-
    // adjacent segments stay visually separate (as in the UI grid).
    for (let di = 0; di < WEEKLY_EXPORT_DAYS.length; di++) {
      const rowIdx = DAYS_START_ROW + di;
      for (const [segLo, segHi] of [[1, 3], [4, 6]] as const) {
        let runStart: number | null = null;
        let runId: string | null = null;
        for (let p = segLo; p <= segHi; p++) {
          const s = dayCell[di]?.[p] ?? null;
          if (s && s.scheduleId && s.scheduleId === runId) continue;
          if (runStart !== null && runId !== null && runStart < p - 1) {
            ws.mergeCells(rowIdx, periodToCol(runStart), rowIdx, periodToCol(p - 1));
          }
          runStart = s?.scheduleId ? p : null;
          runId = s?.scheduleId ?? null;
        }
        if (runStart !== null && runId !== null && runStart < segHi) {
          ws.mergeCells(rowIdx, periodToCol(runStart), rowIdx, periodToCol(segHi));
        }
      }
    }

    // ---- Courses & Lecturers block ----
    const courses = cohortCourses(cohort.items);
    let rowIdx = FIRST_BLOCK_ROW;
    const blockTitle = ws.getCell(`A${rowIdx}`);
    blockTitle.value = 'Courses & Lecturers';
    blockTitle.font = { bold: true, size: 11, color: { argb: C.accent } };
    ws.mergeCells(rowIdx, 1, rowIdx, COL_LAST);
    rowIdx++;
    const courseHeader = ws.getRow(rowIdx);
    courseHeader.height = 18;
    ['Course Code', 'Course Name', 'Lecturer(s)', 'Sections', 'Type'].forEach((h, ci) => {
      const cell = courseHeader.getCell(ci + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9.5, color: { argb: C.headerText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      applyBorder(cell);
    });
    rowIdx++;
    for (const course of courses) {
      const row = ws.getRow(rowIdx);
      row.height = 20;
      [course.code, course.name, course.staff, course.sections || cohort.section, course.type].forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.font = { size: 9.5, color: { argb: '243B53' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        applyBorder(cell, 'hair');
      });
      rowIdx++;
    }

    ws.getColumn(1).width = 14;
    for (let ci = 2; ci <= COL_LAST; ci++) ws.getColumn(ci).width = 27;
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  }

  return workbook;
}