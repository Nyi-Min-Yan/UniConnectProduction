'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from '@/lib/realtime/context';
import { WS_EVENTS } from '@/lib/realtime/events';
import { useSession } from './session';
import { toast } from 'sonner';
import { Heart, MessageSquare, Share2, UserPlus, CalendarCheck, ShieldCheck, Mail, FileText } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface ToastNotification {
  id: string;
  type: string;
  message: string;
  created_at: number;
  read: number;
  recipient_email: string | null;
  recipient_role: string | null;
  post_id?: string | null;
  activity_id?: string | null;
}

const TYPE_META: Record<string, { icon: React.ReactNode }> = {
  like: { icon: <Heart size={15} /> },
  comment: { icon: <MessageSquare size={15} /> },
  share: { icon: <Share2 size={15} /> },
  message: { icon: <Mail size={15} /> },
  follow: { icon: <UserPlus size={15} /> },
  event: { icon: <CalendarCheck size={15} /> },
  moderation: { icon: <ShieldCheck size={15} /> },
  'exam-result': { icon: <FileText size={15} /> },
};

let notificationAudio: HTMLAudioElement | null = null;
let soundEnabled: boolean = (() => {
  try { return localStorage.getItem('uniconnect-sound') !== 'off'; } catch { return true; }
})();

export function isNotificationSoundEnabled(): boolean {
  try {
    return localStorage.getItem('uniconnect-sound') !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  try {
    localStorage.setItem('uniconnect-sound', enabled ? 'on' : 'off');
  } catch {}
}

function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;
  try {
    if (!notificationAudio) notificationAudio = new Audio('/0_phone.mp3');
    notificationAudio.currentTime = 0;
    notificationAudio.volume = 0.5;
    void notificationAudio.play().catch(() => {});
  } catch {
    // audio errors are intentionally ignored
  }
}

function destinationFor(n: ToastNotification, role: string): { path: string } | null {
  const base = `/${role || 'student'}`;
  switch (n.type) {
    case 'message':
      return { path: `${base}/messages` };
    case 'exam-result':
      return { path: `${base}/exam-results` };
    case 'event':
      return { path: `${base}/events` };
    case 'like':
    case 'comment':
    case 'share':
      if (n.type === 'share' && n.activity_id) return { path: `${base}/activity` };
      return { path: `${base}/feed` };
    case 'follow':
      return { path: `${base}/notifications` };
    case 'moderation':
      return { path: n.post_id ? `${base}/feed` : `${base}/notifications` };
    default:
      return { path: `${base}/notifications` };
  }
}

export default function RealtimeAlerts() {
  const { user: session } = useSession();
  const me = session?.email ?? '';
  const myRole = session?.role ?? '';
  const pathname = usePathname();
  const socket = useSocket();

  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => {
      try {
        const a = notificationAudio ?? new Audio('/0_phone.mp3');
        notificationAudio = a;
        a.volume = 0;
        void a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      } catch {
        // audio errors are intentionally ignored
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: any) => {
      const n = payload as ToastNotification;
      if (!me) return;
      const isMine = n.recipient_email === me || (myRole && n.recipient_role === myRole);
      if (!isMine) return;
      if (n.read) return;
      const key = n.id;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      playNotificationSound();
      const dest = destinationFor(n, myRole);
      if (dest && pathname === dest.path) return;
      const meta = TYPE_META[n.type] ?? TYPE_META.event;
      toast(n.message, {
        icon: meta.icon,
        action: dest
          ? { label: 'View', onClick: () => { window.location.href = dest.path; } }
          : undefined,
      });
    };
    socket.on(WS_EVENTS.NOTIFICATION_CREATED, handler);
    return () => { socket.off(WS_EVENTS.NOTIFICATION_CREATED, handler); };
  }, [socket, me, myRole, pathname]);

  return null;
}