'use client';

import { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSession } from './session';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';

export interface PresenceEntry {
  online: boolean;
  last_seen: number;
}

interface PresenceContextValue {
  presence: Record<string, PresenceEntry>;
  getPresence: (email: string) => PresenceEntry;
}

const PresenceContext = createContext<PresenceContextValue>({
  presence: {},
  getPresence: () => ({ online: false, last_seen: 0 }),
});

const HEARTBEAT_MS = 15000;

function persistLastSeen(ts: number) {
  const body = JSON.stringify({ last_seen: ts });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/presence', new Blob([body], { type: 'application/json' }));
  } else {
    fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

function sendOffline(socket: ReturnType<typeof useSocket>) {
  if (socket && socket.connected) {
    socket.emit('presence:update', { online: false, last_seen: Math.floor(Date.now() / 1000) });
  }
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const me = user?.email ?? '';
  const socket = useSocket();
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  useEffect(() => {
    if (!me || !socket) {
      setPresence({});
      return;
    }

    const ts = Date.now();
    fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_seen: ts, online: true }),
    }).catch(() => {});

    socket.emit('presence:update', { online: true, last_seen: Math.floor(Date.now() / 1000) });

    heartbeatRef.current = setInterval(() => {
      persistLastSeen(Date.now());
      const s = socketRef.current;
      if (s && s.connected) {
        s.emit('presence:update', { online: true, last_seen: Math.floor(Date.now() / 1000) });
      }
    }, HEARTBEAT_MS);

    const onPresenceUpdate = (data: { email: string; online: boolean; last_seen: number }) => {
      setPresence((prev) => ({
        ...prev,
        [data.email]: { online: data.online, last_seen: data.last_seen },
      }));
    };
    socket.on(WS_EVENTS.PRESENCE_UPDATE, onPresenceUpdate);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        persistLastSeen(Date.now());
        const s = socketRef.current;
        if (s && s.connected) {
          s.emit('presence:update', { online: true, last_seen: Math.floor(Date.now() / 1000) });
        }
      } else {
        persistLastSeen(Date.now());
        sendOffline(socketRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handlePageHide = () => {
      persistLastSeen(Date.now());
      sendOffline(socketRef.current);
    };
    window.addEventListener('pagehide', handlePageHide);

    const handleBeforeUnload = () => {
      persistLastSeen(Date.now());
      sendOffline(socketRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      socket.off(WS_EVENTS.PRESENCE_UPDATE, onPresenceUpdate);
      sendOffline(socket);
    };
  }, [me, socket]);

  const getPresence = useCallback(
    (email: string): PresenceEntry => {
      if (!me) return { online: false, last_seen: 0 };
      const entry = presence[email];
      if (!entry) return { online: false, last_seen: 0 };
      const thirtySecondsAgo = Math.floor(Date.now() / 1000) - 30;
      return { ...entry, online: entry.online && entry.last_seen > thirtySecondsAgo };
    },
    [presence, me]
  );

  return (
    <PresenceContext.Provider value={{ presence, getPresence }}>{children}</PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}