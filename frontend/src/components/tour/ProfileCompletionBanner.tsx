import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserCircle, X, ChevronRight, CheckCircle } from 'lucide-react';
import { useMyProfile } from '../../hooks/useUsers';
import { useMyExtendedProfile } from '../../hooks/useUsers';

interface CheckItem {
  label: string;
  done: boolean;
}

export default function ProfileCompletionBanner() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('ds_profile_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });

  const { data: profile } = useMyProfile();
  const { data: extended } = useMyExtendedProfile();

  if (dismissed) return null;

  const checks: CheckItem[] = [
    { label: 'Photo',       done: !!profile?.avatarUrl },
    { label: 'Phone',       done: !!(extended as any)?.phone },
    { label: 'Bio',         done: !!(extended as any)?.bio },
    { label: 'Job title',   done: !!(extended as any)?.designation },
  ];

  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checks.length) * 100);

  // Hide once profile is fully complete
  if (pct === 100) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('ds_profile_banner_dismissed', '1');
    } catch {}
  };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, rgba(var(--ds-accent), 0.12), rgba(var(--ds-primary), 0.08))`,
        borderBottom: '1px solid rgba(var(--ds-accent), 0.2)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(var(--ds-accent), 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <UserCircle size={18} style={{ color: 'rgb(var(--ds-accent))' }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{
          fontSize: 13, fontWeight: 700, color: 'rgb(var(--ds-text))',
          marginBottom: 2,
        }}>
          Your profile is {pct}% complete
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {checks.map((c) => (
            <span
              key={c.label}
              style={{
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 3,
                color: c.done ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-text-muted))',
              }}
            >
              <CheckCircle size={11} style={{ opacity: c.done ? 1 : 0.35 }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: 80, height: 6, borderRadius: 4,
        background: 'rgb(var(--ds-border))',
        overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: `linear-gradient(90deg, rgb(var(--ds-accent)), rgb(var(--ds-primary)))`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* CTA */}
      <Link
        to={`/${tenantSlug}/profile`}
        style={{
          padding: '7px 14px', borderRadius: 8, flexShrink: 0,
          background: 'rgb(var(--ds-accent))',
          color: 'rgb(var(--ds-text-inverse))',
          fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 4,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Complete Profile <ChevronRight size={13} />
      </Link>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        title="Dismiss"
        style={{
          padding: 4, borderRadius: 6, flexShrink: 0,
          border: 'none', background: 'transparent',
          cursor: 'pointer',
          color: 'rgb(var(--ds-text-muted))',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
