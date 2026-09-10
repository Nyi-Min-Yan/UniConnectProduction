'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Newspaper, BadgeCheck, Pencil, Trash2, Check, X, LogOut, ImageOff } from 'lucide-react';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';
import { normalizePost } from '@/lib/hooks';
import type { Post } from '@/lib/hooks';
import { usePostImageDownload } from '@/lib/usePostImage';
import PostImageDownload from './PostImageDownload';
import ImageLightbox from './ImageLightbox';
import { useSession } from './session';
import { toast } from 'sonner';
import { apiFetch, backendLogout } from './api';
import type { UserRecord, StaffRecord, StudentRecord } from './api';
import { positionLabel } from './useUniversityPeople';

type PostFilter = 'all' | 'approved' | 'pending_review' | 'rejected';

const POST_STATUS_META: Record<string, { label: string; badge: string; color: string }> = {
  approved: { label: 'Published', badge: 'badge-success', color: 'var(--success)' },
  pending_review: { label: 'Pending Review', badge: 'badge-warning', color: 'var(--warning)' },
  pending_ai: { label: 'AI Filtering', badge: 'badge-warning', color: 'var(--warning)' },
  rejected: { label: 'Rejected', badge: 'badge-error', color: 'var(--danger)' },
};

// "My Posts" is fetched without the multi-MB `image` column; images load
// lazily per post (see FeedPost.tsx PostImage for the rationale) so one slow
// image can't block the whole posts list.
function MyPostImage({ postId }: { postId: string }) {
  const { src, phase, progress, attemptsLeft } = usePostImageDownload(postId);
  const [showImage, setShowImage] = useState(false);

  if (phase === 'downloading' || phase === 'retrying') {
    return <PostImageDownload height={120} progress={progress} retrying={phase === 'retrying'} attemptsLeft={attemptsLeft} />;
  }
  if (phase === 'failed') {
    return (
      <div
        className="rounded-lg mt-2 w-full flex flex-col items-center justify-center gap-1"
        style={{ height: 120, background: 'var(--divider-soft)', border: '1px dashed var(--surface-border)', color: 'var(--text-lighter)', fontSize: 11.5 }}
      >
        <ImageOff size={16} />
        <span>Image unavailable</span>
      </div>
    );
  }
  if (phase === 'empty' || !src) return null;
  return (
    <>
      <img src={src} alt="" loading="lazy" onClick={() => setShowImage(true)} className="rounded-lg mt-2 w-full object-cover cursor-zoom-in transition-opacity duration-200 hover:opacity-90" style={{ maxHeight: 180 }} />
      {showImage && (
        <ImageLightbox
          open={showImage}
          onClose={() => setShowImage(false)}
          src={src}
          postId={postId}
        />
      )}
    </>
  );
}

const FILTERS: { id: PostFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Published' },
  { id: 'pending_review', label: 'Pending' },
  { id: 'rejected', label: 'Rejected' },
];

const MY_POST_STATUSES = ['approved', 'pending_review', 'pending_ai', 'rejected', 'pending'];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface BackendProfile {
  account: UserRecord | null;
  name: string;
  major: string;
  semester: string;
  rollNo: string;
  unit: string;
  phone: string;
  staffNo: string;
  positions: string[];
}

const EMPTY_PROFILE: BackendProfile = {
  account: null,
  name: '',
  major: '',
  semester: '',
  rollNo: '',
  unit: '',
  phone: '',
  staffNo: '',
  positions: [],
};

export default function ProfileSection() {
  const router = useRouter();
  const { user: session, refresh } = useSession();
  const socket = useSocket();
  const me = session?.email ?? '';

  const [myPosts, setMyPosts] = useState<Post[] | null>(null);
  const [filter, setFilter] = useState<PostFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await backendLogout();
      await refresh();
    } catch {
      // session clearing still proceeds on failure
    }
    router.replace('/');
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial posts load
    if (!me) { setMyPosts([]); return; }
    const load = async () => {
      try {
        const lists = await Promise.all(
          MY_POST_STATUSES.map(async (status) => {
            const res = await fetch(`/api/posts?author=${encodeURIComponent(me)}&status=${encodeURIComponent(status)}&limit=50`);
            const json = await res.json().catch(() => ({ posts: [] as Post[] }));
            return (json.posts ?? []) as Post[];
          })
        );
        const merged = lists.flat().sort((a, b) => b.created_at - a.created_at);
        setMyPosts(merged.map((p) => normalizePost(p as unknown as Record<string, unknown>)));
      } catch {
        setMyPosts((prev) => prev ?? []);
      }
    };
    void load();
  }, [me]);

  useEffect(() => {
    if (!socket) return;
    const qualifies = (row: Partial<Post>) => (row.author_email ?? '').toLowerCase() === me.toLowerCase();
    const onCreated = (data: unknown) => {
      const row = data as Partial<Post>;
      if (!row.id || !qualifies(row)) return;
      setMyPosts((prev) => {
        if (!prev) return prev;
        if (prev.some((p) => p.id === row.id)) return prev;
        return [...prev, row as Post].sort((a, b) => b.created_at - a.created_at);
      });
    };
    const onUpdated = (data: unknown) => {
      const row = data as Partial<Post>;
      if (!row.id || !qualifies(row)) return;
      setMyPosts((prev) => (prev ? prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setMyPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    };
    socket.on(WS_EVENTS.POST_CREATED, onCreated);
    socket.on(WS_EVENTS.POST_UPDATED, onUpdated);
    socket.on(WS_EVENTS.POST_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.POST_CREATED, onCreated);
      socket.off(WS_EVENTS.POST_UPDATED, onUpdated);
      socket.off(WS_EVENTS.POST_DELETED, onDeleted);
    };
  }, [socket, me]);

  const [profile, setProfile] = useState<BackendProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const account = await apiFetch<UserRecord>('/api/users/me');
      let name = '';
      let major = '';
      let semester = '';
      let rollNo = '';
      let unit = '';
      let phone = '';
      let staffNo = '';
      let positions: string[] = [];
      if (account.roleName === 'STUDENT') {
        const students = await apiFetch<StudentRecord[]>('/api/students');
        const mine = students.find((s) => s.email.toLowerCase() === me.toLowerCase());
        if (mine) {
          name = mine.studentName;
          major = mine.majorCode;
          rollNo = mine.rollNo;
          phone = mine.phoneNo || '';
          const year = Math.ceil(mine.semesterNo / 2);
          semester = `Semester ${mine.semesterNo} \u2022 ${year}${['st', 'nd', 'rd'][year - 1] || 'th'} Year`;
        }
      } else {
        const staff = await apiFetch<StaffRecord[]>('/api/staff');
        const mine = staff.find((s) => s.userId === account.userId);
        if (mine) {
          name = mine.staffName;
          unit = mine.unitName;
          phone = mine.phoneNo || '';
          staffNo = mine.staffNo;
          positions = mine.positions ?? [];
        }
      }
      setProfile({ account, name, major, semester, rollNo, unit, phone, staffNo, positions });
    } catch {
      // university server unreachable
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load profile on mount
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, approved: 0, pending_review: 0, rejected: 0 };
    for (const p of myPosts ?? []) {
      c.all += 1;
      if (c[p.status] !== undefined) c[p.status] += 1;
    }
    return c;
  }, [myPosts]);

  const visiblePosts = useMemo(() => {
    if (!myPosts) return null;
    if (filter === 'all') return myPosts;
    return myPosts.filter((p) => p.status === filter);
  }, [myPosts, filter]);

  const saveEdit = async (postId: string, content: string) => {
    const text = content.trim();
    if (!text) return;
    const current = myPosts?.find((p) => p.id === postId);
    if (current && current.content === text) {
      setEditingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Edit failed' }))).message);
      setMyPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, content: text, updated_at: Date.now() } : p)) ?? null);
      setEditingId(null);
      toast.success('Post updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update post');
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ message: 'Delete failed' }))).message);
      setMyPosts((prev) => prev?.filter((p) => p.id !== postId) ?? null);
      setConfirmingDelete(null);
      toast.success('Post deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete post');
    }
  };

  const iconBtn: React.CSSProperties = {
    padding: 4,
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-light)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    border: '1.5px solid',
    borderColor: active ? 'var(--primary)' : 'var(--surface-border)',
    background: active ? 'rgba(40, 114, 161,0.12)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-light)',
    cursor: 'pointer',
  });

  return (
    <div className="w-full">
      <div className="flex items-center gap-2.5 mb-5">
        <User size={20} style={{ color: 'var(--primary)' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>My Profile</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        <div className="bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', alignSelf: 'start' }}>
          <div className="flex flex-col items-center px-6 py-8" style={{ background: 'linear-gradient(160deg, rgba(40, 114, 161,0.12), transparent)' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center font-extrabold text-white mb-3" style={{ fontSize: 26, background: 'linear-gradient(to bottom right, #cbdde9, #9ecbe4)', color: '#1c4f73', boxShadow: '0 6px 18px rgba(40, 114, 161,0.25)' }}>
              {session?.initials || 'U'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
              {loading ? 'Loading...' : profile.name || session?.name || 'User'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-lighter)' }}>{me}</div>
            <div className="flex items-center gap-1 mt-3">
              <BadgeCheck size={14} style={{ color: 'var(--primary)' }} />
              <span className="badge badge-sm" style={{ background: 'rgba(40, 114, 161,0.12)', color: 'var(--primary)' }}>
                {profile.account?.roleName === 'SYSTEM_ADMIN' ? 'admin' : profile.account?.roleName ? profile.account.roleName.toLowerCase() : session?.role || ''}
              </span>
            </div>
          </div>
          <div className="px-6 py-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--surface)' }}>
            {(() => {
              const roleName = profile.account?.roleName;
              const status = profile.account ? (profile.account.isActive ? 'Active' : 'Inactive') : '—';
              const rows: [string, string][] =
                roleName === 'STUDENT'
                  ? [
                      ['Roll No', profile.rollNo || '—'],
                      ['Major', profile.major || '—'],
                      ['Semester', profile.semester || '—'],
                      ['Phone', profile.phone || '—'],
                      ['Status', status],
                    ]
                  : roleName === 'SYSTEM_ADMIN'
                    ? [
                        ['Staff No', profile.staffNo || '—'],
                        ['Phone', profile.phone || '—'],
                        ['Status', status],
                      ]
                    : [
                        ['Staff No', profile.staffNo || '—'],
                        ['Position', profile.positions.length > 0 ? positionLabel(profile.positions) : '—'],
                        ['Unit', profile.unit || '—'],
                        ['Phone', profile.phone || '—'],
                        ['Status', status],
                      ];
              return rows.map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-lighter)' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{v}</span>
                </div>
              ));
            })()}
          </div>
          <div className="px-6 pb-6" style={{ borderTop: '1px solid var(--surface)' }}>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 border-none font-semibold disabled:opacity-60"
              style={{ marginTop: 16, borderRadius: 'var(--radius-sm)', padding: '9px 16px', fontSize: 13, background: 'var(--danger)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.25)' }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {loggingOut ? (
                <>
                  <span className="loading loading-spinner loading-sm" /> Logging out...
                </>
              ) : (
                <>
                  <LogOut size={15} /> Logout
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div className="flex items-center gap-2 px-5 pt-4" style={{ borderBottom: '1px solid var(--surface)' }}>
            <Newspaper size={16} style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>My Posts</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--surface)' }}>
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={tabStyle(filter === f.id)}>
                {f.label} <span style={{ opacity: 0.75 }}>({counts[f.id]})</span>
              </button>
            ))}
          </div>

          {!myPosts && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading...</div>
          )}
          {myPosts && myPosts.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>
              You haven&apos;t posted anything yet.
            </div>
          )}
          {myPosts && myPosts.length > 0 && visiblePosts?.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-lighter)' }}>
              No posts in this filter.
            </div>
          )}
          {visiblePosts?.map((post) => {
            const meta = POST_STATUS_META[post.status] ?? POST_STATUS_META.pending_review;
            const editing = editingId === post.id;
            return (
              <div key={post.id} className="px-5 py-4" style={{ borderBottom: '1px solid var(--surface)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="badge badge-sm gap-1" style={{ background: meta.color, color: '#fff', border: 'none' }}>
                    {meta.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-lighter)' }}>{timeAgo(post.created_at * 1000)}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(post.id); setEditText(post.content ?? ''); setConfirmingDelete(null); }}
                      title="Edit post"
                      style={iconBtn}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-light)'; }}
                    >
                      <Pencil size={13} />
                    </button>
                    {confirmingDelete === post.id ? (
                      <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 600 }}>
                        <span style={{ color: 'var(--error)' }}>Delete?</span>
                        <button onClick={() => deletePost(post.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', fontWeight: 700, fontSize: 11 }}>
                          Yes
                        </button>
                        <button onClick={() => setConfirmingDelete(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-light)', fontWeight: 600, fontSize: 11 }}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setConfirmingDelete(post.id); setEditingId(null); }}
                        title="Delete post"
                        style={iconBtn}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-light)'; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {editing ? (
                  <div className="mt-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full outline-none p-3"
                      style={{ background: 'var(--divider)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => saveEdit(post.id, editText)}
                        disabled={!editText.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 font-semibold border-none disabled:opacity-40 cursor-pointer"
                        style={{ borderRadius: 'var(--radius-sm)', background: 'linear-gradient(var(--primary), var(--primary-dark))', color: '#fff', fontSize: 12 }}
                      >
                        <Check size={13} /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 font-semibold border-none cursor-pointer"
                        style={{ borderRadius: 'var(--radius-sm)', background: 'var(--divider)', color: 'var(--text-light)', fontSize: 12 }}
                      >
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm" style={{ color: 'var(--text)', lineHeight: 1.6 }}>{post.content}</p>
                    {post.image ? (
                      <img src={post.image} alt="" className="rounded-lg mt-2 w-full object-cover" style={{ maxHeight: 180 }} />
                    ) : (
                      <MyPostImage postId={post.id} />
                    )}
                    {post.status === 'rejected' && (
                      <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
                        {post.moderation_note ? `Reason: ${post.moderation_note}` : 'Rejected by moderation'}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
