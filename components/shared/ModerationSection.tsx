'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Check, X, Clock, History } from 'lucide-react';
import { usePendingPosts } from '@/lib/hooks';
import { toast } from 'sonner';
import PostTag from './PostTag';

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  const mins = Math.floor(diff / 60);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 24);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

type PostRow = {
  id: string;
  author_name: string;
  author_initials: string;
  author_role: string;
  content: string;
  image?: string | null;
  video_url?: string | null;
  tags: { label: string; color: string; emoji?: string }[];
  created_at: number;
  ai_flags?: string | null;
  moderation_note?: string | null;
  moderated_at?: number | null;
  status: string;
};

function parseTags(raw: unknown): { label: string; color: string; emoji?: string }[] {
  if (Array.isArray(raw)) return raw as { label: string; color: string; emoji?: string }[];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

export default function ModerationSection() {
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const { pending, removePending } = usePendingPosts();
  const [history, setHistory] = useState<PostRow[] | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/posts?status=approved&limit=50');
    const res2 = await fetch('/api/posts?status=rejected&limit=50');
    const approved = res.ok ? ((await res.json()).posts ?? []) : [];
    const rejected = res2.ok ? ((await res2.json()).posts ?? []) : [];
    const all = [...approved, ...rejected].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        Number(b.moderated_at ?? b.created_at) - Number(a.moderated_at ?? a.created_at)
    );
    setHistory(all.map((r) => ({ ...(r as PostRow), tags: parseTags((r as PostRow).tags) })));
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  const handleApprove = async (postId: string, authorName: string) => {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (res.ok) {
      toast.success(`Post by ${authorName} approved and published to the feed`);
      removePending(postId);
      void loadHistory();
    } else {
      const err = await res.json().catch(() => ({ message: 'Failed to approve post' }));
      toast.error(err.message || 'Failed to approve post');
    }
  };

  const handleReject = async (postId: string, authorName: string) => {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', moderationNote: note.trim() }),
    });
    if (res.ok) {
      toast.error(`Post by ${authorName} rejected`);
      setRejectingId(null);
      setNote('');
      removePending(postId);
      void loadHistory();
    } else {
      const err = await res.json().catch(() => ({ message: 'Failed to reject post' }));
      toast.error(err.message || 'Failed to reject post');
    }
  };

  const queue = pending as PostRow[] | null;

  const renderPost = (post: PostRow, showActions: boolean) => (
    <div key={post.id} className="mb-4 bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      <div className="flex items-center gap-3 px-5 pt-4">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: 12 }}>
          {post.author_initials}
        </div>
        <div className="flex-1">
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{post.author_name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-lighter)' }}>
            {post.author_role} {'\u2022'} {timeAgo(post.created_at * 1000)}
          </div>
        </div>
        {post.ai_flags && (
          <span className="badge badge-sm gap-1" style={{ background: 'rgba(251,191,36,0.14)', color: '#b45309' }}>
            AI: {post.ai_flags}
          </span>
        )}
        {post.status === 'approved' && (
          <span className="badge badge-sm gap-1" style={{ background: 'rgba(16,185,129,0.14)', color: '#059669' }}>
            <Check size={12} /> Approved
          </span>
        )}
        {post.status === 'rejected' && (
          <span className="badge badge-sm gap-1" style={{ background: 'rgba(239,68,68,0.14)', color: '#dc2626' }}>
            <X size={12} /> Rejected
          </span>
        )}
      </div>
      <div className="px-5 py-3" style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
        {post.content}
      </div>
      {post.image && (
        <div className="px-5 pb-2">
          <img src={post.image} alt="" className="rounded-xl w-full object-cover" style={{ maxHeight: 260, border: '1px solid var(--surface-border)' }} />
        </div>
      )}
      {post.video_url && (
        <div className="px-5 pb-2">
          <video src={post.video_url} controls playsInline className="rounded-xl w-full object-cover" style={{ maxHeight: 260, border: '1px solid var(--surface-border)' }} />
        </div>
      )}
      {post.tags.length > 0 && (
        <div className="flex gap-[6px] px-5 pb-3 flex-wrap">
          {post.tags.map((tag, i) => (
            <PostTag key={i} label={tag.label} emoji={tag.emoji} />
          ))}
        </div>
      )}
      {post.moderation_note && (
        <div className="px-5 pb-2 text-xs" style={{ color: 'var(--text-lighter)' }}>
          Note: {post.moderation_note}
        </div>
      )}
      {post.moderated_at && (
        <div className="px-5 pb-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-lighter)' }}>
          <Clock size={12} /> Moderated {formatTime(post.moderated_at)}
        </div>
      )}
      {showActions && (
        <div className="px-5 pb-4 pt-2" style={{ borderTop: '1px solid var(--surface)' }}>
          {rejectingId === post.id ? (
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for rejection (optional)..."
                className="flex-1 min-w-[200px] px-3 py-2 outline-none"
                style={{ fontSize: 13, color: 'var(--text)', background: 'var(--divider)', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--surface-border)' }}
              />
              <button
                onClick={() => handleReject(post.id, post.author_name)}
                className="btn btn-error btn-sm"
                disabled={!note.trim()}
              >
                Confirm Reject
              </button>
              <button onClick={() => { setRejectingId(null); setNote(''); }} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleApprove(post.id, post.author_name)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer border-none"
                style={{ borderRadius: 'var(--radius-sm)', background: 'linear-gradient(var(--success), #059669)', color: '#fff' }}
              >
                <Check size={14} /> Approve & Publish
              </button>
              <button
                onClick={() => { setRejectingId(post.id); setNote(''); }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer border-none"
                style={{ borderRadius: 'var(--radius-sm)', background: 'linear-gradient(var(--danger), #b91c1c)', color: '#fff' }}
              >
                <X size={14} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[860px] mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--accent)' }}>Moderation</h2>
      </div>

      <div className="flex gap-1 mb-5 bg-base-200 p-1 rounded-xl" style={{ border: '1px solid var(--surface-border)' }}>
        <button
          onClick={() => setTab('queue')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: tab === 'queue' ? 'var(--primary)' : 'transparent',
            color: tab === 'queue' ? '#fff' : 'var(--text-light)',
          }}
        >
          <ShieldCheck size={15} /> Queue
          {queue && queue.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full" style={{ background: tab === 'queue' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff' }}>
              {queue.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: tab === 'history' ? 'var(--primary)' : 'transparent',
            color: tab === 'history' ? '#fff' : 'var(--text-light)',
          }}
        >
          <History size={15} /> History
        </button>
      </div>

      {tab === 'queue' && (
        <>
          {!queue && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading...</div>
          )}
          {queue && queue.length === 0 && (
            <div
              className="bg-base-100 backdrop-blur-xl text-center py-16"
              style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)' }}
            >
              <ShieldCheck size={36} className="mx-auto mb-3 opacity-40" style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--text-light)' }}>No posts awaiting review</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-lighter)' }}>
                Lost &amp; Found posts that pass the AI content filter land here for approval
              </p>
            </div>
          )}
          {queue?.map((post) => renderPost(post, true))}
        </>
      )}

      {tab === 'history' && (
        <>
          {!history && (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--text-lighter)' }}>Loading...</div>
          )}
          {history && history.length === 0 && (
            <div
              className="bg-base-100 backdrop-blur-xl text-center py-16"
              style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)' }}
            >
              <History size={36} className="mx-auto mb-3 opacity-40" style={{ color: 'var(--text-lighter)' }} />
              <p className="text-sm" style={{ color: 'var(--text-light)' }}>No moderation history yet</p>
            </div>
          )}
          {history?.map((post) => renderPost(post, false))}
        </>
      )}
    </div>
  );
}