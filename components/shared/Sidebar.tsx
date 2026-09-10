'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useConversations, useNotifications } from '@/lib/hooks';
import { MAIN_NAV } from './constants';
import { backendLogout, getCurrentStaff } from './api';
import { useSession } from './session';
import type { UserRole } from './constants';
import type { NavItem } from './types';
import * as Icons from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  LayoutDashboard: Icons.LayoutDashboard,
  Newspaper: Icons.Newspaper,
  Mail: Icons.Mail,
  MessageSquare: Icons.MessageSquare,
  Clapperboard: Icons.Clapperboard,
  GraduationCap: Icons.GraduationCap,
  BookOpen: Icons.BookOpen,
  Presentation: Icons.Presentation,
  Users: Icons.Users,
  FileText: Icons.FileText,
  ClipboardCheck: Icons.ClipboardCheck,
  CalendarDays: Icons.CalendarDays,
  CalendarCog: Icons.CalendarCog,
  Megaphone: Icons.Megaphone,
  CalendarCheck: Icons.CalendarCheck,
  Coins: Icons.Coins,
  Search: Icons.Search,
  Settings: Icons.Settings,
  Bell: Icons.Bell,
  ShieldCheck: Icons.ShieldCheck,
  User: Icons.User,
  UserCog: Icons.UserCog,
  Landmark: Icons.Landmark,
  History: Icons.History,
  ClipboardList: Icons.ClipboardList,
};

interface SidebarProps {
  basePath: string;
  activePage: string;
  role: UserRole;
}

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  lecturer: 'Lecturer',
  'student-affair': 'Student Affairs',
  admin: 'System Admin',
};

export default function Sidebar({ basePath, activePage, role }: SidebarProps) {
  const router = useRouter();
  const { user: session, refresh } = useSession();
  const me = session?.email ?? '';

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isHod, setIsHod] = useState(false);

  useEffect(() => {
    if (role !== 'lecturer') return;
    let cancelled = false;
    getCurrentStaff()
      .then((s) => {
        if (!cancelled) setIsHod((s.positions ?? []).includes('HOD'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  const navSections = useMemo(() => {
    const sections = MAIN_NAV[role];
    if (role !== 'lecturer' || isHod) return sections;
    const hidden = new Set<string>(['timetable-generation', 'lecturers']);
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !hidden.has(item.id)),
      }))
      .filter((section) => section.items.length > 0);
  }, [role, isHod]);

  const { conversations } = useConversations(me);
  const { notifications } = useNotifications(me, role);

  useEffect(() => {
    setUnreadMessages((conversations ?? []).reduce((sum, c) => sum + (c.unread || 0), 0));
  }, [conversations]);

  useEffect(() => {
    setUnreadNotifications((notifications ?? []).filter((n) => !n.read).length);
  }, [notifications]);

  const badgeFor = (id: string): string | undefined => {
    if (id === 'messages') return unreadMessages > 0 ? String(unreadMessages) : undefined;
    if (id === 'notifications') return unreadNotifications > 0 ? String(unreadNotifications) : undefined;
    return undefined;
  };

  const handleLogout = async () => {
    await backendLogout();
    await refresh();
    router.replace('/');
  };

  return (
    <div
      className="flex flex-col h-full w-[260px] min-w-[260px] relative overflow-hidden border-r shadow-[4px_0_24px_rgba(0,0,0,0.1)]"
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
    >
      <div
        className="relative z-10 flex items-center gap-3 px-5 py-5 border-b"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <img
          src="/icon.png"
          alt="University logo"
          className="w-10 h-10 rounded-xl object-cover shrink-0"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        />
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--sidebar-content)' }}>UniConnect</div>
          <div className="text-[10px] font-medium" style={{ color: 'var(--sidebar-content)', opacity: 0.6 }}>University Network</div>
        </div>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto">
        {navSections.map((section: NavItem) => (
          <div key={section.section} className="pt-4 pl-3 pb-1.5">
            <div
              className="text-xs uppercase tracking-wider font-bold px-2 mb-1.5"
              style={{ color: 'var(--sidebar-content)', opacity: 0.8 }}
            >
              {section.section}
            </div>
            {section.items.map((item) => {
              const IconComp = iconMap[item.icon] || Icons.Circle;
              const isActive = activePage === item.id;
              const href = item.id === 'dashboard' ? basePath : `${basePath}/${item.id}`;
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 my-1 rounded-xl text-[15px] font-medium transition-all duration-200 hover:bg-(--sidebar-hover) ${
                    isActive ? "font-semibold" : "hover:translate-x-0.5"
                  }`}
                  style={{
                    width: 'calc(100% - 16px)',
                    background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                    color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-content)',
                    boxShadow: isActive ? 'inset 3px 0 0 var(--sidebar-active-accent)' : 'none',
                    opacity: isActive ? 1 : 0.85,
                  }}
                >
                  <IconComp size={20} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {(badgeFor(item.id)) && (
                    <span className="bg-error text-error-content text-[10px] font-bold px-[7px] py-[2px] rounded-full">
                      {badgeFor(item.id)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div
        className="relative z-10 p-3.5 mx-3.5 mt-4 mb-4 rounded-xl flex items-center gap-2.5"
        style={{ background: 'var(--sidebar-card-bg)', border: '1px solid var(--sidebar-card-border)' }}
      >
        <Link
          href={`${basePath}/profile`}
          className="flex items-center gap-2.5 flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#cbdde9] to-[#9ecbe4] flex items-center justify-center text-[#1c4f73] font-bold text-xs">
            {session?.initials || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--sidebar-content)' }}>
              {session?.name || ROLE_LABELS[role]}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--sidebar-content)', opacity: 0.6 }}>
              {ROLE_LABELS[role]} • UniConnect
            </div>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-circle btn-sm"
          title="Logout"
        >
          <Icons.LogOut size={15} style={{ color: 'var(--sidebar-content)', opacity: 0.6 }} />
        </button>
      </div>
    </div>
  );
}
