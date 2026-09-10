'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Download, X, Loader2 } from 'lucide-react';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';
import { useUniversityRaw, initialsOf } from './useUniversityPeople';
import type { StudentRecord } from './api';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: number;
  category: string;
  max_attendees: number | null;
  image_url: string | null;
  visibility: string;
  created_by: string;
  created_by_name: string;
  created_at: number;
}

interface RosterEntry {
  id: string;
  user_email: string;
  user_name: string;
  created_at: number;
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export default function EventRosterModal({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const { students } = useUniversityRaw();
  const [entries, setEntries] = useState<RosterEntry[] | null>(null);
  const [search, setSearch] = useState('');

  const studentsByEmail = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    for (const s of students) map.set(s.email.toLowerCase(), s);
    return map;
  }, [students]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/register`);
        if (!res.ok) throw new Error('Failed to fetch registrations');
        const json = await res.json();
        const docs = (json.documents ?? []) as RosterEntry[];
        if (!cancelled) setEntries(docs);
      } catch (error) {
        console.error('Roster fetch error:', error);
        if (!cancelled) setEntries([]);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [event.id]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onRegister = (data: unknown) => {
      const d = data as { event_id?: string; user_email?: string; user_name?: string; created_at?: number };
      if (!d.event_id || d.event_id !== event.id || !d.user_email) return;
      setEntries((prev) => {
        if (!prev) return prev;
        const email = d.user_email ?? '';
        if (prev.some((e) => e.user_email.toLowerCase() === email.toLowerCase())) return prev;
        return [{ id: `${event.id}:${email}`, user_email: email, user_name: d.user_name ?? email, created_at: d.created_at ?? Date.now() }, ...prev];
      });
    };
    const onUnregister = (data: unknown) => {
      const d = data as { event_id?: string; user_email?: string };
      if (!d.event_id || d.event_id !== event.id || !d.user_email) return;
      const email = d.user_email ?? '';
      setEntries((prev) => (prev ? prev.filter((e) => e.user_email.toLowerCase() !== email.toLowerCase()) : prev));
    };
    socket.on(WS_EVENTS.EVENT_REGISTRATION, onRegister);
    socket.on(WS_EVENTS.EVENT_UNREGISTRATION, onUnregister);
    return () => {
      socket.off(WS_EVENTS.EVENT_REGISTRATION, onRegister);
      socket.off(WS_EVENTS.EVENT_UNREGISTRATION, onUnregister);
    };
  }, [socket, event.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entries ?? [];
    if (!q) return list;
    return list.filter((e) => {
      const student = studentsByEmail.get(e.user_email.toLowerCase());
      const hay = [e.user_name, e.user_email, student?.studentName ?? '', student?.rollNo ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, search, studentsByEmail]);

  const exportCsv = () => {
    if (!entries || entries.length === 0) return;
    const header = ['Name', 'Email', 'Roll Number', 'Department / Section', 'Semester', 'Registered At'];
    const rows = entries.map((e) => {
      const s = studentsByEmail.get(e.user_email.toLowerCase());
      return [
        e.user_name,
        e.user_email,
        s?.rollNo ?? '',
        s ? `${s.majorCode} • ${s.sectionName}` : '',
        s ? `Semester ${s.semesterNo}` : '',
        formatDate(e.created_at),
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9]+/gi, '_')}_registrants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <dialog
      id="event_roster_modal"
      className="modal modal-open z-[999]"
      open
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <div className="modal-box w-[94vw] max-w-3xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-lg)', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--surface)', gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: '#fff' }}>
              <Users size={16} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold" style={{ color: 'var(--accent)', fontSize: 15 }}>{event.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{formatDate(event.event_date)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-primary badge-sm">{entries?.length ?? 0} Registrant{entries?.length === 1 ? '' : 's'}</span>
            <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--surface)', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Search size={15} style={{ color: 'var(--text-lighter)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or roll no..."
              className="input input-sm"
              style={{ width: '100%', fontSize: 12.5, background: 'var(--secondary-lighter)', borderColor: 'var(--secondary)' }}
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={!entries || entries.length === 0}
            className="btn btn-sm gap-1.5 border-none text-white"
            style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))', opacity: !entries || entries.length === 0 ? 0.5 : 1 }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>

        {entries === null && (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-lighter)' }}>
            <Loader2 size={20} className="animate-spin mb-2" />
            <span className="text-sm">Loading registrants...</span>
          </div>
        )}

        {entries !== null && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Users size={30} style={{ color: 'var(--text-lighter)', opacity: 0.5, marginBottom: 10 }} />
            <p className="text-sm" style={{ color: 'var(--text-lighter)' }}>No students have registered for this event yet.</p>
          </div>
        )}

        {entries !== null && entries.length > 0 && (
          <>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <p className="text-sm" style={{ color: 'var(--text-lighter)' }}>No registrants match your search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      {['Student', 'Email', 'Roll No', 'Department / Semester', 'Registered At'].map((h) => (
                        <th key={h} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-light)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => {
                      const student = studentsByEmail.get(e.user_email.toLowerCase());
                      const name = student?.studentName || e.user_name;
                      return (
                        <tr key={e.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: 11 }}>
                                {initialsOf(name)}
                              </span>
                              <span className="font-semibold truncate" style={{ color: 'var(--accent)', maxWidth: 180 }}>{name}</span>
                            </div>
                          </td>
                          <td><span className="truncate" style={{ maxWidth: 200, fontSize: 12.5 }}>{e.user_email}</span></td>
                          <td>
                            {student?.rollNo ? (
                              <code style={{ background: 'var(--divider-soft)', padding: '3px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 600 }}>{student.rollNo}</code>
                            ) : (
                              <span style={{ color: 'var(--text-lighter)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td>
                            {student ? (
                              <span className="block truncate" style={{ maxWidth: 180, fontSize: 12.5 }}>{student.majorCode} • Semester {student.semesterNo}</span>
                            ) : (
                              <span style={{ color: 'var(--text-lighter)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12.5, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>{formatDate(e.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}