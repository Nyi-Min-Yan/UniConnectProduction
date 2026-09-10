'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { GraduationCap, Users, ShieldCheck, LogIn, Mail, Lock, BookOpen } from 'lucide-react';
import { LOGIN_CREDENTIALS } from '@/components/shared/constants';
import { backendLogin } from '@/components/shared/api';
import type { LoginResult } from '@/components/shared/api';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useSession } from '@/components/shared/session';

const ROLE_ICONS = {
  student: BookOpen,
  lecturer: GraduationCap,
  'student-affair': ShieldCheck,
  admin: Users,
};

const DOOR_GRADIENT =
  'linear-gradient(180deg, #0a101c 0%, #0e1726 45%, #132030 100%)';
const DOOR_RIB = 'repeating-linear-gradient(90deg, transparent 0 46px, rgba(160,190,220,0.05) 46px 47px)';

function GateIntro({ onDone }: { onDone: () => void }) {
  const [opened, setOpened] = useState(false);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const openT = setTimeout(() => setOpened(true), 650);
    const doneT = setTimeout(onDone, 650 + 960 + 80);
    return () => {
      clearTimeout(openT);
      clearTimeout(doneT);
    };
  }, [reducedMotion, onDone]);

  const doorTransition = { duration: 0.95, ease: [0.76, 0, 0.24, 1] as const };

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: 'none' }} aria-hidden="true">
      <motion.div
        className="absolute top-0 bottom-0 left-0 w-1/2 overflow-hidden"
        style={{ background: DOOR_GRADIENT, borderRight: '1px solid rgba(217,169,78,0.3)' }}
        initial={{ x: 0 }}
        animate={opened ? { x: '-101%' } : { x: 0 }}
        transition={doorTransition}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `${DOOR_RIB}, linear-gradient(90deg, transparent 0%, rgba(120,150,190,0.08) 55%, rgba(217,169,78,0.16) 96%, rgba(217,169,78,0.32) 100%)`,
          }}
        />
      </motion.div>

      <motion.div
        className="absolute top-0 bottom-0 right-0 w-1/2 overflow-hidden"
        style={{ background: DOOR_GRADIENT, borderLeft: '1px solid rgba(217,169,78,0.3)' }}
        initial={{ x: 0 }}
        animate={opened ? { x: '101%' } : { x: 0 }}
        transition={doorTransition}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `${DOOR_RIB}, linear-gradient(90deg, rgba(217,169,78,0.32) 0%, rgba(217,169,78,0.16) 4%, rgba(120,150,190,0.08) 45%, transparent 100%)`,
          }}
        />
      </motion.div>

      <motion.div
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 160,
          background: 'linear-gradient(180deg, rgba(217,169,78,0) 0%, rgba(217,169,78,0.38) 18%, rgba(217,169,78,0.6) 50%, rgba(217,169,78,0.38) 82%, rgba(217,169,78,0) 100%)',
          filter: 'blur(26px)',
        }}
        initial={{ opacity: 0.55, scaleY: 0.8 }}
        animate={opened ? { opacity: [0.55, 1, 0], scaleY: [0.8, 1.25, 1.5] } : { opacity: 0.55, scaleY: 0.8 }}
        transition={opened ? { duration: 0.95, times: [0, 0.4, 1], ease: 'easeInOut' } : { duration: 0.001 }}
      />

      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={opened ? { opacity: 0, scale: 1.7 } : { opacity: 1, scale: 1 }}
        transition={opened ? { duration: 0.55, delay: 0.35, ease: [0.4, 0, 0.2, 1] } : { duration: 0.5, delay: 0.12, ease: 'easeOut' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 92,
            height: 92,
            borderRadius: '50%',
            border: '1px solid rgba(214,231,242,0.3)',
            boxShadow: 'inset 0 0 0 7px rgba(214,231,242,0.05), 0 0 44px rgba(217,169,78,0.15)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(217,169,78,0.16), rgba(217,169,78,0.03))',
              border: '1px solid rgba(217,169,78,0.5)',
              boxShadow: 'inset 0 0 18px rgba(217,169,78,0.12)',
            }}
          >
            <span style={{ fontSize: 34, fontWeight: 800, color: '#e8d9b0', fontFamily: 'Georgia, serif' }}>U</span>
          </div>
        </div>
        <div style={{ marginTop: 26, fontFamily: "'Patrick Hand', cursive", fontSize: 52, letterSpacing: '0.02em', lineHeight: 1.1, color: '#eaf2f7', textShadow: '0 2px 18px rgba(217,169,78,0.28)' }}>
          UniConnect
        </div>
        <div style={{ width: 72, height: 1, marginTop: 14, background: 'linear-gradient(90deg, transparent, rgba(217,169,78,0.8), transparent)' }} />
        <div style={{ marginTop: 14, fontFamily: "'Patrick Hand', cursive", fontSize: 19, letterSpacing: '0.05em', color: 'rgba(214,231,242,0.82)' }}>
          University Communication Platform
        </div>
      </motion.div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { applySession } = useSession();
  const [showGate, setShowGate] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Please enter your email and password.');
      return;
    }
    setLoggingIn(true);
    let result: LoginResult;
    try {
      result = await backendLogin(email.trim(), password);
    } catch (err) {
      setLoggingIn(false);
      toast.error(err instanceof Error ? err.message : 'Cannot reach the university server. Please try again.');
      return;
    }
    setLoggingIn(false);
    applySession({ role: result.role, email: result.email, name: result.name });
    toast.success(`Welcome back, ${result.name}!`);
    router.replace(result.path);
  };

  const fillCredential = (c: (typeof LOGIN_CREDENTIALS)[number]) => {
    setEmail(c.email);
    setPassword(c.password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lg:p-8">
      {showGate && <GateIntro onDone={() => setShowGate(false)} />}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <div className="card card-border bg-base-100 shadow-lg w-full max-w-4xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
          <div
            className="hidden lg:flex flex-col justify-between p-10"
            style={{ background: 'var(--login-panel)', color: 'var(--login-panel-content)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/20 font-extrabold text-2xl">
                U
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight">UniConnect</div>
                <div className="text-xs opacity-70">University Communication Platform</div>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold leading-tight mb-3">
                One platform for every role on campus
              </h1>
              <p className="text-sm opacity-80 leading-relaxed">
                Manage lectures, oversee university operations, and handle student
                services — all from a single, secure sign-in.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {LOGIN_CREDENTIALS.map((c) => {
                const Icon = ROLE_ICONS[c.role];
                return (
                  <div key={c.role} className="flex items-center gap-3 bg-white/15 rounded-xl px-4 py-3 backdrop-blur">
                    <Icon size={18} />
                    <div>
                      <div className="text-sm font-semibold">{c.label}</div>
                      <div className="text-[11px] opacity-70">{c.path}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary text-primary-content font-extrabold text-2xl">
                U
              </div>
              <div>
                <div className="text-xl font-bold text-base-content tracking-tight">UniConnect</div>
                <div className="text-xs text-base-content/60">University Communication Platform</div>
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-base-content tracking-tight mb-1">
              Welcome back
            </h2>
            <p className="text-sm text-base-content/60 mb-7">
              Sign in with your university credentials to continue
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <label className="floating-label">
                <input
                  type="email"
                  placeholder="Email"
                  className="input input-bordered w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> Email
                </span>
              </label>

              <label className="floating-label">
                <input
                  type="password"
                  placeholder="Password"
                  className="input input-bordered w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="flex items-center gap-1.5">
                  <Lock size={13} /> Password
                </span>
              </label>

              <button type="submit" className="btn btn-primary btn-block mt-1" disabled={loggingIn}>
                {loggingIn ? (
                  <>
                    <span className="loading loading-spinner loading-sm" /> Signing in...
                  </>
                ) : (
                  <>
                    <LogIn size={16} /> Sign In
                  </>
                )}
              </button>
            </form>

            <div className="divider text-xs text-base-content/50 my-5">Demo accounts</div>
            <div className="flex flex-col gap-2">
              {LOGIN_CREDENTIALS.map((c) => {
                const Icon = ROLE_ICONS[c.role];
                return (
                  <button
                    key={c.role}
                    type="button"
                    onClick={() => fillCredential(c)}
                    className="btn btn-outline btn-sm justify-start gap-2.5"
                  >
                    <Icon size={15} className="text-primary" />
                    <span className="flex-1 text-left">{c.label}</span>
                    <span className="font-mono text-[11px] text-base-content/50 hidden sm:inline">
                      {c.email}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-base-content/40 text-center mt-6">
              Click a demo account to fill the form, then press Sign In.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}