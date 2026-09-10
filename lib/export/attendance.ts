import ExcelJS from 'exceljs';

/**
 * Server-side Excel (xlsx) builder for Roll Call History export.
 *
 * Sheet 1 "Attendance": one row per student — Roll No, then one column per
 * submitted session (date/day/time/periods in the header, P/A/partial in the
 * cell), closing with Totals and Attendance % columns plus an average row.
 * Sheet 2 "Sessions": a session log (date, day, time, periods).
 */

export interface AttendanceExportSession {
  sessionId: string;
  sessionDate: string; // YYYY-MM-DD (already wall-clock, pre-shift applied by the caller)
  dayOfWeek?: string;
  startTime?: string | null;
  endTime?: string | null;
  scheduledPeriods?: number | null;
  scheduleId?: string | null;
}

export interface AttendanceExportCell {
  status?: 'PRESENT' | 'ABSENT' | null;
  attendedPeriods?: number;
  scheduledPeriods?: number;
  remark?: string | null;
  markedByStaffName?: string | null;
}

export interface AttendanceExportStudent {
  studentId: string;
  rollNo: string;
  studentName: string;
  attendance: AttendanceExportCell[];
  totalScheduledPeriods: number;
  totalAttendedPeriods: number;
  attendancePercentage: number;
}

export interface AttendanceExportData {
  courseCode: string | null;
  courseName: string | null;
  semesterNo: number | null;
  sectionNames: string[];
  fromDate: string;
  toDate: string;
  sessions: AttendanceExportSession[];
  students: AttendanceExportStudent[];
}

export interface AttendanceExportMeta {
  generatedAt?: Date;
}

const C = {
  primary: '1D4E89',
  accent: '10325A',
  headerText: 'FFFFFF',
  present: '1E7A3C',
  absent: 'B42318',
  muted: '6B7A90',
  border: 'B8C9D8',
  emptyFill: 'F6F8FA',
  presentFill: 'E7F6EC',
  absentFill: 'FDECEA',
};

const sheetTitle = (data: AttendanceExportData): string =>
  `${data.courseCode ?? ''}${data.courseName && data.courseName !== data.courseCode ? ` \u2014 ${data.courseName}` : ''}`;

const subtitle = (data: AttendanceExportData, generatedAt: Date): string =>
  `Semester ${data.semesterNo ?? '?'} \u2022 ${data.sectionNames.join(' + ') || 'All sections'} \u2022 ` +
  `${data.fromDate} to ${data.toDate} \u2022 Generated ${generatedAt.toISOString().slice(0, 10)}`;

function writeTitleBlock(ws: ExcelJS.Worksheet, data: AttendanceExportData, generatedAt: Date, columnCount: number) {
  const title = ws.getCell('A1');
  title.value = `Roll Call History \u2014 ${sheetTitle(data)}`;
  title.font = { bold: true, size: 14, color: { argb: C.accent } };
  ws.mergeCells(1, 1, 1, columnCount);
  const sub = ws.getCell('A2');
  sub.value = subtitle(data, generatedAt);
  sub.font = { size: 10, color: { argb: C.muted } };
  ws.mergeCells(2, 1, 2, columnCount);
  ws.mergeCells(3, 1, 3, columnCount);
  ws.getCell('A3').value = 'P = Present \u2022 A = Absent \u2022 \u2014 = Not recorded \u2022 x/y = partial periods';
  ws.getCell('A3').font = { size: 9, italic: true, color: { argb: C.muted } };
}

function headerCell(cell: ExcelJS.Cell, bg: string) {
  cell.font = { bold: true, size: 9.5, color: { argb: C.headerText } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: C.border } },
    left: { style: 'thin', color: { argb: C.border } },
    bottom: { style: 'thin', color: { argb: C.border } },
    right: { style: 'thin', color: { argb: C.border } },
  };
}

function bodyCell(cell: ExcelJS.Cell, opts?: { bg?: string; color?: string; bold?: boolean; center?: boolean }) {
  cell.font = { size: 10, color: { argb: opts?.color ?? '243B53' }, bold: opts?.bold ?? false };
  if (opts?.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
  cell.alignment = { vertical: 'middle', horizontal: opts?.center ? 'center' : 'left', wrapText: true };
  cell.border = {
    top: { style: 'hair', color: { argb: C.border } },
    left: { style: 'hair', color: { argb: C.border } },
    bottom: { style: 'hair', color: { argb: C.border } },
    right: { style: 'hair', color: { argb: C.border } },
  };
}

const dayName = (sessionDate: string): string => {
  try {
    return new Date(`${sessionDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return sessionDate;
  }
};

const shortDate = (sessionDate: string): string => {
  try {
    return new Date(`${sessionDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  } catch {
    return sessionDate;
  }
};

export function buildAttendanceWorkbook(
  data: AttendanceExportData,
  meta: AttendanceExportMeta = {}
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UniConnect';
  workbook.created = meta.generatedAt ?? new Date();
  const generatedAt = meta.generatedAt ?? new Date();

  // ---- Sheet 1: Attendance (students x sessions) ----
  const sessionCount = data.sessions.length;
  const totalCols = 2 + sessionCount + 3; // Student | Roll No | sessions | Total Att | Total Sch | %
  const ws = workbook.addWorksheet('Attendance');
  writeTitleBlock(ws, data, generatedAt, totalCols);

  const headerRow = ws.getRow(4);
  headerRow.height = 42;
  headerRow.getCell(1).value = 'Student';
  headerCell(headerRow.getCell(1), C.accent);
  headerRow.getCell(2).value = 'Roll No';
  headerCell(headerRow.getCell(2), C.accent);
  data.sessions.forEach((s, si) => {
    const cell = headerRow.getCell(si + 3);
    cell.value =
      `${dayName(s.sessionDate)} ${shortDate(s.sessionDate)}\n` +
      `${(s.startTime ?? '').slice(0, 5)}\u2013${(s.endTime ?? '').slice(0, 5)}\n` +
      `${s.scheduledPeriods ?? 1} period${(s.scheduledPeriods ?? 1) > 1 ? 's' : ''}`;
    headerCell(cell, C.primary);
  });
  headerRow.getCell(totalCols - 2).value = 'Total\nAttended';
  headerCell(headerRow.getCell(totalCols - 2), C.primary);
  headerRow.getCell(totalCols - 1).value = 'Total\nScheduled';
  headerCell(headerRow.getCell(totalCols - 1), C.primary);
  headerRow.getCell(totalCols).value = 'Attendance\n%';
  headerCell(headerRow.getCell(totalCols), C.primary);

  data.students.forEach((st, sti) => {
    const row = ws.getRow(5 + sti);
    row.getCell(1).value = st.studentName;
    bodyCell(row.getCell(1), { bold: true });
    row.getCell(2).value = st.rollNo;
    bodyCell(row.getCell(2), { center: true });
    st.attendance.forEach((cell, ci) => {
      const c = row.getCell(ci + 3);
      if (!cell || !cell.status) {
        c.value = '\u2014';
        bodyCell(c, { center: true, color: C.muted });
        return;
      }
      if (cell.status === 'PRESENT') {
        c.value = cell.attendedPeriods != null && cell.scheduledPeriods != null && cell.attendedPeriods < cell.scheduledPeriods
          ? `${cell.attendedPeriods}/${cell.scheduledPeriods}`
          : 'P';
        bodyCell(c, { center: true, color: C.present, bold: true, bg: C.presentFill });
      } else {
        c.value = 'A';
        bodyCell(c, { center: true, color: C.absent, bold: true, bg: C.absentFill });
      }
    });
    const attCell = row.getCell(totalCols - 2);
    attCell.value = st.totalAttendedPeriods;
    bodyCell(attCell, { center: true, bold: true });
    const schCell = row.getCell(totalCols - 1);
    schCell.value = st.totalScheduledPeriods;
    bodyCell(schCell, { center: true });
    const pctCell = row.getCell(totalCols);
    pctCell.value = `${st.attendancePercentage.toFixed(2)}%`;
    bodyCell(pctCell, {
      center: true,
      bold: true,
      color: st.attendancePercentage >= 75 ? C.present : 'B45309',
    });
  });

  const avgRow = ws.getRow(5 + data.students.length + 1);
  avgRow.getCell(1).value = 'Average Attendance';
  bodyCell(avgRow.getCell(1), { bold: true });
  avgRow.getCell(2).value = '';
  for (let ci = 3; ci < totalCols - 3; ci++) {
    avgRow.getCell(ci).value = '';
    bodyCell(avgRow.getCell(ci), { center: true });
  }
  const withData = data.students.filter((s) => s.totalScheduledPeriods > 0);
  const avg = withData.length
    ? withData.reduce((a, s) => a + s.attendancePercentage, 0) / withData.length
    : 0;
  avgRow.getCell(totalCols - 2).value = '';
  bodyCell(avgRow.getCell(totalCols - 2), { center: true });
  avgRow.getCell(totalCols - 1).value = '';
  bodyCell(avgRow.getCell(totalCols - 1), { center: true });
  avgRow.getCell(totalCols).value = `${avg.toFixed(2)}%`;
  bodyCell(avgRow.getCell(totalCols), { center: true, bold: true, color: avg >= 75 ? C.present : 'B45309' });

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
  for (let ci = 3; ci <= totalCols; ci++) ws.getColumn(ci).width = 15;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // ---- Sheet 2: Sessions log ----
  const ss = workbook.addWorksheet('Sessions');
  writeTitleBlock(ss, data, generatedAt, 5);
  const sh = ss.getRow(4);
  sh.height = 18;
  ['Date', 'Day', 'Start', 'End', 'Periods'].forEach((h, ci) => {
    const cell = sh.getCell(ci + 1);
    cell.value = h;
    headerCell(cell, C.primary);
  });
  data.sessions.forEach((s, si) => {
    const row = ss.getRow(5 + si);
    row.getCell(1).value = s.sessionDate;
    bodyCell(row.getCell(1), { center: true });
    row.getCell(2).value = dayName(s.sessionDate);
    bodyCell(row.getCell(2), { center: true });
    row.getCell(3).value = (s.startTime ?? '').slice(0, 5);
    bodyCell(row.getCell(3), { center: true });
    row.getCell(4).value = (s.endTime ?? '').slice(0, 5);
    bodyCell(row.getCell(4), { center: true });
    row.getCell(5).value = s.scheduledPeriods ?? 1;
    bodyCell(row.getCell(5), { center: true });
  });
  ss.getColumn(1).width = 16;
  ss.getColumn(2).width = 10;
  ss.getColumn(3).width = 12;
  ss.getColumn(4).width = 12;
  ss.getColumn(5).width = 12;
  ss.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  return workbook;
}