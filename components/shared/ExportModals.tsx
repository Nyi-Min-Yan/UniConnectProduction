'use client';

import { useState } from 'react';
import { FileSpreadsheet, X, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  timetableCohorts,
  previewMatrix,
  cohortCourses,
  EXPORT_COLUMN_LABELS,
  type TimetableExportSchedule,
} from '@/lib/export/scheduleMatrix';
import type { RollCallHistoryResponse } from '@/components/shared/api';

async function downloadExport(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? 'Could not download the export. Please try again.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  if ('download' in HTMLAnchorElement.prototype && typeof document !== 'undefined') {
    const name = match?.[1] ?? 'export.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return name;
  }
  return match?.[1] ?? 'export.xlsx';
}

const cellBase: React.CSSProperties = {
  border: '1px solid var(--surface-border)',
  padding: '4px 6px',
  fontSize: 10.5,
  lineHeight: 1.3,
  verticalAlign: 'middle',
};

export function useXlsxDownload(): { busy: boolean; run: (url: string) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const run = async (url: string) => {
    setBusy(true);
    try {
      const name = await downloadExport(url);
      toast.success(`Excel downloaded as ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}

function ModalShell({ title, subtitle, onClose, footer, children }: ModalShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--surface-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '92vh',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--surface)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(34,197,94,0.14)',
                color: '#16a34a',
              }}
            >
              <FileSpreadsheet size={18} />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{subtitle}</div>}
            </div>
          </div>
          <button
            className="cursor-pointer"
            onClick={onClose}
            aria-label="Close export preview"
            style={{
              border: 'none',
              background: 'var(--divider)',
              color: 'var(--text-light)',
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>{children}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--surface)',
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timetable export preview
// ---------------------------------------------------------------------------

export function ExportTimetableModal({
  open,
  onClose,
  schedules,
  sourceLabel,
  downloadUrl,
}: {
  open: boolean;
  onClose: () => void;
  schedules: TimetableExportSchedule[];
  sourceLabel: string;
  downloadUrl: string;
}) {
  const { busy, run } = useXlsxDownload();
  if (!open) return null;

  const cohorts = timetableCohorts(schedules);

  return (
    <ModalShell
      title={`Export — ${sourceLabel}`}
      subtitle={`${cohorts.length} section ${cohorts.length === 1 ? 'sheet' : 'sheets'} · ${schedules.length} schedules · P1–P6 with LUNCH · merged multi-period sessions`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-ghost btn-sm cursor-pointer"
            onClick={onClose}
            disabled={busy}
            style={{ border: '1.5px solid var(--surface-border)' }}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm text-white border-none cursor-pointer"
            onClick={() => run(downloadUrl)}
            disabled={busy || cohorts.length === 0}
            style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))', minWidth: 140 }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {busy ? 'Exporting…' : 'Download Excel'}
          </button>
        </>
      }
    >
      {cohorts.length === 0 ? (
        <div className="py-10 text-center" style={{ fontSize: 13, color: 'var(--text-lighter)' }}>
          No schedules available to preview.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: 12,
            }}
          >
            <span className="badge" style={{ background: 'rgba(35,96,138,0.12)', color: 'var(--accent)', border: 'none', fontWeight: 700 }}>
              {cohorts.length} cohort sheet{cohorts.length > 1 ? 's' : ''}
            </span>
            <span className="badge" style={{ background: 'rgba(251,191,36,0.14)', color: '#b45309', border: 'none', fontWeight: 700 }}>
              Time columns 09:00–10:00 → 15:00–16:00
            </span>
            <span className="badge" style={{ background: 'rgba(139,92,246,0.14)', color: '#7c3aed', border: 'none', fontWeight: 700 }}>
              One sheet per section
            </span>
          </div>

          {cohorts.slice(0, 4).map((cohort) => {
            const rows = previewMatrix(cohort.items);
            const courses = cohortCourses(cohort.items);
            return (
              <div
                key={`${cohort.semesterNo}|${cohort.section}`}
                style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 14px',
                    background: 'rgba(40,114,161,0.06)',
                    borderBottom: '1px solid var(--surface)',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--accent)' }}>
                    Semester {cohort.semesterNo} — Section {cohort.section}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-lighter)' }}>
                    {cohort.items.length} sessions · {courses.length} courses
                  </span>
                </div>
                <div style={{ overflowX: 'auto', padding: 10 }}>
                  <table
                    style={{
                      borderCollapse: 'collapse',
                      minWidth: 720,
                      background: 'var(--surface-soft)',
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ ...cellBase, background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', textAlign: 'center', minWidth: 56 }}>
                          Day
                        </th>
                        {EXPORT_COLUMN_LABELS.map((h) => (
                          <th key={h} style={{ ...cellBase, background: h.startsWith('LUNCH') ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff', textAlign: 'center', minWidth: 92 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.rowLabel}>
                          <td
                            style={{
                              ...cellBase,
                              fontWeight: 700,
                              background: 'var(--divider)',
                              color: 'var(--accent)',
                              whiteSpace: 'nowrap',
                              textAlign: 'center',
                            }}
                          >
                            {r.rowLabel}
                          </td>
                          {r.cells.map((label, ci) => {
                            const isLunch = ci === 3;
                            return (
                              <td
                                key={ci}
                                style={{
                                  ...cellBase,
                                  textAlign: 'center',
                                  fontWeight: label && !isLunch ? 700 : 400,
                                  background: isLunch
                                    ? 'repeating-linear-gradient(45deg, var(--divider), var(--divider) 5px, var(--secondary-lighter) 5px, var(--secondary-lighter) 10px)'
                                    : label
                                      ? 'rgba(40,114,161,0.10)'
                                      : 'transparent',
                                  color: isLunch ? 'var(--text-lighter)' : label ? 'var(--primary)' : 'var(--text-lighter)',
                                  fontStyle: isLunch ? 'italic' : 'normal',
                                }}
                              >
                                {label ?? ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {courses.length > 0 && (
                  <div style={{ padding: '6px 14px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: 6 }}>
                      Courses &amp; Lecturers
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {courses.map((c) => (
                        <div key={`${c.code}:${c.type}`} style={{ fontSize: 11.5, color: 'var(--text)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.code || '—'}</span>
                          <span style={{ color: 'var(--text-light)' }}>{c.name}</span>
                          <span style={{ color: 'var(--text-lighter)' }}>{c.staff}</span>
                          <span style={{ color: 'var(--text-lighter)' }}>{c.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {cohorts.length > 4 && (
            <div className="text-center" style={{ fontSize: 12, color: 'var(--text-lighter)' }}>
              … and {cohorts.length - 4} more section sheet{cohorts.length - 4 > 1 ? 's' : ''} will be included in the Excel file.
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Roll Call attendance export preview
// ---------------------------------------------------------------------------

export function ExportAttendanceModal({
  open,
  onClose,
  data,
  downloadUrl,
}: {
  open: boolean;
  onClose: () => void;
  data: RollCallHistoryResponse | null;
  downloadUrl: string;
}) {
  const { busy, run } = useXlsxDownload();
  if (!open) return null;

  if (!data) {
    return (
      <ModalShell title="Export attendance" subtitle="Roll Call History" onClose={onClose} footer={<>
        <button className="btn btn-ghost btn-sm cursor-pointer" onClick={onClose} style={{ border: '1.5px solid var(--surface-border)' }}>Close</button>
      </>}>
        <div className="py-10 text-center" style={{ fontSize: 13, color: 'var(--text-lighter)' }}>
          No attendance data loaded — pick a course &amp; month first.
        </div>
      </ModalShell>
    );
  }

  const { schedule, sessions, students } = data;
  const withData = students.filter((s) => s.totalScheduledPeriods > 0);
  const avg = withData.length
    ? Math.round((withData.reduce((a, s) => a + s.attendancePercentage, 0) / withData.length) * 100) / 100
    : 0;

  return (
    <ModalShell
      title={`Export attendance — ${schedule.courseCode ?? ''}`}
      subtitle={`${schedule.semesterNo != null ? `Semester ${schedule.semesterNo} · ` : ''}${schedule.sectionNames.join(' + ') || 'All sections'} · ${sessions.length} sessions · ${students.length} students`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-ghost btn-sm cursor-pointer"
            onClick={onClose}
            disabled={busy}
            style={{ border: '1.5px solid var(--surface-border)' }}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm text-white border-none cursor-pointer"
            onClick={() => run(downloadUrl)}
            disabled={busy || students.length === 0}
            style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))', minWidth: 140 }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {busy ? 'Exporting…' : 'Download Excel'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, marginBottom: 14 }}>
        <span className="badge" style={{ background: 'rgba(35,96,138,0.12)', color: 'var(--accent)', border: 'none', fontWeight: 700 }}>
          {schedule.courseCode}{schedule.courseName ? ` · ${schedule.courseName}` : ''}
        </span>
        <span className="badge badge-xs">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        <span className="badge badge-xs">{students.length} student{students.length !== 1 ? 's' : ''}</span>
        <span className="badge badge-xs">
          {sessions.reduce((a, s) => a + s.scheduledPeriods, 0)} scheduled periods
        </span>
        <span className="badge badge-xs" style={{ color: avg >= 75 ? '#16a34a' : '#b45309' }}>
          Avg attendance {avg.toFixed(2)}%
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)' }}>
        <table className="table table-sm w-full" style={{ minWidth: 460 + sessions.length * 72, fontSize: 11.5 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>Student</th>
              {sessions.map((s) => (
                <th key={s.sessionId} className="text-center">
                  <div>{new Date(s.sessionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div>{new Date(s.sessionDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}</div>
                </th>
              ))}
              <th className="text-center">Total</th>
              <th className="text-center">%</th>
            </tr>
          </thead>
          <tbody>
            {students.slice(0, 25).map((st) => (
              <tr key={st.studentId}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)' }}>
                  <span style={{ fontWeight: 700 }}>{st.studentName}</span>{' '}
                  <span style={{ color: 'var(--text-lighter)', fontSize: 10.5 }}>{st.rollNo}</span>
                </td>
                {st.attendance.map((cell, ci) => (
                  <td
                    key={sessions[ci]?.sessionId ?? ci}
                    className="text-center"
                    style={{
                      color:
                        cell.status === 'PRESENT' ? '#16a34a'
                        : cell.status === 'ABSENT' ? 'var(--danger)'
                        : 'var(--text-lighter)',
                      fontWeight: cell.status ? 700 : 400,
                      background:
                        cell.status === 'PRESENT' ? 'rgba(34,197,94,0.08)'
                        : cell.status === 'ABSENT' ? 'rgba(239,68,68,0.06)'
                        : 'transparent',
                    }}
                  >
                    {cell.status === 'PRESENT'
                      ? cell.attendedPeriods != null && cell.scheduledPeriods != null && cell.attendedPeriods < cell.scheduledPeriods
                        ? `${cell.attendedPeriods}/${cell.scheduledPeriods}`
                        : 'P'
                      : cell.status === 'ABSENT' ? 'A' : '—'}
                  </td>
                ))}
                <td className="text-center" style={{ fontWeight: 700 }}>
                  {st.totalAttendedPeriods}/{st.totalScheduledPeriods}
                </td>
                <td className="text-center" style={{ fontWeight: 700, color: st.attendancePercentage >= 75 ? '#16a34a' : '#b45309' }}>
                  {st.attendancePercentage.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length > 25 && (
          <div className="px-3 py-2" style={{ fontSize: 11.5, color: 'var(--text-lighter)', borderTop: '1px solid var(--surface)' }}>
            Showing 25 of {students.length} students — the Excel file includes every student and session.
          </div>
        )}
      </div>
    </ModalShell>
  );
}