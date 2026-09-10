'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useFeedPosts } from '@/lib/hooks';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';
import WelcomeBar from '@/components/shared/WelcomeBar';
import StatCard from '@/components/shared/StatCard';
import ThemeSwitcher from '@/components/shared/ThemeSwitcher';
import FeedPost from '@/components/shared/FeedPost';
import LostFoundPage from '@/components/shared/LostFoundSection';
import AnnouncementsPage from '@/components/shared/AnnouncementsSection';
import { apiFetch, getPublishedSchedules } from '@/components/shared/api';
import { useSession } from '@/components/shared/session';
import { useMyProfile } from '@/components/shared/useMyProfile';
import { SecuritySettings } from '@/components/shared/SecuritySettings';
import NotificationSettings from '@/components/shared/NotificationSettings';
import { initialsOf } from '@/components/shared/useUniversityPeople';
import type { StudentRecord, AcademicTermRecord, ScheduleResponse } from '@/components/shared/api';
import { useUniversityData } from '@/components/shared/useUniversityData';
import { WeeklyTimetableGrid, WeeklyGridSkeleton, useTimeSlotLabels, semesterTileLabel } from '@/components/lecturer/sections';
import {
  GraduationCap, BookOpen, ClipboardCheck, CalendarCheck, CalendarDays,
  Newspaper, FileText, X,
  Clock, ShieldCheck, Ban, Download, Eye, ChevronDown, Filter,
} from 'lucide-react';
export { default as FeedSection } from '@/components/shared/FeedSection';
export { default as MessagesSection } from '@/components/shared/MessagesSection';
export { default as ActivitySection } from '@/components/shared/ActivitySection';
export { RollCallSection } from '@/components/student/RollCallSection';

import BlockedSection from '@/components/shared/BlockedSection';

const cardStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' } as const;

type TimeRow = { kind: 'period'; period: number } | { kind: 'lunch' };

/**
 * The persisted university timetable grid (source of truth in the time_slots
 * table): P1=09:00-10:00 … P3=11:00-12:00, Lunch=12:00-13:00,
 * P4=13:00-14:00 … P6=15:00-16:00. The school day runs 09:00-16:00.
 */

/** Section names a schedule delivers to (spans all combined cohorts). */
const studentSectionNames = (s: ScheduleResponse): string[] =>
  (s.sections && s.sections.length > 0 ? s.sections : s.sectionName ? [s.sectionName] : [])
    .map((x) => String(x).trim())
    .filter(Boolean);

/**
 * A published schedule is "mine" when it is a COURSE for my semester and one
 * of my section(s). Fillers (LMS / ASSIGNMENT) are handled separately — they
 * belong in every cohort's free slot.
 */
function isStudentCourse(s: ScheduleResponse, self: Pick<StudentRecord, 'semesterNo' | 'sectionName'>): boolean {
  if (s.scheduleType === 'LMS' || s.scheduleType === 'ASSIGNMENT') return false;
  if (s.scheduleType && s.scheduleType !== 'COURSE') return false;
  const sem = typeof s.semesterNo === 'number' ? s.semesterNo : Number(s.semesterNo ?? 0);
  if (sem !== self.semesterNo) return false;
  return studentSectionNames(s).includes(self.sectionName);
}

export function Dashboard() {
  const feed = useFeedPosts().posts;

  return (
    <div>
      <WelcomeBar name="Mg Kyaw" subtitle="Here's your academic overview" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<GraduationCap size={20} />} iconBgClass="bg-primary/10 text-primary" value={3.85} label="GPA" trend="+0.2 this sem" />
        <StatCard icon={<BookOpen size={20} />} iconBgClass="bg-info/10 text-info" value={5} label="Active Courses" trend="This semester" />
        <StatCard icon={<ClipboardCheck size={20} />} iconBgClass="bg-success/10 text-success" value={'94%'} label="Attendance" trend="+3% this month" />
        <StatCard icon={<CalendarDays size={20} />} iconBgClass="bg-warning/10 text-warning" value={3} label="Upcoming Events" trend="This week" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[18px]">
        <div className="bg-base-100 backdrop-blur-xl" style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Newspaper size={16} /> Recent Feed
            </h3>
            <Link href="/student/feed" style={{ fontSize: 13, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>View All</Link>
          </div>
          {(feed ?? []).slice(0, 3).map((post) => (
            <FeedPost key={post.id} post={post} />
          ))}
          {feed && feed.length === 0 && (
            <div style={{ padding: '18px 22px', fontSize: 12, color: 'var(--text-lighter)' }}>No posts yet</div>
          )}
        </div>
        <div>
          <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarCheck size={16} /> Upcoming Events
              </h3>
              <Link href="/student/events" style={{ fontSize: 13, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>View All</Link>
            </div>
            <div style={{ padding: '18px 22px', fontSize: 12, color: 'var(--text-lighter)' }}>No events yet</div>
          </div>
          <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} /> Today&apos;s Schedule
              </h3>
            </div>
            <div style={{ padding: '18px 22px', fontSize: 12, color: 'var(--text-lighter)' }}>No schedules today</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TimetableSection() {
  const { user: session } = useSession();
  const me = session?.email ?? '';

  const selfData = useUniversityData<StudentRecord | null>(
    useCallback(async () => {
      const students = await apiFetch<StudentRecord[]>('/api/students');
      return students.find((s) => s.email.toLowerCase() === me.toLowerCase()) ?? null;
    }, [me])
  );
  const terms = useUniversityData<AcademicTermRecord[]>(
    useCallback(() => apiFetch<AcademicTermRecord[]>('/api/terms'), [])
  );
  const [termId, setTermId] = useState('');
  useEffect(() => {
    if (!termId && terms.data && terms.data.length > 0) {
      const active = terms.data.find((t) => t.status === 'ACTIVE') ?? terms.data[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default to active term
      setTermId(active.termId);
    }
  }, [terms.data, termId]);
  const schedules = useUniversityData<ScheduleResponse[]>(
    useCallback(() => (termId ? getPublishedSchedules(termId) : Promise.resolve([])), [termId])
  );
  // Force the schedules fetch for the chosen term to run immediately. Because
  // the hook's polling effect is keyed on the fetcher only via refresh(), the
  // placeholder [] from the pre-termId state would otherwise stick until the
  // next poll cycle — hiding the skeleton and the real published data.
  const [termFetching, setTermFetching] = useState(false);
  const fetchedTermRef = useRef('');
  useEffect(() => {
    if (!termId || fetchedTermRef.current === termId) return;
    fetchedTermRef.current = termId;
    setTermFetching(true);
    schedules.refresh()
      .then(() => setTermFetching(false))
      .catch(() => setTermFetching(false));
  }, [termId, schedules]);
  const [todayIdx, setTodayIdx] = useState(-1);
  useEffect(() => {
    const d = new Date().getDay();
    setTodayIdx(d >= 1 && d <= 5 ? d - 1 : -1);
  }, []);
  const { periodLabels, lunchLabel } = useTimeSlotLabels();

  const self = selfData.data;
  const published = schedules.data ?? [];
  const mine = useMemo(() => {
    if (!self) return [];
    const courses = published.filter((s) => isStudentCourse(s, self));
    // LMS / ASSIGNMENT fillers belong in every free slot (same logic as
    // groupSchedulesByCohort in the lecturer view).
    const fillers = published.filter(
      (s) => (s.scheduleType === 'LMS' || s.scheduleType === 'ASSIGNMENT') &&
        courses.every((c) =>
          c.dayOfWeek !== s.dayOfWeek ||
          c.endPeriodNo < s.startPeriodNo ||
          c.startPeriodNo > s.endPeriodNo
        )
    );
    return [...courses, ...fillers];
  }, [self, published]);
  const loading = selfData.loading || (termId ? schedules.loading : false) || termFetching;
  const unavailable = (selfData.error && !selfData.data) || (schedules.error && !published.length);

  return (
    <div>
      {unavailable && (
        <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 12 }}>
          University server unreachable — retrying…</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>Timetable</h1>
          <p style={{ fontSize: 14, color: 'var(--text-light)', margin: '4px 0 0' }}>
            {self
              ? `Semester ${self.semesterNo} \u2022 ${self.majorCode} \u2022 Section ${self.sectionName} \u2022 ${self.rollNo}`
              : 'Your weekly lecture and lab schedule'}
          </p>
        </div>
        {terms.data && terms.data.length > 0 && (
          <div className="relative">
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="appearance-none cursor-pointer"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 30px 8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--surface-border)',
                background: 'var(--divider)',
                color: 'var(--text)',
                outline: 'none',
              }}
            >
              {terms.data.map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.academicYear} {t.status === 'ACTIVE' ? '· Active' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-lighter)' }} />
          </div>
        )}
      </div>
      <div className="bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--surface)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
              Published Weekly Timetable {mine.length > 0 ? `(${mine.length} schedules)` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-xs" style={{ background: 'rgba(40,114,161,0.15)', color: 'var(--primary)', border: 'none' }}>Lecture</span>
            <span className="badge badge-xs" style={{ background: 'rgba(139,92,246,0.15)', color: '#7c3aed', border: 'none' }}>LMS</span>
            <span className="badge badge-xs" style={{ background: 'rgba(251,191,36,0.15)', color: '#d97706', border: 'none' }}>Assignment</span>
          </div>
        </div>
        <div style={{ padding: '18px' }}>
          {loading ? (
            <WeeklyGridSkeleton />
          ) : self && mine.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays size={32} className="mx-auto mb-3 opacity-30" />
              <p style={{ fontSize: 12.5, color: 'var(--text-lighter)', margin: 0 }}>
                No timetable published for your semester and major yet
              </p>
            </div>
          ) : self && mine.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(40,114,161,0.06)', borderBottom: '1px solid var(--surface)', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff', background: 'linear-gradient(var(--primary), var(--primary-dark))' }}>
                      {self.semesterNo}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                      {semesterTileLabel(self.semesterNo)}
                    </span>
                  </div>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.4px', color: 'var(--text)', textTransform: 'uppercase' }}>
                      Section {self.sectionName}
                    </span>
                    <span style={{ flex: '1 1 auto', height: 1, background: 'var(--surface)' }} />
                  </div>
                  <div style={{ border: '1px solid var(--surface)', borderRadius: 'var(--radius-md)', overflow: 'auto' }}>
                    <WeeklyTimetableGrid
                      schedules={mine}
                      editable={false}
                      asSingleCohort
                      periodLabels={periodLabels}
                      lunchLabel={lunchLabel}
                      todayIdx={todayIdx}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExamResultsSection() {
  const { user: session } = useSession();
  const me = session?.email ?? '';
  const socket = useSocket();

  const [results, setResults] = useState<ExamResultRecord[] | null>(null);
  const [viewer, setViewer] = useState<ExamResultRecord | null>(null);
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [termFilter, setTermFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/exam-results');
      const { results: fetched } = await res.json();
      const filtered = ((fetched ?? []) as ExamResultRecord[]).filter((doc) => {
        if (doc.batch_id) {
          return true;
        }
        return doc.batch_id === null;
      });
      setResults(filtered);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState only after await
    void load();
  }, [me, load]);

  useEffect(() => {
    if (!socket || !me) return;
    const onBatchUpdated = (data: unknown) => {
      const d = data as { id: string; status: string };
      if (d.id && d.status) {
        void load();
      }
    };
    socket.on(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, onBatchUpdated);
    return () => {
      socket.off(WS_EVENTS.EXAM_RESULT_BATCH_UPDATED, onBatchUpdated);
    };
  }, [socket, me, load]);

  const semesterOptions = useMemo(
    () => Array.from(new Set((results ?? []).map((r) => r.semester).filter(Boolean))),
    [results]
  );
  const termOptions = useMemo(
    () => Array.from(new Set((results ?? []).map((r) => r.exam_type ?? '').filter(Boolean))),
    [results]
  );

  const filteredList = useMemo(() => {
    if (!results) return null;
    return results.filter((r) => {
      const okSemester = semesterFilter === 'all' || r.semester === semesterFilter;
      const okTerm = termFilter === 'all' || (r.exam_type ?? '') === termFilter;
      return okSemester && okTerm;
    });
  }, [results, semesterFilter, termFilter]);

  const cleanTitle = (raw: string) =>
    raw.replace(/^\s*(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s*-?\s*/i, '')
      .trim() || raw;
  const semesterLabel = (s: string) => (/^semester\b/i.test(s) ? s : `Semester ${s}`);

  const grouped = useMemo(() => {
    type TermGroup = { term: string; latest: number; list: ExamResultRecord[] };
    type SemesterGroup = { semNo: number | null; semLabel: string; latest: number; terms: TermGroup[] };
    type YearGroup = { label: string; latest: number; semesters: SemesterGroup[] };
    const YEAR_NAMES = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];

    const years = new Map<number, Map<number | null, Map<string, ExamResultRecord[]>>>();
    for (const r of filteredList ?? []) {
      const semRaw = r.semester || '';
      const digits = semRaw.match(/(\d+)/);
      const parsed = Number(digits ? digits[1] ?? NaN : NaN);
      const semNo = Number.isFinite(parsed) && parsed >= 1 && parsed <= 8 ? parsed : null;
      const yearKey = semNo === null ? -1 : Math.ceil(semNo / 2);
      const term = r.exam_type || 'Exam Result';
      const bySem = years.get(yearKey) ?? new Map<number | null, Map<string, ExamResultRecord[]>>();
      const byTerm = bySem.get(semNo) ?? new Map<string, ExamResultRecord[]>();
      const arr = byTerm.get(term) ?? [];
      arr.push(r);
      byTerm.set(term, arr);
      bySem.set(semNo, byTerm);
      years.set(yearKey, bySem);
    }

    const yearGroups: YearGroup[] = [];
    for (const [yearKey, bySem] of years) {
      const semesters: SemesterGroup[] = [];
      for (const [semNo, byTerm] of bySem) {
        const terms: TermGroup[] = [...byTerm.entries()]
          .map(([term, list]) => ({ term, list: [...list].sort((a, b) => b.created_at - a.created_at) }))
          .map((g) => ({ ...g, latest: g.list.reduce((m, r) => Math.max(m, r.created_at), 0) }))
          .sort((a, b) => b.latest - a.latest);
        const latest = terms.reduce((m, t) => Math.max(m, t.latest), 0);
        const semLabel =
          semNo === null ? 'Unassigned semester'
            : semNo % 2 === 1 ? `First Semester (Sem ${semNo})`
              : `Second Semester (Sem ${semNo})`;
        semesters.push({ semNo, semLabel, latest, terms });
      }
      semesters.sort((a, b) => {
        if (a.semNo === null) return 1;
        if (b.semNo === null) return -1;
        return a.semNo - b.semNo;
      });
      const latest = semesters.reduce((m, s) => Math.max(m, s.latest), 0);
      const label = yearKey === -1 ? 'Unassigned' : YEAR_NAMES[yearKey - 1];
      yearGroups.push({ label, latest, semesters });
    }

    return yearGroups.sort((a, b) => {
      if (a.label === 'Unassigned') return 1;
      if (b.label === 'Unassigned') return -1;
      return YEAR_NAMES.indexOf(a.label) - YEAR_NAMES.indexOf(b.label);
    });
  }, [filteredList]);

  const downloadHref = (r: ExamResultRecord) =>
    `${r.file_url}${r.file_url.includes('?') ? '&' : '?'}download=${encodeURIComponent(r.file_name)}`;

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Exam Results</h1>
      <p style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 20 }}>
        {results && results.length > 0
          ? `${filteredList?.length ?? 0} published result${(filteredList?.length ?? 0) > 1 ? 's' : ''} — updates arrive in real time`
          : 'Your published examination results'}
      </p>

      {results !== null && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={14} style={{ color: 'var(--text-lighter)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-light)' }}>Filters:</span>
          </div>
          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--text)',
              background: 'var(--divider)',
              border: '1.5px solid var(--surface-border)',
              borderRadius: 'var(--radius-md)',
              outline: 'none',
            }}
          >
            <option value="all">All semesters</option>
            {semesterOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--text)',
              background: 'var(--divider)',
              border: '1.5px solid var(--surface-border)',
              borderRadius: 'var(--radius-md)',
              outline: 'none',
            }}
          >
            <option value="all">All terms</option>
            {termOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      {results === null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-base-100 backdrop-blur-xl p-5" style={cardStyle}>
              <div className="flex items-center gap-3">
                <div className="skeleton h-11 w-11 rounded-xl shrink-0" />
                <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton h-4 w-3/4" style={{ borderRadius: 6 }} />
                  <div className="skeleton h-3 w-1/2" style={{ borderRadius: 6 }} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <div className="skeleton h-8 w-24" style={{ borderRadius: 8 }} />
                <div className="skeleton h-8 w-28" style={{ borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {results !== null && results.length === 0 && (
        <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
          No exam results published yet — you will be notified the moment a result is released.
        </div>
      )}
      {results !== null && results.length > 0 && filteredList?.length === 0 && (
        <div className="bg-base-100 backdrop-blur-xl" style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-lighter)', fontSize: 14 }}>
          No results match the selected filters.
        </div>
      )}

      {grouped.map((year) => (
        <div key={year.label} className="mb-8">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <GraduationCap size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--accent)' }}>{year.label}</span>
            <span className="badge badge-primary badge-sm">
              {year.semesters.reduce((n, s) => n + s.terms.reduce((m, t) => m + t.list.length, 0), 0)} result{year.semesters.reduce((n, s) => n + s.terms.reduce((m, t) => m + t.list.length, 0), 0) > 1 ? 's' : ''}
            </span>
          </div>
          {year.semesters.map((sem, si) => (
            <div key={sem.semLabel} className="mt-5 pl-4" style={{ borderLeft: `2px solid ${si % 2 === 0 ? 'var(--secondary)' : 'var(--divider)'}`, marginLeft: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--accent)' }}>{sem.semLabel}</span>
                <span className="badge badge-ghost badge-sm">{sem.terms.reduce((n, t) => n + t.list.length, 0)}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-lighter)' }}>
                  Updated {new Date(sem.latest * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              {sem.terms.map((term) => (
                <div key={term.term} className="mt-4">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <FileText size={13} style={{ color: 'var(--text-light)' }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{term.term}</span>
                    <span className="badge badge-ghost badge-sm">{term.list.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {term.list.map((r) => (
                      <div
                        key={r.id}
                        className="bg-base-100 backdrop-blur-xl flex flex-col gap-4 p-5"
                        style={{
                          ...cardStyle,
                          background: 'linear-gradient(135deg, rgba(40,114,161,0.08), rgba(99,102,241,0.05))',
                          backdropFilter: 'blur(10px)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', boxShadow: '0 4px 14px rgba(35,96,138,0.35)' }}>
                            <FileText size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="truncate font-semibold" style={{ fontSize: 14, color: 'var(--accent)' }}>{cleanTitle(r.file_name)}</span>
                              <span className="badge badge-primary badge-sm shrink-0">{r.exam_type || 'Exam Result'}</span>
                            </div>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-lighter)' }}>
                              Roll No {r.roll_number} \u2022 Updated {new Date(r.created_at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setViewer(r)} className="btn btn-primary btn-xs gap-1.5 border-none text-white" style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))' }}>
                            <Eye size={13} /> View Result
                          </button>
                          <a href={downloadHref(r)} download={r.file_name} className="btn btn-ghost btn-xs gap-1.5" style={{ border: '1.5px solid var(--surface-border)' }}>
                            <Download size={13} /> Download PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {viewer && createPortal(
        <AnimatePresence>
          <motion.dialog
            open
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal modal-open z-[999] p-4 border-none"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            onClick={() => setViewer(null)}
            onCancel={(e) => { e.preventDefault(); setViewer(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="w-[94vw] max-w-3xl bg-base-100 rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-lg)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
                  <FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold text-sm" style={{ color: 'var(--accent)' }}>{cleanTitle(viewer.file_name)}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-lighter)' }}>
                    {semesterLabel(viewer.semester || '')} \u2022 Roll No {viewer.roll_number}
                  </div>
                </div>
                <button onClick={() => setViewer(null)} className="btn btn-ghost btn-circle btn-sm" title="Close">
                  <X size={16} />
                </button>
              </div>
              <iframe src={viewer.file_url} title={viewer.file_name} className="w-full" style={{ height: '68vh', border: 'none', background: '#fff' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--surface)' }}>
                <a href={downloadHref(viewer)} download={viewer.file_name} className="btn btn-primary gap-1.5 border-none text-white" style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))' }}>
                  <Download size={15} /> Download PDF
                </a>
                <button onClick={() => setViewer(null)} className="btn btn-ghost">Close</button>
              </div>
            </motion.div>
          </motion.dialog>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

interface ExamResultRecord {
  id: string;
  roll_number: string;
  year: string;
  semester: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  created_at: number;
  batch_id: string | null;
  exam_type: string | null;
}

export { default as EventsSection } from '@/components/shared/EventsSection';

export function LostFoundSection() {
  return <LostFoundPage />;
}

export function AnnouncementsSection() {
  return <AnnouncementsPage />;
}

export function SettingsSection() {
  const [settingsTab, setSettingsTab] = useState('Profile');
  const { user: session } = useSession();
  const { profile, loading } = useMyProfile();
  const me = session?.email ?? '';
  const name = profile?.name || session?.name || 'User';

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 20 }}>Manage your account and preferences</p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--surface)' }}>
        {['Profile', 'Security', 'Appearance', 'Notifications', 'Blocked'].map(t => (
          <button key={t} onClick={() => setSettingsTab(t)}
            style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: settingsTab === t ? 'var(--primary)' : 'var(--text-light)', cursor: 'pointer', borderBottom: '2.5px solid transparent', borderBottomColor: settingsTab === t ? 'var(--primary)' : 'transparent', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>{t}</button>
        ))}
      </div>
      {settingsTab === 'Profile' ? (
        <div className="bg-base-100 backdrop-blur-xl" style={cardStyle}>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--surface)' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(to bottom right, var(--secondary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: 'var(--primary)' }}>{initialsOf(name)}</div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{loading ? 'Loading...' : name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-lighter)', margin: '4px 0 0 0' }}>
                  {loading ? '' : profile?.kind === 'student' ? `Student • ${profile.major} • ${profile.rollNo}` : me}
                </p>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading profile...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Full Name</label>
                  <input type="text" defaultValue={name} readOnly style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--surface)', background: 'var(--surface-soft)', fontSize: 13, color: 'var(--text)', cursor: 'default' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Email Address</label>
                  <input type="email" defaultValue={me} readOnly style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--surface)', background: 'var(--surface-soft)', fontSize: 13, color: 'var(--text)', cursor: 'default' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Roll Number</label>
                  <input type="text" defaultValue={profile?.rollNo || ''} readOnly style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--surface)', background: 'var(--surface-soft)', fontSize: 13, color: 'var(--text)', cursor: 'default' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Phone Number</label>
                  <input type="text" defaultValue={profile?.phone || ''} readOnly style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--surface)', background: 'var(--surface-soft)', fontSize: 13, color: 'var(--text)', cursor: 'default' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : settingsTab === 'Security' ? (
        <div className="bg-base-100 backdrop-blur-xl" style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={16} /> Security</div>
          </div>
          <div style={{ padding: '16px 22px' }}>
            <SecuritySettings />
          </div>
        </div>
      ) : settingsTab === 'Appearance' ? (
        <div className="bg-base-100 backdrop-blur-xl" style={cardStyle}>
          <ThemeSwitcher bare />
        </div>
      ) : settingsTab === 'Notifications' ? (
        <NotificationSettings bare />
      ) : (
        <div className="bg-base-100 backdrop-blur-xl" style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}><Ban size={16} /> Blocked Users</div>
          </div>
          <div style={{ padding: '16px 22px' }}>
            <BlockedSection bare />
          </div>
        </div>
      )}
    </div>
  );
}
