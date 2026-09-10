'use client';

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '@/components/shared/session';
import { useUniversityData } from '@/components/shared/useUniversityData';
import { apiFetch, getStudentRollCall } from '@/components/shared/api';
import type {
  StudentRecord,
  StudentRollCallResponse,
  StudentRollCallCourse,
  StudentRollCallSession,
} from '@/components/shared/api';
import {
  CalendarCheck,
  CalendarDays,
  BookOpen,
  Users,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react';

type Mode = 'today' | 'history' | 'attendance';

function readTab(): Mode {
  if (typeof window === 'undefined') return 'today';
  const t = new URLSearchParams(window.location.search).get('tab');
  if (t === 'attendance') return 'attendance';
  return t === 'history' || t === 'schedules' ? 'history' : 'today';
}

const emptyRollCall: StudentRollCallResponse = {
  studentId: '',
  rollNo: '',
  studentName: '',
  semesterNo: null,
  sectionName: null,
  termStart: null,
  termEnd: null,
  courses: [],
};

const chip = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
  padding: '3px 10px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.3px',
  textTransform: 'uppercase', color, backgroundColor: bg, whiteSpace: 'nowrap',
});

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return t;
  const ampm = hh < 12 ? 'AM' : 'PM';
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour}:${String(mm ?? 0).padStart(2, '0')} ${ampm}`;
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function termWindowFor(semesterNo: number | null): { start: string; end: string; label: string } | null {
  if (semesterNo == null) return null;
  const odd = semesterNo % 2 !== 0;
  const today = new Date();
  const windows: Array<{ start: Date; end: Date; label: string }> = [];
  if (!odd) {
    // Even semesters (2,4,6,8) are the final term running Jun–Sep.
    for (let y = today.getFullYear() - 1; y <= today.getFullYear() + 1; y++) {
      windows.push({
        start: new Date(y, 5, 1),
        end: new Date(y, 8, 30),
        label: `Final term: Jun – Sep ${y}`,
      });
    }
  } else {
    // Odd semesters (1,3,5,7) run Nov–Mar across the year boundary.
    for (let y = today.getFullYear() - 1; y <= today.getFullYear() + 1; y++) {
      windows.push({
        start: new Date(y, 10, 1),
        end: new Date(y + 1, 2, 28),
        label: `Term: Nov ${y} – Mar ${y + 1}`,
      });
    }
  }
  const inside = windows.find((w) => today >= w.start && today <= w.end);
  const chosen = inside ?? windows.find((w) => w.start > today) ?? windows[windows.length - 1];
  return {
    start: iso(chosen.start),
    end: iso(chosen.end),
    label: chosen.label,
  };
}

function phaseBadge(phase: StudentRollCallSession['phase']) {
  const text = phase === 'PAST' ? 'Past' : phase === 'TODAY' ? 'Today' : 'Upcoming';
  return (
    <span style={phase === 'TODAY'
      ? chip('var(--primary)', 'rgba(40,114,161,0.15)')
      : phase === 'UPCOMING'
        ? chip('var(--text-lighter)', 'var(--surface)')
        : chip('var(--text-light)', 'var(--surface)')}>{text}</span>
  );
}

function statusBadge(status: StudentRollCallSession['status'] | StudentRollCallCourse['todayStatus']) {
  if (status === 'PRESENT') return <span style={chip('var(--success)', '#dcfce7')}>Present</span>;
  if (status === 'ABSENT') return <span style={chip('var(--error)', '#fee2e2')}>Absent</span>;
  if (status === 'NO_SESSION') return <span style={chip('var(--warning)', '#fef3c7')}>Not recorded</span>;
  if (status === 'UNMARKED') return <span style={chip('var(--warning)', '#fef3c7')}>Pending</span>;
  return <span style={{ fontSize: 12, color: 'var(--text-lighter)' }}>—</span>;
}

function sessionStatusBadge(session: StudentRollCallSession) {
  if (session.status === 'PRESENT') return <span style={chip('var(--success)', '#dcfce7')}>Present</span>;
  if (session.status === 'ABSENT') return <span style={chip('var(--error)', '#fee2e2')}>Absent</span>;
  if (session.phase === 'UPCOMING') return <span style={{ fontSize: 12, color: 'var(--text-lighter)' }}>—</span>;
  return <span style={chip('var(--warning)', '#fef3c7')}>Not recorded</span>;
}

const cardStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' } as const;

function AttendanceBar({ course }: { course: StudentRollCallCourse }) {
  const marked = course.presentClasses + course.absentClasses;
  if (marked <= 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-lighter)' }}>
        No attendance recorded yet
      </div>
    );
  }
  const color = course.belowThreshold ? 'var(--error)' : 'var(--success)';
  const pct = Math.round(course.attendancePct);
  return (
    <div className="w-full">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 5, fontSize: 11, fontWeight: 700,
        color: course.belowThreshold ? 'var(--error)' : 'var(--success)',
      }}>
        <span>Attendance ({pct}%)</span>
        <span>{course.presentClasses}/{marked} classes attended</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: 6, borderRadius: 4, background: color }} />
      </div>
    </div>
  );
}

function SessionDetailModal({ course, session, onClose }: {
  course: StudentRollCallCourse;
  session: StudentRollCallSession;
  onClose: () => void;
}) {
  return (
    <motion.dialog
      open
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal modal-open z-[999] p-4 border-none"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="w-[94vw] max-w-xl bg-base-100 rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--surface)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
            <BookOpen size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{course.courseCode}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{course.courseName}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-light)' }}>
              Semester {course.semesterNo ?? '—'} • Section: {course.sections.join(', ')}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
              Class Session
            </div>
            <div className="rounded-xl" style={{ border: '1px solid var(--surface-border)', background: 'var(--surface)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>
                  {fmtDate(session.sessionDate)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
                  {session.dayName} • {fmtTime(session.startTime)} – {fmtTime(session.endTime)}
                  {session.scheduledPeriods ? ` • ${session.scheduledPeriods} periods` : ''}
                </span>
                <span>{phaseBadge(session.phase)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--surface)', margin: '10px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-light)' }}>Attendance:</span>
                {sessionStatusBadge(session)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-light)' }}>Lecturer:</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  {course.staffNames.join(', ') || 'Not assigned'}
                </span>
              </div>
              {session.status === 'PRESENT' && session.attendedPeriods > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>
                  Attended {session.attendedPeriods} of {session.scheduledPeriods ?? '—'} periods
                </div>
              )}
              {session.remark && (
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>Remark: {session.remark}</div>
              )}
              {session.markedByStaffName && (
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>Marked by: {session.markedByStaffName}</div>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
              Course Attendance Summary
            </div>
            <AttendanceBar course={course} />
          </div>
        </div>
      </motion.div>
    </motion.dialog>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'bad' | 'accent' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'bad' ? 'var(--error)' : tone === 'accent' ? 'var(--primary)' : 'var(--text)';
  return (
    <div className="rounded-xl p-3" style={{ border: '1px solid var(--surface-border)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-lighter)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function AttendanceDetailModal({ course, onClose, semesterFallback }: {
  course: StudentRollCallCourse;
  onClose: () => void;
  semesterFallback: number | null;
}) {
  const pct = Math.round(course.attendancePct);
  const semesterLabel = course.semesterNo ?? semesterFallback ?? '—';
  return (
    <motion.dialog
      open
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal modal-open z-[999] p-4 border-none"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="w-[94vw] max-w-xl bg-base-100 rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--surface)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: course.belowThreshold
              ? 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(185,28,28,0.9))'
              : 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
            <BookOpen size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{course.courseCode}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{course.courseName}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-light)' }}>
              Semester {semesterLabel} • Section: {course.sections.join(', ')}
              {course.staffNames.length > 0 ? ` • ${course.staffNames.join(', ')}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Overall Attendance
              </div>
              {course.belowThreshold ? (
                <span style={chip('var(--error)', '#fee2e2')}><AlertTriangle size={11} /> Below 75%</span>
              ) : (
                <span style={chip('var(--success)', '#dcfce7')}>On track</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: course.belowThreshold ? 'var(--error)' : 'var(--success)' }}>{pct}%</span>
            </div>
            <AttendanceBar course={course} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <MiniStat
              label="Classes Attended"
              value={course.presentClasses}
              tone="ok"
            />
            <MiniStat
              label="Classes Missed"
              value={course.absentClasses}
              tone={course.absentClasses > 0 ? 'bad' : 'ok'}
            />
            {course.unmarkedClasses > 0 && (
              <MiniStat label="Unmarked" value={course.unmarkedClasses} />
            )}
            <MiniStat
              label="Still safe to skip"
              value={course.canMissMore}
              tone="accent"
            />
            <MiniStat
              label="Must attend to recover 75%"
              value={course.needToAttend}
              tone={course.needToAttend > 0 ? 'bad' : 'ok'}
            />
          </div>
        </div>
      </motion.div>
    </motion.dialog>
  );
}

function RollCallSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-base-100 backdrop-blur-xl p-5" style={cardStyle}>
            <div className="flex items-start gap-3">
              <div className="skeleton h-11 w-11 rounded-xl shrink-0" />
              <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div className="skeleton h-4 w-2/3" style={{ borderRadius: 6 }} />
                <div className="skeleton h-3 w-1/2" style={{ borderRadius: 6 }} />
                <div className="skeleton h-3 w-1/3" style={{ borderRadius: 6 }} />
              </div>
            </div>
            <div className="mt-4">
              <div className="skeleton h-3 w-1/2" style={{ borderRadius: 6 }} />
              <div className="skeleton h-1.5 w-full mt-2" style={{ borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RollCallSection() {
  const { user: session } = useSession();
  const me = session?.email ?? '';

  const rc = useUniversityData<StudentRollCallResponse>(
    useCallback(async () => {
      const students = await apiFetch<StudentRecord[]>('/api/students');
      const self = students.find((s) => s.email === me);
      if (!self) return emptyRollCall;
      return getStudentRollCall(self.studentId);
    }, [me])
  );

  const [mode, setMode] = useState<Mode>(readTab);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [sessionDetail, setSessionDetail] = useState<{ course: StudentRollCallCourse; session: StudentRollCallSession } | null>(null);
  const [attendanceDetail, setAttendanceDetail] = useState<StudentRollCallCourse | null>(null);

  const switchTab = (m: Mode) => {
    setMode(m);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', m);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const courses = useMemo(() => rc.data?.courses ?? [], [rc.data]);
  const todayCourses = useMemo(() => courses.filter((c) => c.todayClass), [courses]);
  const semesterNo = useMemo(() => {
    const v = rc.data?.semesterNo;
    return v == null || v === '' ? null : parseInt(v, 10);
  }, [rc.data?.semesterNo]);
  const fallbackWindow = useMemo(() => termWindowFor(semesterNo), [semesterNo]);
  const termWindow = fallbackWindow;
  const inTerm = useCallback(
    (date: string) => (termWindow ? date >= termWindow.start && date <= termWindow.end : true),
    [termWindow]
  );
  const openSession = useCallback((course: StudentRollCallCourse, session: StudentRollCallSession) => {
    setSessionDetail({ course, session });
  }, []);

  type HistoryRow = { course: StudentRollCallCourse; session: StudentRollCallSession };

  const courseOptions = useMemo(() => courses.map((c) => c.courseCode), [courses]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) {
      for (const s of c.sessions) {
        if (!inTerm(s.sessionDate)) continue;
        const mm = s.sessionDate.slice(0, 7);
        if (mm) set.add(mm);
      }
    }
    return Array.from(set).sort().reverse();
  }, [courses, inTerm]);

  const historyRows = useMemo(() => {
    const all = courses.flatMap((course) =>
      course.sessions.map((session): HistoryRow => ({ course, session }))
    );
    const rows = all.filter((r) => inTerm(r.session.sessionDate));
    if (courseFilter !== 'all') {
      return rows.filter((r) => r.course.courseCode === courseFilter);
    }
    if (monthFilter !== 'all') {
      return rows.filter((r) => r.session.sessionDate.startsWith(monthFilter));
    }
    return rows;
  }, [courses, courseFilter, monthFilter, inTerm]);

  const groupedHistory = useMemo((): Array<[string, Array<[string, HistoryRow[]]>]> => {
    const monthMap = new Map<string, HistoryRow[]>();
    for (const r of historyRows) {
      const month = r.session.sessionDate.slice(0, 7);
      const arr = monthMap.get(month) ?? [];
      arr.push(r);
      monthMap.set(month, arr);
    }
    const months = [...monthMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const result: Array<[string, Array<[string, HistoryRow[]]>]> = [];
    for (const [month, rows] of months) {
      const dayMap = new Map<string, HistoryRow[]>();
      for (const r of rows) {
        const arr = dayMap.get(r.session.sessionDate) ?? [];
        arr.push(r);
        dayMap.set(r.session.sessionDate, arr);
      }
      const days = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      for (const [, dayRows] of days) {
        dayRows.sort((a, b) => (a.session.startTime ?? '').localeCompare(b.session.startTime ?? ''));
      }
      result.push([month, days]);
    }
    return result;
  }, [historyRows]);

  const attendanceGroups = useMemo(() => {
    const groups = new Map<string, StudentRollCallCourse[]>();
    for (const c of courses) {
      const key = `Semester ${c.semesterNo ?? semesterNo ?? '—'}${c.sections.length > 0 ? ` • Section ${c.sections.join(', ')}` : ''}`;
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [courses, semesterNo]);

  const tabs: { id: Mode; label: string }[] = [
    { id: 'today', label: "Today's Roll Call" },
    { id: 'history', label: 'Roll Call History' },
    { id: 'attendance', label: 'Attendance' },
  ];

  const loading = rc.loading && !rc.data;

  const renderCourseCard = (course: StudentRollCallCourse, showStats: boolean) => {
    return (
      <button
        key={course.courseCode}
        onClick={() => {
          const s = course.sessions.find((x) => x.phase === 'TODAY') ?? null;
          if (s) openSession(course, s);
        }}
        className="w-full text-left bg-base-100 backdrop-blur-xl p-5"
        style={{
          ...cardStyle,
          borderColor: course.belowThreshold ? 'var(--error)' : 'var(--surface-border)',
          cursor: 'pointer',
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: course.belowThreshold
              ? 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(185,28,28,0.9))'
              : 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
            <BookOpen size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--accent)' }}>{course.courseCode}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{course.courseName}</span>
              {course.belowThreshold && (
                <span style={chip('var(--error)', '#fee2e2')}><AlertTriangle size={11} /> Below 75%</span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 3 }}>
              {course.staffNames.length > 0 ? `Lecturer: ${course.staffNames.join(', ')}` : 'No lecturer assigned'}
              {course.sections.length > 0 ? ` • Section: ${course.sections.join(', ')}` : ''}
            </div>
            {course.todayClass && (
              <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CalendarCheck size={12} /> Today • {fmtTime(course.todayStartTime)} – {fmtTime(course.todayEndTime)}
                </span>
                {statusBadge(course.todayStatus)}
              </div>
            )}
          </div>
        </div>
        {showStats && (
          <div className="mt-4">
            <AttendanceBar course={course} />
          </div>
        )}
      </button>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>Roll Call</h1>
        {rc.data?.sectionName && (
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
            Semester {rc.data.semesterNo} • Section {rc.data.sectionName}
            {rc.data.termStart ? ` • ${rc.data.termStart.slice(0, 4)}` : ''}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 20 }}>
        Your attendance summary across enrolled courses
      </p>

      {rc.error && !rc.data && (
        <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 12 }}>University server unreachable — retrying…</div>
      )}

      <div className="flex gap-2 flex-wrap mb-4" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={mode === t.id}
            onClick={() => switchTab(t.id)}
            className={'btn btn-sm cursor-pointer ' + (mode === t.id ? 'btn-primary' : 'btn-ghost')}
            style={{ border: '1.5px solid var(--surface-border)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'today' && (
        <div>
          {loading ? (
            <RollCallSkeleton />
          ) : todayCourses.length === 0 ? (
            <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
              <CalendarDays size={22} style={{ margin: '0 auto 8px', color: 'var(--text-lighter)' }} />
              No classes scheduled for you today
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todayCourses.map((c) => renderCourseCard(c, false))}
            </div>
          )}
        </div>
      )}

      {mode === 'history' && (
        <div>
          {loading ? (
            <RollCallSkeleton />
          ) : (
          <div>
            <div className="flex gap-2 flex-wrap mb-4">
            {termWindow && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'rgba(40,114,161,0.12)' }}
              >
                {termWindow.label}
              </span>
            )}
            <select
              value={courseFilter}
              onChange={(e) => { setCourseFilter(e.target.value); setMonthFilter('all'); }}
              style={{
                padding: '8px 12px', fontSize: 13, color: 'var(--text)',
                background: 'var(--divider)', border: '1.5px solid var(--surface-border)',
                borderRadius: 'var(--radius-md)', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="all">All courses</option>
              {courseOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              disabled={courseFilter !== 'all'}
              style={{
                padding: '8px 12px', fontSize: 13, color: 'var(--text)',
                background: 'var(--divider)', border: '1.5px solid var(--surface-border)',
                borderRadius: 'var(--radius-md)', outline: 'none', cursor: 'pointer',
                opacity: courseFilter !== 'all' ? 0.5 : 1,
              }}
            >
              <option value="all">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{fmtMonth(m)}</option>
              ))}
            </select>
          </div>

          {courses.length === 0 ? (
            <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
              No course schedules published for your cohort yet
            </div>
          ) : groupedHistory.length === 0 ? (
            <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
              No sessions match the selected filters
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groupedHistory.map(([month, dayGroups]) => {
                const monthTotal = dayGroups.reduce((n, [, rows]) => n + rows.length, 0);
                return (
                  <div key={month}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{fmtMonth(month)}</span>
                      <span className="badge badge-ghost badge-sm">{monthTotal} session{monthTotal > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-col gap-4">
                      {dayGroups.map(([day, rows]) => (
                        <div key={day}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <CalendarDays size={14} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-light)' }}>{fmtDate(day)}</span>
                            <span className="badge badge-ghost badge-sm">{rows.length}</span>
                          </div>
                          <div className="rounded-xl divide-y" style={{ border: '1px solid var(--surface-border)', background: 'var(--surface)', overflow: 'hidden' }}>
                            {rows.map(({ course, session }, i) => (
                              <button
                                key={session.sessionId ?? `${session.scheduleId}-${session.sessionDate}`}
                                onClick={() => openSession(course, session)}
                                className="w-full text-left cursor-pointer hover:bg-black/[0.03] transition-colors"
                                style={{ padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--surface)', background: 'transparent' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{course.courseCode}</span>
                                      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{course.courseName}</span>
                                    </div>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                                      <Users size={11} /> {course.staffNames.join(', ') || 'No lecturer assigned'}
                                      {' • '}<Clock size={11} /> {session.dayName} • {fmtTime(session.startTime)} – {fmtTime(session.endTime)}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {phaseBadge(session.phase)}
                                    {sessionStatusBadge(session)}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </div>
      )}

      {mode === 'attendance' && (
        <div>
          {loading ? (
            <RollCallSkeleton />
          ) : courses.length === 0 ? (
            <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
              No courses scheduled for you this semester yet
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {attendanceGroups.map(([label, list]) => (
                <div key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <BookOpen size={15} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{label}</span>
                    <span className="badge badge-ghost badge-sm">{list.length} course{list.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {list.map((course) => {
                      const pct = Math.round(course.attendancePct);
                      return (
                        <button
                          key={course.courseCode}
                          onClick={() => setAttendanceDetail(course)}
                          className="w-full text-left bg-base-100 backdrop-blur-xl p-5 cursor-pointer transition-transform hover:-translate-y-0.5"
                          style={{
                            ...cardStyle,
                            borderColor: course.belowThreshold ? 'var(--error)' : 'var(--surface-border)',
                            borderWidth: course.belowThreshold ? 2 : 1,
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: course.belowThreshold
                                ? 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(185,28,28,0.9))'
                                : 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
                              <BookOpen size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--accent)' }}>{course.courseCode}</span>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{course.courseName}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: course.belowThreshold ? 'var(--error)' : 'var(--success)' }}>{pct}%</span>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 3 }}>
                                {course.staffNames.length > 0 ? `Lecturer: ${course.staffNames.join(', ')}` : 'No lecturer assigned'}
                                <span> • {course.presentClasses} attended • {course.absentClasses} missed</span>
                                {course.unmarkedClasses > 0 ? ` • ${course.unmarkedClasses} unmarked` : ''}
                              </div>
                              <div className="mt-3">
                                <AttendanceBar course={course} />
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sessionDetail && createPortal(
        <AnimatePresence>
          <SessionDetailModal
            course={sessionDetail.course}
            session={sessionDetail.session}
            onClose={() => setSessionDetail(null)}
          />
        </AnimatePresence>,
        document.body
      )}

      {attendanceDetail && createPortal(
        <AnimatePresence>
          <AttendanceDetailModal
            course={attendanceDetail}
            semesterFallback={semesterNo}
            onClose={() => setAttendanceDetail(null)}
          />
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}