'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentStaff } from '@/components/shared/api';
import type { StaffRecord } from '@/components/shared/api';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';

export interface ParticipantMeta {
  email: string;
  name: string;
  initials: string;
}

export interface Post {
  id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  author_role: string;
  content: string | null;
  image: string | null;
  images: string[] | null;
  video_url: string | null;
  tags: unknown;
  status: string;
  ai_flags: unknown;
  moderation_note: string | null;
  created_at: number;
  updated_at: number | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  item_status: string | null;
  item_location: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  content: string;
  created_at: number;
  updated_at: number | null;
  deleted_at: number | null;
}

export interface Conversation {
  id: string;
  participant_ids: string[];
  status: string;
  requested_by: string | null;
  blocked_by: string | null;
  participant_meta: ParticipantMeta[];
  created_at: number;
  last_message_at: number;
  preview: string | null;
  unread_map: Record<string, number>;
  hidden_map: Record<string, boolean>;
}

export interface ChatMessage {
  id: string;
  conversation_id: string | null;
  sender_id: string | null;
  recipient_id: string | null;
  recipient_email: string | null;
  sender_email: string;
  sender_name: string;
  content: string | null;
  attachments: unknown;
  mentions: unknown;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  roll_number: string | null;
  created_at: number;
  is_read: number;
}

export interface Notification {
  id: string;
  recipient_email: string | null;
  recipient_role: string | null;
  type: string;
  message: string;
  read: number;
  created_at: number;
  post_id: string | null;
  activity_id: string | null;
  conversation_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
}

export interface ConvMeta {
  id: string;
  status: string;
  requestedBy: string;
  blockedBy: string;
  lastMessageAt: number;
  preview: string;
  unread: number;
  other: { email: string; name: string; initials: string };
}

export interface ChatMeta {
  id: string;
  status: string;
  requestedBy: string;
  blockedBy: string;
  other: { email: string; name: string; initials: string };
}

export interface Activity {
  id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  author_role: string;
  kind: string;
  caption: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  created_at: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
}

export interface ActivityComment {
  id: string;
  activity_id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  content: string;
  created_at: number;
  updated_at: number | null;
}

interface EventRegistration {
  id: string;
  event_id: string;
  user_email: string;
  user_name: string;
  created_at: number;
}

let channelSeq = 0;
export function uniqueChannelName(base: string): string {
  channelSeq += 1;
  return `${base}:${channelSeq}`;
}

const FEED_PAGE_SIZE = 10;
const PENDING_STATUSES = ['pending', 'pending_review'];

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { message?: string; error?: string }));
    throw new Error(err.message || err.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function parseTags(value: unknown): { label?: string; color?: string; emoji?: string }[] {
  if (Array.isArray(value)) return value as { label?: string; color?: string; emoji?: string }[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as { label?: string }[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseImages(value: unknown): string[] | null {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizePost(p: Record<string, unknown>): Post {
  return {
    ...(p as unknown as Post),
    tags: parseTags(p.tags),
    images: p.images !== undefined && p.images !== null ? parseImages(p.images) : null,
    likes_count: (p.likes_count as number) ?? 0,
    comments_count: (p.comments_count as number) ?? 0,
    shares_count: (p.shares_count as number) ?? 0,
  };
}

const normalizeTag = (s: string) => s.replace(/^#/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

function postHasTag(p: { tags?: unknown; content?: string | null }, aliases: string[]): boolean {
  const tags = parseTags(p.tags);
  if (tags.some((t) => aliases.includes(normalizeTag(t.label ?? '')))) return true;
  if (p.content) {
    for (const m of p.content.matchAll(/#[\w&]+/gi)) {
      if (aliases.includes(normalizeTag(m[0]))) return true;
    }
  }
  return false;
}

function enrichConvs(rows: Record<string, unknown>[], me: string): ConvMeta[] {
  return rows
    .map((conv) => {
      const ids = JSON.parse((conv.participant_ids as string) || '[]') as string[];
      const meta: ParticipantMeta[] =
        typeof conv.participant_meta === 'string'
          ? (JSON.parse(conv.participant_meta || '[]') as ParticipantMeta[])
          : Array.isArray(conv.participant_meta)
            ? (conv.participant_meta as ParticipantMeta[])
            : [];
      const otherEmail = ids.find((p) => p !== me) || '';
      const other =
        meta.find((m) => m.email === otherEmail) || {
          email: otherEmail,
          name: otherEmail.split('@')[0],
          initials: otherEmail.slice(0, 2).toUpperCase(),
        };
      const unreadMap = (typeof conv.unread_map === 'string' ? JSON.parse(conv.unread_map || '{}') : conv.unread_map ?? {}) as Record<string, number>;
      return {
        id: conv.id as string,
        status: (conv.status as string) || 'active',
        requestedBy: (conv.requested_by as string) || '',
        blockedBy: (conv.blocked_by as string) || '',
        lastMessageAt: ((conv.last_message_at as number) || 0) * 1000,
        preview: (conv.preview as string) ?? 'No messages yet',
        unread: unreadMap[me] ?? 0,
        other,
      };
    })
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

function mapConv(row: Record<string, unknown>, me: string): ChatMeta {
  const ids = JSON.parse((row.participant_ids as string) || '[]') as string[];
  const meta: ParticipantMeta[] =
    typeof row.participant_meta === 'string'
      ? (JSON.parse(row.participant_meta || '[]') as ParticipantMeta[])
      : Array.isArray(row.participant_meta)
        ? (row.participant_meta as ParticipantMeta[])
        : [];
  const otherEmail = ids.find((p) => p !== me) || '';
  const other =
    meta.find((m) => m.email === otherEmail) || {
      email: otherEmail,
      name: otherEmail.split('@')[0],
      initials: otherEmail.slice(0, 2).toUpperCase(),
    };
  return {
    id: row.id as string,
    status: (row.status as string) || 'active',
    requestedBy: (row.requested_by as string) || '',
    blockedBy: (row.blocked_by as string) || '',
    other,
  };
}

export function usePendingPosts() {
  const [pending, setPending] = useState<Post[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await Promise.all(
        PENDING_STATUSES.map(async (status) => {
          const { posts } = await fetchJson<{ posts: Record<string, unknown>[] }>(
            `/api/posts?status=${encodeURIComponent(status)}&limit=50`
          );
          return (posts ?? []).map(normalizePost);
        })
      );
      setPending([...result[0], ...result[1]]);
    } catch (error) {
      console.error('Pending posts fetch error:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (post: unknown) => {
      const row = post as Partial<Post>;
      if (typeof row.status !== 'string' || !PENDING_STATUSES.includes(row.status)) return;
      setPending((prev) => {
        if (!prev) return prev;
        if (!row.id || prev.some((p) => p.id === row.id)) return prev;
        return [normalizePost(row as Record<string, unknown>), ...prev];
      });
    };
    const onUpdated = (post: unknown) => {
      const row = post as Partial<Post>;
      setPending((prev) => {
        if (!prev || !row.id) return prev;
        if (typeof row.status === 'string' && !PENDING_STATUSES.includes(row.status)) {
          return prev.filter((p) => p.id !== row.id);
        }
        if (prev.some((p) => p.id === row.id)) {
          return prev.map((p) => (p.id === row.id ? { ...p, ...row, tags: parseTags(row.tags) } : p));
        }
        return [normalizePost(row as Record<string, unknown>), ...prev];
      });
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setPending((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    };
    socket.on(WS_EVENTS.POST_CREATED, onCreated);
    socket.on(WS_EVENTS.POST_UPDATED, onUpdated);
    socket.on(WS_EVENTS.POST_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.POST_CREATED, onCreated);
      socket.off(WS_EVENTS.POST_UPDATED, onUpdated);
      socket.off(WS_EVENTS.POST_DELETED, onDeleted);
    };
  }, [socket]);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev?.filter((p) => p.id !== id) ?? prev);
  }, []);

  return { pending, loading: pending === null, removePending, refresh };
}

export function useFeedPosts(options?: { hashtag?: string | null }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const htag = options?.hashtag ?? null;
  const tagParam = htag ? `&tag=${encodeURIComponent(htag)}` : '';

  useEffect(() => {
    const load = async () => {
      try {
        const { posts: list } = await fetchJson<{ posts: Record<string, unknown>[] }>(
          `/api/posts?status=approved&limit=${FEED_PAGE_SIZE}${tagParam}`
        );
        setHasError(false);
        setPosts((list ?? []).map(normalizePost));
        setHasMore((list?.length ?? 0) === FEED_PAGE_SIZE);
      } catch (error) {
        console.error('Feed fetch error:', error);
        setHasError(true);
        setPosts((prev) => prev ?? []);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [attempt, tagParam]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const qualify: (row: Partial<Post>) => boolean = (row) => row.status === 'approved';
    const onCreated = (post: unknown) => {
      const row = post as Partial<Post>;
      if (!row.id || !qualify(row)) return;
      setPosts((prev) => {
        if (!prev) return prev;
        if (prev.some((p) => p.id === row.id)) return prev;
        return [normalizePost(row as Record<string, unknown>), ...prev];
      });
    };
    const onUpdated = (post: unknown) => {
      const row = post as Partial<Post>;
      if (!row.id) return;
      setPosts((prev) =>
        (prev ?? [])
          .map((p) => (p.id === row.id ? { ...p, ...row, tags: parseTags(row.tags), images: row.images !== undefined && row.images !== null ? parseImages(row.images) : p.images } : p))
          .filter((p) => qualify(p))
      );
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    };
    const onLike = (data: unknown) => {
      const d = data as { post_id?: string };
      if (!d.post_id) return;
      setPosts((prev) => (prev ? prev.map((p) => (p.id === d.post_id ? { ...p, likes_count: p.likes_count + 1 } : p)) : prev));
    };
    const onUnlike = (data: unknown) => {
      const d = data as { post_id?: string };
      if (!d.post_id) return;
      setPosts((prev) => (prev ? prev.map((p) => (p.id === d.post_id ? { ...p, likes_count: Math.max(0, p.likes_count - 1) } : p)) : prev));
    };
    socket.on(WS_EVENTS.POST_CREATED, onCreated);
    socket.on(WS_EVENTS.POST_UPDATED, onUpdated);
    socket.on(WS_EVENTS.POST_DELETED, onDeleted);
    socket.on(WS_EVENTS.POST_LIKE, onLike);
    socket.on(WS_EVENTS.POST_UNLIKE, onUnlike);
    return () => {
      socket.off(WS_EVENTS.POST_CREATED, onCreated);
      socket.off(WS_EVENTS.POST_UPDATED, onUpdated);
      socket.off(WS_EVENTS.POST_DELETED, onDeleted);
      socket.off(WS_EVENTS.POST_LIKE, onLike);
      socket.off(WS_EVENTS.POST_UNLIKE, onUnlike);
    };
  }, [socket]);

  const refresh = useCallback(() => {
    setHasError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !posts || posts.length === 0) return;
    setLoadingMore(true);
    const offset = posts.length;
    try {
      const { posts: list } = await fetchJson<{ posts: Record<string, unknown>[] }>(
        `/api/posts?status=approved&limit=${FEED_PAGE_SIZE}&offset=${offset}${tagParam}`
      );
      setPosts((prev) => {
        const existing = new Set((prev ?? []).map((p) => p.id));
        return [...(prev ?? []), ...(list ?? []).map(normalizePost).filter((p) => !existing.has(p.id))];
      });
      setHasMore((list?.length ?? 0) === FEED_PAGE_SIZE);
    } catch (error) {
      console.error('Feed load-more error:', error);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, posts, tagParam]);

  return { posts, loading, loadingMore, hasMore, loadMore, hasError, refresh };
}

function useTaggedPosts(aliases: string[]) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { posts: list } = await fetchJson<{ posts: Record<string, unknown>[] }>(
          `/api/posts?status=approved&limit=50`
        );
        setHasError(false);
        setPosts((list ?? []).map(normalizePost).filter((p) => postHasTag(p, aliases)));
      } catch (error) {
        console.error('Tagged posts fetch error:', error);
        setHasError(true);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [aliases, attempt]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const qualifies: (row: Partial<Post>) => boolean = (row) => row.status === 'approved' && postHasTag(row as Post, aliases);
    const onCreated = (post: unknown) => {
      const row = post as Partial<Post>;
      if (!row.id || !qualifies(row)) return;
      setPosts((prev) => {
        if (!prev) return prev;
        if (prev.some((p) => p.id === row.id)) return prev;
        return [normalizePost(row as Record<string, unknown>), ...prev];
      });
    };
    const onUpdated = (post: unknown) => {
      const row = post as Partial<Post>;
      if (!row.id) return;
      setPosts((prev) =>
        (prev ?? [])
          .map((p) => (p.id === row.id ? { ...p, ...row, tags: parseTags(row.tags) } : p))
          .filter((p) => qualifies(p))
      );
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
  }, [socket, aliases]);

  const refresh = useCallback(() => {
    setHasError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);

  return { posts, loading, hasError, refresh };
}

export function useLostFoundPosts() {
  return useTaggedPosts(['lostfound', 'lostandfound']);
}

export function useAnnouncementPosts() {
  return useTaggedPosts(['announcement', 'announcements']);
}

export function usePostShares(postId: string, initialCount = 0) {
  const [shares, setShares] = useState<number>(initialCount);

  const socket = useSocket();
  useEffect(() => {
    if (!socket || !postId) return;
    const onShare = (data: unknown) => {
      const d = data as { post_id?: string };
      if (d?.post_id !== postId) return;
      setShares((prev) => prev + 1);
    };
    socket.on(WS_EVENTS.POST_SHARE, onShare);
    return () => { socket.off(WS_EVENTS.POST_SHARE, onShare); };
  }, [socket, postId]);

  return { shares, loading: false };
}

export function usePostLikes(postId: string, meEmail: string, initialCount = 0) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState<number>(initialCount ?? 0);
  const me = meEmail.toLowerCase();
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    void fetchJson<{ post_id: string; user_email: string; created_at: number }[]>(`/api/posts/${postId}/like`)
      .then((data) => {
        if (cancelled) return;
        setLikes(data?.length ?? 0);
        setLiked(data?.some((l) => l.user_email.toLowerCase() === me) ?? false);
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [postId, me]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onLike = (data: unknown) => {
      const d = data as { post_id?: string; user_email?: string };
      if (d?.post_id !== postId) return;
      const isMine = (d.user_email ?? '').toLowerCase() === me;
      if (isMine) return;
      setLikes((prev) => prev + 1);
    };
    const onUnlike = (data: unknown) => {
      const d = data as { post_id?: string; user_email?: string };
      if (d?.post_id !== postId) return;
      const isMine = (d.user_email ?? '').toLowerCase() === me;
      if (isMine) return;
      setLikes((prev) => Math.max(prev - 1, 0));
    };
    socket.on(WS_EVENTS.POST_LIKE, onLike);
    socket.on(WS_EVENTS.POST_UNLIKE, onUnlike);
    return () => {
      socket.off(WS_EVENTS.POST_LIKE, onLike);
      socket.off(WS_EVENTS.POST_UNLIKE, onUnlike);
    };
  }, [socket, postId, me]);

  const applyLikeState = useCallback((isLiked: boolean, count: number) => {
    setLiked(isLiked);
    setLikes(count);
  }, []);

  return { liked, likes, applyLikeState, loading: false };
}

export function useComments(postId: string, lazy = false) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(!lazy);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [fetchRequested, setFetchRequested] = useState(!lazy);

  const loadComments = useCallback(() => {
    setFetchRequested(true);
  }, []);

  useEffect(() => {
    if (!fetchRequested) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { comments: list } = await fetchJson<{ comments: Record<string, unknown>[] }>(
          `/api/posts/${postId}/comments`
        );
        if (!cancelled) {
          setComments((list ?? []) as unknown as Comment[]);
          setHasMore(false);
        }
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [postId, fetchRequested]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (data: unknown) => {
      const c = data as Partial<Comment>;
      if (c?.post_id !== postId) return;
      setComments((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === c.id)) return prev;
        return [...prev, c as Comment].sort((a, b) => a.created_at - b.created_at);
      });
    };
    const onUpdated = (data: unknown) => {
      const c = data as Partial<Comment>;
      setComments((prev) => (prev ? prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const c = data as Partial<Comment>;
      setComments((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
    };
    socket.on(WS_EVENTS.POST_COMMENT_CREATED, onCreated);
    socket.on(WS_EVENTS.POST_COMMENT_UPDATED, onUpdated);
    socket.on(WS_EVENTS.POST_COMMENT_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.POST_COMMENT_CREATED, onCreated);
      socket.off(WS_EVENTS.POST_COMMENT_UPDATED, onUpdated);
      socket.off(WS_EVENTS.POST_COMMENT_DELETED, onDeleted);
    };
  }, [socket, postId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(false);
    setHasMore(false);
  }, []);

  return { comments, loading, loadingMore, hasMore, loadMore, loadComments };
}

export function useConversations(me: string) {
  const [items, setItems] = useState<ConvMeta[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const { conversations } = await fetchJson<{ conversations: Record<string, unknown>[] }>(`/api/conversations`);
      setItems(enrichConvs(conversations ?? [], me));
    } catch (error) {
      console.error('Conversations fetch error:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onChanged = () => {
      void refetch();
    };
    socket.on(WS_EVENTS.CONVERSATION_CREATED, onChanged);
    socket.on(WS_EVENTS.CONVERSATION_UPDATED, onChanged);
    socket.on(WS_EVENTS.MESSAGE_CREATED, onChanged);
    return () => {
      socket.off(WS_EVENTS.CONVERSATION_CREATED, onChanged);
      socket.off(WS_EVENTS.CONVERSATION_UPDATED, onChanged);
      socket.off(WS_EVENTS.MESSAGE_CREATED, onChanged);
    };
  }, [socket, refetch]);

  return { conversations: items, loading, refetch };
}

export async function fetchConvPreviews(_me: string): Promise<Record<string, string>> {
  try {
    const { conversations } = await fetchJson<{ conversations: Record<string, unknown>[] }>(`/api/conversations`);
    const map: Record<string, string> = {};
    for (const conv of conversations ?? []) {
      map[conv.id as string] = (conv.preview as string) ?? 'No messages yet';
    }
    return map;
  } catch {
    return {};
  }
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const socket = useSocket();

  const refetch = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { messages: list } = await fetchJson<{ messages: Record<string, unknown>[] }>(
        `/api/conversations/${conversationId}/messages`
      );
      setMessages((list ?? []) as unknown as ChatMessage[]);
    } catch {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    setMessages(null);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (data: unknown) => {
      const m = data as Partial<ChatMessage>;
      if (m?.conversation_id !== conversationId) return;
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m as ChatMessage];
      });
    };
    const onUpdated = (data: unknown) => {
      const m = data as Partial<ChatMessage>;
      setMessages((prev) => (prev ? prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const m = data as Partial<ChatMessage>;
      setMessages((prev) => (prev ? prev.filter((x) => x.id !== m.id) : prev));
    };
    socket.on(WS_EVENTS.MESSAGE_CREATED, onMessage);
    socket.on(WS_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(WS_EVENTS.MESSAGE_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.MESSAGE_CREATED, onMessage);
      socket.off(WS_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(WS_EVENTS.MESSAGE_DELETED, onDeleted);
    };
  }, [socket, conversationId]);

  return { messages, loading: messages === null, refetch };
}

export function useConversationDetail(conversationId: string) {
  const [conv, setConv] = useState<ChatMeta | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    setConv(null);
    void fetchJson<{ data: Record<string, unknown> }>(`/api/conversations/${conversationId}`)
      .then(({ data }) => setConv(mapConv(data, '')))
      .catch(() => setConv(null));
  }, [conversationId]);
  return { conv };
}

export function useNotifications(recipientEmail: string, role: string) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const { notifications } = await fetchJson<{ notifications: Record<string, unknown>[] }>(`/api/notifications`);
      setItems((notifications ?? []) as unknown as Notification[]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!recipientEmail) return;
    void refetch();
  }, [recipientEmail, refetch]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (data: unknown) => {
      const n = data as Partial<Notification>;
      const isMine =
        n?.recipient_email === recipientEmail ||
        (!n?.recipient_email && n?.recipient_role === role);
      if (!isMine) return;
      setItems((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n as Notification, ...prev];
      });
    };
    const onUpdated = (data: unknown) => {
      const n = data as Partial<Notification>;
      const isMine =
        n?.recipient_email === recipientEmail ||
        (!n?.recipient_email && n?.recipient_role === role);
      if (!isMine) return;
      setItems((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, ...n } : x)) : prev));
    };
    socket.on(WS_EVENTS.NOTIFICATION_CREATED, onCreated);
    socket.on(WS_EVENTS.NOTIFICATION_UPDATED, onUpdated);
    return () => {
      socket.off(WS_EVENTS.NOTIFICATION_CREATED, onCreated);
      socket.off(WS_EVENTS.NOTIFICATION_UPDATED, onUpdated);
    };
  }, [socket, recipientEmail, role]);

  return { notifications: items, loading, refetch };
}

const ACTIVITIES_PAGE_SIZE = 20;

export function useActivities() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { activities } = await fetchJson<{ activities: Record<string, unknown>[] }>(
          `/api/activities?limit=${ACTIVITIES_PAGE_SIZE}&offset=0`
        );
        setHasError(false);
        setItems((activities ?? []) as unknown as Activity[]);
        setHasMore((activities?.length ?? 0) === ACTIVITIES_PAGE_SIZE);
      } catch (error) {
        console.error('Activities fetch error:', error);
        setHasError(true);
        setItems((prev) => prev ?? []);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [attempt]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (data: unknown) => {
      const a = data as Partial<Activity>;
      if (!a.id) return;
      setItems((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === a.id)) return prev;
        return [a as Activity, ...prev];
      });
    };
    const onUpdated = (data: unknown) => {
      const a = data as Partial<Activity>;
      if (!a.id) return;
      setItems((prev) => (prev ? prev.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : prev));
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    };
    socket.on(WS_EVENTS.ACTIVITY_CREATED, onCreated);
    socket.on(WS_EVENTS.ACTIVITY_UPDATED, onUpdated);
    socket.on(WS_EVENTS.ACTIVITY_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.ACTIVITY_CREATED, onCreated);
      socket.off(WS_EVENTS.ACTIVITY_UPDATED, onUpdated);
      socket.off(WS_EVENTS.ACTIVITY_DELETED, onDeleted);
    };
  }, [socket]);

  const refresh = useCallback(() => {
    setHasError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !items || items.length === 0) return;
    setLoadingMore(true);
    const offset = items.length;
    try {
      const { activities } = await fetchJson<{ activities: Record<string, unknown>[] }>(
        `/api/activities?limit=${ACTIVITIES_PAGE_SIZE}&offset=${offset}`
      );
      setItems((prev) => {
        const existing = new Set((prev ?? []).map((a) => a.id));
        return [...(prev ?? []), ...((activities ?? []).filter((a) => !existing.has(a.id as string)) as unknown as Activity[])];
      });
      setHasMore((activities?.length ?? 0) === ACTIVITIES_PAGE_SIZE);
    } catch (error) {
      console.error('Activities load-more error:', error);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, items]);

  return { activities: items, loading, loadingMore, hasMore, loadMore, hasError, refresh };
}

export function useActivityShares(activityId: string) {
  const [shares, setShares] = useState<number | null>(null);
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    void fetchJson<{ data: Activity }>(`/api/activities/${activityId}`)
      .then(({ data }) => {
        if (!cancelled) setShares(Number(data?.shares_count) || 0);
      })
      .catch(() => {
        if (!cancelled) setShares(0);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);
  return { shares, loading: shares === null };
}

export function useActivityLikes(activityId: string, meEmail: string) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState<number | null>(null);
  const me = meEmail.toLowerCase();
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    void fetchJson<{ activity_id: string; user_email: string; created_at: number }[]>(`/api/activities/${activityId}/like`)
      .then((data) => {
        if (cancelled) return;
        setLikes(data?.length ?? 0);
        setLiked(data?.some((l) => l.user_email.toLowerCase() === me) ?? false);
      })
      .catch(() => {
        if (!cancelled) setLikes(0);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, me]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onLike = (data: unknown) => {
      const d = data as { activity_id?: string; user_email?: string };
      if (d?.activity_id !== activityId) return;
      setLikes((prev) => (prev === null ? prev : prev + 1));
      if ((d.user_email ?? '').toLowerCase() === me) setLiked(true);
    };
    const onUnlike = (data: unknown) => {
      const d = data as { activity_id?: string; user_email?: string };
      if (d?.activity_id !== activityId) return;
      setLikes((prev) => (prev === null ? prev : Math.max(prev - 1, 0)));
      if ((d.user_email ?? '').toLowerCase() === me) setLiked(false);
    };
    socket.on(WS_EVENTS.ACTIVITY_LIKE, onLike);
    socket.on(WS_EVENTS.ACTIVITY_UNLIKE, onUnlike);
    return () => {
      socket.off(WS_EVENTS.ACTIVITY_LIKE, onLike);
      socket.off(WS_EVENTS.ACTIVITY_UNLIKE, onUnlike);
    };
  }, [socket, activityId, me]);

  return { liked, likes, loading: likes === null };
}

export function useActivityComments(activityId: string) {
  const [comments, setComments] = useState<ActivityComment[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { comments: list } = await fetchJson<{ comments: Record<string, unknown>[] }>(
          `/api/activities/${activityId}/comments`
        );
        setComments((list ?? []) as unknown as ActivityComment[]);
      } catch {
        setComments([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [activityId]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (data: unknown) => {
      const c = data as Partial<ActivityComment>;
      if (c?.activity_id !== activityId) return;
      setComments((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === c.id)) return prev;
        return [...prev, c as ActivityComment].sort((a, b) => a.created_at - b.created_at);
      });
    };
    socket.on(WS_EVENTS.ACTIVITY_COMMENT_CREATED, onCreated);
    return () => {
      socket.off(WS_EVENTS.ACTIVITY_COMMENT_CREATED, onCreated);
    };
  }, [socket, activityId]);

  return { comments, loading };
}

type EventRow = {
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
};

export function useEvents(role?: string) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const studentOnly = role === 'student';

  useEffect(() => {
    const load = async () => {
      try {
        // The events API applies visibility rules server-side (public for
        // students/lecturers, all events for admin/student-affairs).
        const { events: list } = await fetchJson<{ events: Record<string, unknown>[] }>(`/api/events`);
        setHasError(false);
        setEvents((list ?? []) as EventRow[]);
      } catch (error) {
        console.error('Events fetch error:', error);
        setHasError(true);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [studentOnly, attempt]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onCreated = (data: unknown) => {
      const e = data as Partial<EventRow>;
      if (studentOnly && e.visibility && e.visibility !== 'public') return;
      if (!e.id) return;
      setEvents((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === e.id)) return prev;
        return [...prev, e as EventRow].sort((a, b) => a.event_date - b.event_date);
      });
    };
    const onUpdated = (data: unknown) => {
      const e = data as Partial<EventRow>;
      if (!e.id) return;
      setEvents((prev) =>
        (prev ?? []).map((x) => (x.id === e.id ? { ...x, ...e } : x)).sort((a, b) => a.event_date - b.event_date)
      );
    };
    const onDeleted = (data: unknown) => {
      const { id } = data as { id: string };
      setEvents((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    };
    socket.on(WS_EVENTS.EVENT_CREATED, onCreated);
    socket.on(WS_EVENTS.EVENT_UPDATED, onUpdated);
    socket.on(WS_EVENTS.EVENT_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.EVENT_CREATED, onCreated);
      socket.off(WS_EVENTS.EVENT_UPDATED, onUpdated);
      socket.off(WS_EVENTS.EVENT_DELETED, onDeleted);
    };
  }, [socket, studentOnly]);

  const refresh = useCallback(() => {
    setHasError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);

  return { events, loading, hasError, refresh };
}

export function useEventRegistrations(eventIds: string[], me: string) {
  const [regs, setRegs] = useState<Record<string, { count: number; registered: boolean }> | null>(null);
  const idsKey = eventIds.join('|');

  const load = useCallback(async () => {
    if (idsKey === '') {
      setRegs({});
      return;
    }
    const ids = idsKey.split('|');
    const map: Record<string, { count: number; registered: boolean }> = {};
    for (const id of ids) map[id] = { count: 0, registered: false };
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { documents } = await fetchJson<{ documents: EventRegistration[] }>(`/api/events/${id}/register`);
          const entries = Array.isArray(documents) ? documents : [];
          const m = map[id];
          if (m) {
            m.count = entries.length;
            m.registered = entries.some((r) => (r.user_email ?? '').toLowerCase() === me.toLowerCase());
          }
        } catch {
          // keep zeros for this event
        }
      })
    );
    setRegs(map);
  }, [idsKey, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    const apply = (data: unknown, delta: number, removingEmail?: string) => {
      const d = data as { event_id?: string; user_email?: string };
      if (!d?.event_id || !eventIds.includes(d.event_id)) return;
      setRegs((prev) => {
        if (!prev) return prev;
        const m = prev[d.event_id as string];
        if (!m) return prev;
        const mine = (d.user_email ?? '').toLowerCase() === me.toLowerCase();
        return {
          ...prev,
          [d.event_id as string]: {
            count: Math.max(0, m.count + delta),
            registered: delta > 0 ? m.registered || mine : removingEmail && mine ? false : m.registered,
          },
        };
      });
    };
    const onReg = (data: unknown) => apply(data, 1);
    const onUnreg = (data: unknown) => apply(data, -1, (data as { user_email?: string }).user_email);
    socket.on(WS_EVENTS.EVENT_REGISTRATION, onReg);
    socket.on(WS_EVENTS.EVENT_UNREGISTRATION, onUnreg);
    return () => {
      socket.off(WS_EVENTS.EVENT_REGISTRATION, onReg);
      socket.off(WS_EVENTS.EVENT_UNREGISTRATION, onUnreg);
    };
  }, [socket, idsKey, me]);

  return { registrations: regs, loading: regs === null };
}

// ============================================================================
// Timetable: current staff profile (backend)
// ============================================================================

export function useCurrentStaff() {
  const [staff, setStaff] = useState<StaffRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const record = await getCurrentStaff();
      setStaff(record);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load staff profile');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { staff, loading, error, refresh: load };
}