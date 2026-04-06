import { type ReactElement, useEffect, useRef } from 'react';
import { LogOut, Mail, Clock, CalendarCheck, ShieldAlert, Ban, AlertTriangle, Lock } from 'lucide-react';
import { useAuth, SuspensionInfo } from '../../contexts/AuthContext';

/* ── Lock type configuration ─────────────────────────────────────────────── */
interface LockConfig {
  label: string;
  icon: ReactElement;
  accent: string;       // primary colour
  glow: string;         // box-shadow glow colour
  gradFrom: string;
  gradTo: string;
  badgeBg: string;
}

const LOCK_CONFIG: Record<string, LockConfig> = {
  TEMPORARY_SUSPEND: {
    label: 'Temporarily Suspended',
    icon: <Lock size={28} strokeWidth={1.5} />,
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    gradFrom: '#78350f',
    gradTo: '#1c1400',
    badgeBg: 'rgba(245,158,11,0.15)',
  },
  PAYMENT_HOLD: {
    label: 'Payment Hold',
    icon: <AlertTriangle size={28} strokeWidth={1.5} />,
    accent: '#f97316',
    glow: 'rgba(249,115,22,0.35)',
    gradFrom: '#7c2d12',
    gradTo: '#1c0900',
    badgeBg: 'rgba(249,115,22,0.15)',
  },
  PERMANENT_BLOCK: {
    label: 'Permanently Blocked',
    icon: <Ban size={28} strokeWidth={1.5} />,
    accent: '#ef4444',
    glow: 'rgba(239,68,68,0.35)',
    gradFrom: '#7f1d1d',
    gradTo: '#1c0000',
    badgeBg: 'rgba(239,68,68,0.15)',
  },
  SECURITY_HOLD: {
    label: 'Security Hold',
    icon: <ShieldAlert size={28} strokeWidth={1.5} />,
    accent: '#a855f7',
    glow: 'rgba(168,85,247,0.35)',
    gradFrom: '#4a1d96',
    gradTo: '#0d0019',
    badgeBg: 'rgba(168,85,247,0.15)',
  },
};

const DEFAULT_CONFIG: LockConfig = {
  label: 'Account Suspended',
  icon: <Ban size={28} strokeWidth={1.5} />,
  accent: '#ef4444',
  glow: 'rgba(239,68,68,0.35)',
  gradFrom: '#7f1d1d',
  gradTo: '#1c0000',
  badgeBg: 'rgba(239,68,68,0.15)',
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return null; }
}

/* ── Particle canvas ─────────────────────────────────────────────────────── */
function ParticleCanvas({ accent }: { accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const particles: { x: number; y: number; r: number; vx: number; vy: number; alpha: number; da: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 55; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.1,
        da: (Math.random() - 0.5) * 0.005,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.da;
        if (p.alpha > 0.6 || p.alpha < 0.05) p.da *= -1;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = accent + Math.round(p.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [accent]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function SuspendedScreen({ info }: { info: SuspensionInfo }) {
  const { logout } = useAuth();
  const cfg = LOCK_CONFIG[info.lockType || ''] ?? DEFAULT_CONFIG;
  const lockedDate = formatDate(info.lockedAt);
  const unlockDate = formatDate(info.unlockDate);
  const isCancelled = info.status === 'CANCELLED';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${cfg.gradFrom}cc 0%, #070b14 70%)`,
        fontFamily: 'inherit',
        overflow: 'hidden',
        padding: '20px',
      }}
    >
      {/* Animated particles */}
      <ParticleCanvas accent={cfg.accent} />

      {/* Noise texture overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          opacity: 0.025,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundSize: '160px 160px',
          pointerEvents: 'none',
        }}
      />

      {/* Glowing orb behind card */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          pointerEvents: 'none',
          opacity: 0.4,
        }}
      />

      {/* Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 480,
          background: 'linear-gradient(160deg, rgba(15,23,42,0.95) 0%, rgba(8,12,24,0.98) 100%)',
          border: `1px solid ${cfg.accent}28`,
          borderRadius: 28,
          padding: '44px 40px 40px',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 40px 100px rgba(0,0,0,0.7), 0 0 60px ${cfg.glow}`,
          backdropFilter: 'blur(24px)',
          textAlign: 'center',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '10%',
            right: '10%',
            height: 2,
            background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)`,
            borderRadius: '0 0 4px 4px',
          }}
        />

        {/* Icon ring */}
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 24 }}>
          {/* outer pulse ring */}
          <div
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              border: `1px solid ${cfg.accent}30`,
              animation: 'pulse-ring 2.5s ease-in-out infinite',
            }}
          />
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${cfg.accent}30, ${cfg.accent}08)`,
              border: `1.5px solid ${cfg.accent}60`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: cfg.accent,
              boxShadow: `0 0 24px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}
          >
            {cfg.icon}
          </div>
        </div>

        {/* Status badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: cfg.badgeBg,
            border: `1px solid ${cfg.accent}40`,
            borderRadius: 999,
            padding: '5px 14px',
            color: cfg.accent,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 22,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: cfg.accent,
              boxShadow: `0 0 6px ${cfg.accent}`,
              flexShrink: 0,
            }}
          />
          {cfg.label}
        </div>

        {/* Org name */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#f1f5f9',
            margin: '0 0 10px',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}
        >
          {info.tenantName || 'Your Organisation'}
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 32px', lineHeight: 1.6 }}>
          This workspace is currently{' '}
          <span style={{ color: cfg.accent, fontWeight: 600 }}>
            {isCancelled ? 'permanently cancelled' : 'suspended'}
          </span>{' '}
          and cannot be accessed.
        </p>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
            marginBottom: 24,
          }}
        />

        {/* Detail rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
          {info.reason && (
            <DetailRow icon="⚠️" label="Reason" value={info.reason} valueColor="#fcd34d" />
          )}
          {lockedDate && (
            <DetailRow icon={<Clock size={14} />} label={isCancelled ? 'Cancelled on' : 'Suspended on'} value={lockedDate} />
          )}
          {unlockDate && !isCancelled && (
            <DetailRow icon={<CalendarCheck size={14} />} label="Expected reinstatement" value={unlockDate} valueColor="#86efac" />
          )}
        </div>

        {/* Contact box */}
        <div
          style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            marginBottom: 28,
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(99,102,241,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#818cf8',
            }}
          >
            <Mail size={15} />
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
            If you believe this is a mistake, contact your{' '}
            <strong style={{ color: '#a5b4fc' }}>platform administrator</strong> or reach out to{' '}
            <strong style={{ color: '#a5b4fc' }}>support</strong> for assistance.
          </p>
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '12px 24px',
            color: '#cbd5e1',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
            e.currentTarget.style.color = '#f1f5f9';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = '#cbd5e1';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          }}
        >
          <LogOut size={15} />
          Sign out of Delivery Sync
        </button>

        {/* Bottom watermark */}
        <p style={{ fontSize: 11, color: '#1e293b', marginTop: 20, letterSpacing: '0.04em' }}>
          DELIVERY SYNC · WORKSPACE ACCESS CONTROL
        </p>
      </div>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);    opacity: 0.6; }
          50%  { transform: scale(1.15); opacity: 0.2; }
          100% { transform: scale(1);    opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

/* ── Detail row ──────────────────────────────────────────────────────────── */
function DetailRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: ReactElement | string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: '10px 14px',
      }}
    >
      <span style={{ color: '#475569', fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: '#475569', flexShrink: 0, minWidth: 100 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: valueColor || '#94a3b8',
          marginLeft: 'auto',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
