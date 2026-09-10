'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Ban, Clapperboard, MessageSquare, Newspaper, Play, RotateCcw, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';
import { normalizePost, type Post, type Activity } from '@/lib/hooks';
import { useSession } from './session';
import FeedPost from './FeedPost';
import { useUniversityPeople, useUniversityRaw } from './useUniversityPeople';
import { positionLabel } from './useUniversityPeople';
import { toast } from 'sonner';

type ConvStatus = 'pending' | 'active' | 'blocked';

interface PersonConvRow {
  id: string;
  participant_ids: string[];
  status: ConvStatus;
  blocked_by: string | null;
  requested_by: string | null;
}

interface PersonDetail {
  rollNo: string;
  major: string;
  semester: string;
  unit: string;
  phone: string;
  staffNo: string;
  positions: string[];
  isActive: boolean;
}

const EMPTY_DETAIL: PersonDetail = { rollNo: '', major: '', semester: '', unit: '', phone: '', staffNo: '', positions: [], isActive: true };

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function PersonProfileSection({ email }: { email: string }) {
  const router = useRouter();
  const { user: session } = useSession();
  const me = session?.email ?? '';
  const { people, loading: peopleLoading } = useUniversityPeople();
  const { users, students, staff, loading: rawLoading } = useUniversityRaw();
  const socket = useSocket();

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [detail, setDetail] = useState<PersonDetail>(EMPTY_DETAIL);
  const [convId, setConvId] = useState<string | null>(null);
  const [convStatus, setConvStatus] = useState<ConvStatus | null>(null);
  const [blockedBy, setBlockedBy] = useState('');
  const [busy, setBusy] = useState(false);

  const person = people.find((p) => p.email.toLowerCase() === email.toLowerCase());
  const isSelf = !!me && !!person && person.email.toLowerCase() === me.toLowerCase();
  const isBlockedByMe = convStatus === 'blocked' && blockedBy === me;

  useEffect(() => {
    if (!socket || !convId) return;
    const onBlocked = (data: { conversationId: string; blockedBy: string }) => {
      if (data.conversationId === convId) {
        setConvStatus('blocked');
        setBlockedBy(data.blockedBy);
        toast.success(data.blockedBy === me ? 'You blocked this user' : 'You have been blocked');
      }
    };
    const onUnblocked = (data: { conversationId: string; unblockedBy: string }) => {
      if (data.conversationId === convId) {
        setConvStatus('active');
        setBlockedBy('');
        toast.success(data.unblockedBy === me ? 'You unblocked this user' : 'You have been unblocked');
      }
    };
    socket.on(WS_EVENTS.CONVERSATION_BLOCKED, onBlocked);
    socket.on(WS_EVENTS.CONVERSATION_UNBLOCKED, onUnblocked);
    return () => {
      socket.off(WS_EVENTS.CONVERSATION_BLOCKED, onBlocked);
      socket.off(WS_EVENTS.CONVERSATION_UNBLOCKED, onUnblocked);
    };
  }, [socket, convId, me]);

  useEffect(() => {
    if (!email) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/posts?status=approved&author=${encodeURIComponent(email)}`);
        const json = await res.json();
        setPosts((json.posts ?? []).map((p: Record<string, unknown>) => normalizePost(p)) as Post[]);
      } catch {
        setPosts([]);
      }
    };
    void load();
  }, [email]);

  useEffect(() => {
    if (!socket) return;
    const qualifies = (row: Partial<Post>) => (row.author_email ?? '').toLowerCase() === email.toLowerCase();
    const onCreated = (data: unknown) => {
      const row = data as Partial<Post>;
      if (!row.id || !qualifies(row)) return;
      setPosts((prev) => {
        if (!prev) return prev;
        if (prev.some((p) => p.id === row.id)) return prev;
        return [normalizePost(row as unknown as Record<string, unknown>) as Post, ...prev];
      });
    };
    const onUpdated = (data: unknown) => {
      const row = data as Partial<Post>;
      if (!row.id || !qualifies(row)) return;
      setPosts((prev) => (prev ? prev.map((p) => (p.id === row.id ? normalizePost({ ...p, ...row }) : p)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    };
    socket.on(WS_EVENTS.POST_CREATED, onCreated);
    socket.on(WS_EVENTS.POST_UPDATED, onUpdated);
    socket.on(WS_EVENTS.POST_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.POST_CREATED, onCreated);
      socket.off(WS_EVENTS.POST_UPDATED, onUpdated);
      socket.off(WS_EVENTS.POST_DELETED, onDeleted);
    };
  }, [socket, email]);

  useEffect(() => {
    if (!email) return;
    const load = async () => {
      try {
        const res = await fetch('/api/activities?limit=30');
        const json = await res.json();
        const filtered = (json.activities ?? []).filter((a: Activity) => (a.author_email ?? '').toLowerCase() === email.toLowerCase());
        setActivities(filtered);
      } catch {
        setActivities([]);
      }
    };
    void load();
  }, [email]);

  useEffect(() => {
    if (!socket) return;
    const qualifies = (row: Partial<Activity>) => (row.author_email ?? '').toLowerCase() === email.toLowerCase();
    const onCreated = (data: unknown) => {
      const row = data as Partial<Activity>;
      if (!row.id || !qualifies(row)) return;
      setActivities((prev) => {
        if (!prev) return prev;
        if (prev.some((a) => a.id === row.id)) return prev;
        return [row as Activity, ...prev];
      });
    };
    const onUpdated = (data: unknown) => {
      const row = data as Partial<Activity>;
      if (!row.id || !qualifies(row)) return;
      setActivities((prev) => (prev ? prev.map((a) => (a.id === row.id ? { ...a, ...row } : a)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setActivities((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    };
    socket.on(WS_EVENTS.ACTIVITY_CREATED, onCreated);
    socket.on(WS_EVENTS.ACTIVITY_UPDATED, onUpdated);
    socket.on(WS_EVENTS.ACTIVITY_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.ACTIVITY_CREATED, onCreated);
      socket.off(WS_EVENTS.ACTIVITY_UPDATED, onUpdated);
      socket.off(WS_EVENTS.ACTIVITY_DELETED, onDeleted);
    };
  }, [socket, email]);

  const loadDetail = useCallback(async () => {
    if (!email || rawLoading) return;
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) return;
    if (u.roleName === 'STUDENT') {
      const s = students.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (s) {
        const year = Math.ceil(s.semesterNo / 2);
        setDetail({
          rollNo: s.rollNo,
          major: s.majorCode,
          semester: `Semester ${s.semesterNo} \u2022 ${year}${['st', 'nd', 'rd'][year - 1] || 'th'} Year`,
          unit: '',
          phone: s.phoneNo || '',
          staffNo: '',
          positions: [],
          isActive: u.isActive,
        });
      }
    } else {
      const s = staff.find((x) => x.userId === u.userId);
      setDetail({ rollNo: '', major: '', semester: '', unit: s?.unitName ?? '', phone: s?.phoneNo || '', staffNo: s?.staffNo ?? '', positions: s?.positions ?? [], isActive: u.isActive });
    }
  }, [email, rawLoading, users, students, staff]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load person details on mount
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!me || !email || me.toLowerCase() === email.toLowerCase()) return;
    const load = async () => {
      const res = await fetch('/api/conversations');
      const json = await res.json();
      const docs = (json.conversations ?? []) as PersonConvRow[];
      const conv = docs.find(
        (c) => parseIds(c.participant_ids).length === 2 && parseIds(c.participant_ids).includes(email.toLowerCase()),
      );
      if (conv) {
        setConvId(conv.id);
        setConvStatus(conv.status);
        setBlockedBy(conv.blocked_by || '');
      } else {
        setConvId(null);
        setConvStatus(null);
        setBlockedBy('');
      }
    };
    void load();
  }, [me, email]);

  const [backPath] = useState(() => {
    const role = session?.role ?? 'student';
    if (typeof window === 'undefined') return `/${role}/feed`;
    const params = new URLSearchParams(window.location.search);
    if (params.get('back') === 'activity') {
      const activityId = params.get('activity');
      return `/${role}/activity${activityId ? `?activity=${activityId}` : ''}`;
    }
    return `/${role}/feed`;
  });
  const roleKey = person?.role.toLowerCase() ?? '';
  const avatarGradient =
    roleKey === 'student' ? 'from-info to-info/70' :
    roleKey === 'staff' ? 'from-success to-success/70' : 'from-primary to-secondary';

  const targetUser = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  const roleName = targetUser?.roleName;
  const statusValue = targetUser ? (targetUser.isActive ? 'Active' : 'Inactive') : '';
  const detailRows = ((
    roleName === 'STUDENT'
      ? [
          ['Roll No', detail.rollNo],
          ['Major', detail.major],
          ['Semester', detail.semester],
          ['Phone', detail.phone],
          ['Status', statusValue],
        ]
      : roleName === 'SYSTEM_ADMIN'
        ? [
            ['Staff No', detail.staffNo],
            ['Phone', detail.phone],
            ['Status', statusValue],
          ]
        : [
            ['Staff No', detail.staffNo],
            ['Position', detail.positions.length > 0 ? positionLabel(detail.positions) : ''],
            ['Unit', detail.unit],
            ['Phone', detail.phone],
            ['Status', statusValue],
          ]
  ).filter(([, v]) => v) as [string, string][]);

  const messagePerson = async () => {
    if (!person || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherEmail: person.email, otherName: person.name, otherInitials: person.initials }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Could not start conversation' }))).message);
      const { conversationId } = await res.json();
      router.push(`/${session?.role ?? 'student'}/messages?conv=${conversationId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start conversation');
    } finally {
      setBusy(false);
    }
  };

  const blockOrUnblock = async () => {
    if (!person || busy || !me) return;
    setBusy(true);
    try {
      let id = convId;
      if (!id) {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otherEmail: person.email, otherName: person.name, otherInitials: person.initials }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Could not start conversation' }))).message);
        id = (await res.json()).conversationId;
      }
      const action = isBlockedByMe ? 'unblock' : 'block';
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Action failed' }))).message);
      toast.success(action === 'block' ? `${person.name} blocked` : `${person.name} unblocked`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (peopleLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="max-w-[760px] mx-auto text-center py-16">
        <User size={40} style={{ color: 'var(--text-lighter)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>User not found</div>
        <div style={{ fontSize: 13, color: 'var(--text-lighter)', marginTop: 4 }}>{email}</div>
        <Link
          href={backPath}
          className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-lg no-underline cursor-pointer"
          style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))', color: '#fff', fontSize: 13, fontWeight: 600 }}
        >
          <ArrowLeft size={14} /> Back to Feed
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto">
      <Link
        href={backPath}
        className="inline-flex items-center gap-1.5 mb-4 no-underline"
        style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' }}
      >
        <ArrowLeft size={14} /> Back to Feed
      </Link>

      <div className="bg-base-100 backdrop-blur-xl mb-4" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-7" style={{ background: 'linear-gradient(160deg, rgba(40, 114, 161,0.12), transparent)' }}>
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-white font-extrabold shrink-0 bg-gradient-to-br ${avatarGradient}`}
            style={{ fontSize: 26, boxShadow: '0 6px 18px rgba(40, 114, 161,0.25)' }}
          >
            {person.initials}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--accent)' }}>{person.name}</span>
              <BadgeCheck size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-lighter)' }}>{person.email}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="badge badge-sm" style={{ background: 'rgba(40, 114, 161,0.12)', color: 'var(--primary)' }}>{person.role}</span>
              {person.sub && <span style={{ fontSize: 11.5, color: 'var(--text-light)' }}>{person.sub}</span>}
            </div>
          </div>
          {!isSelf && (
            <div className="flex flex-row sm:flex-col items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={messagePerson}
                disabled={busy}
                className="btn btn-primary btn-sm w-full"
                style={{ borderRadius: 'var(--radius-md)', minWidth: 110 }}
              >
                {busy ? <span className="loading loading-spinner loading-xs" /> : <MessageSquare size={14} />}
                Message
              </button>
              {isBlockedByMe ? (
                <button
                  type="button"
                  onClick={blockOrUnblock}
                  disabled={busy}
                  className="btn btn-outline btn-sm w-full"
                  style={{ borderRadius: 'var(--radius-md)', minWidth: 110 }}
                >
                  {busy ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw size={14} />}
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={blockOrUnblock}
                  disabled={busy}
                  className="btn btn-sm w-full"
                  style={{ borderRadius: 'var(--radius-md)', minWidth: 110, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}
                >
                  {busy ? <span className="loading loading-spinner loading-xs" /> : <Ban size={14} />}
                  Block
                </button>
              )}
              {convStatus === 'blocked' && blockedBy && blockedBy !== me && (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--danger)' }}>Blocked you</span>
              )}
            </div>
          )}
        </div>
        {detailRows.length > 0 && (
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5" style={{ borderTop: '1px solid var(--surface)' }}>
            {detailRows.map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-lighter)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--surface)' }}>
          <Newspaper size={16} style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>Published Posts</div>
          {posts && <span className="text-xs" style={{ color: 'var(--text-lighter)' }}>({posts.length})</span>}
        </div>
        {!posts && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading posts...</div>
        )}
        {posts && posts.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>
            No published posts yet.
          </div>
        )}
        {posts?.map((post) => (
          <div key={post.id} style={{ borderBottom: '1px solid var(--surface)' }}>
            <FeedPost post={post} />
          </div>
        ))}
      </div>

      <div className="bg-base-100 backdrop-blur-xl mt-4" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--surface)' }}>
          <Clapperboard size={16} style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>Activities</div>
          {activities && <span className="text-xs" style={{ color: 'var(--text-lighter)' }}>({activities.length})</span>}
        </div>
        {!activities && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading activities...</div>
        )}
        {activities && activities.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>
            No activities yet.
          </div>
        )}
        {activities && activities.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
            {activities.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => router.push(`/${session?.role ?? 'student'}/activity?activity=${a.id}`)}
                className="group relative aspect-video w-full overflow-hidden cursor-pointer text-left"
                style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', background: 'var(--surface)' }}
                title={a.caption || undefined}
              >
                {a.kind === 'video' && a.media_url && (
                  <>
                    <video src={a.media_url} muted preload="metadata" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
                      <Play size={22} fill="#fff" color="#fff" />
                    </span>
                  </>
                )}
                {a.kind === 'photo' && a.media_url && (
                  <img src={a.media_url} alt={a.caption || 'Activity photo'} loading="lazy" className="w-full h-full object-cover" />
                )}
                {(a.kind === 'text' || !a.media_url) && (
                  <span className="absolute inset-0 p-2.5 text-xs leading-snug overflow-hidden" style={{ color: 'var(--text-light)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {a.caption}
                  </span>
                )}
                {a.kind !== 'text' && a.caption && (
                  <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5 text-[10.5px] text-white truncate" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }}>
                    {a.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
