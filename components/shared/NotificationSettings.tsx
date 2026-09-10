'use client';

import { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from './RealtimeAlerts';

export default function NotificationSettings({ bare }: { bare?: boolean }) {
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    setSoundOn(isNotificationSoundEnabled());
  }, []);

  const toggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundEnabled(next);
  };

  const card = (
    <div className="bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--surface-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--surface)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={16} /> Notifications
        </div>
      </div>
      <div style={{ padding: '20px 22px' }}>
        <div
          onClick={toggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--surface-border)',
            background: soundOn ? 'rgba(40, 114, 161, 0.06)' : 'var(--surface-soft)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(35, 96, 138, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--surface-border)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-sm)',
              background: soundOn ? 'rgba(40, 114, 161, 0.12)' : 'rgba(156, 163, 175, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: soundOn ? 'var(--primary)' : 'var(--text-lighter)',
              transition: 'all 0.2s ease',
            }}>
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>Notification sounds</div>
              <div style={{ fontSize: 12, color: 'var(--text-lighter)' }}>
                {soundOn ? 'You will hear a sound for new notifications' : 'Notifications will arrive silently'}
              </div>
            </div>
          </div>
          <div style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            background: soundOn ? 'var(--primary)' : 'var(--surface)',
            position: 'relative',
            transition: 'background 0.2s ease',
            flexShrink: 0,
          }}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: soundOn ? 23 : 3,
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (bare) return card;

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 20 }}>Manage your notification preferences</p>
      {card}
    </div>
  );
}
