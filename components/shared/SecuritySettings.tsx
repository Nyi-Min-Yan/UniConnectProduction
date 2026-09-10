'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from './api';

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 38px 10px 14px',
  borderRadius: 'var(--radius-sm)',
  border: '1.5px solid var(--secondary)',
  background: 'var(--secondary-lighter)',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent)',
  marginBottom: 6,
};

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 10,
          top: 34,
          border: 'none',
          background: 'none',
          color: 'var(--text-lighter)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
        }}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export function SecuritySettings() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  const [saving, setSaving] = useState(false);

  const toggle = (k: 'current' | 'next' | 'confirm') =>
    setVisible((v) => ({ ...v, [k]: !v[k] }));

  const submit = async () => {
    if (saving) return;
    if (!current || !next || !confirm) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (next.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast.success('Password updated successfully');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PasswordField label="Current Password" value={current} onChange={setCurrent} visible={visible.current} onToggle={() => toggle('current')} />
      <PasswordField label="New Password" value={next} onChange={setNext} visible={visible.next} onToggle={() => toggle('next')} />
      <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} visible={visible.confirm} onToggle={() => toggle('confirm')} />
      {next && confirm && next !== confirm && (
        <div style={{ marginTop: -10, marginBottom: 16, fontSize: 12, color: '#dc2626' }}>
          Passwords do not match
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setCurrent(''); setNext(''); setConfirm(''); setVisible({ current: false, next: false, confirm: false }); }}
          style={{ background: 'transparent', color: 'var(--text-light)', borderRadius: 'var(--radius-sm)', padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          style={{ background: 'linear-gradient(var(--primary), var(--primary-dark))', color: '#fff', borderRadius: 'var(--radius-sm)', padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </>
  );
}
