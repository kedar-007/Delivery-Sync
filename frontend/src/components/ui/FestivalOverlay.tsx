import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAnnouncements, useMarkAnnouncementRead } from '../../hooks/usePeople';

/* ── Keyframe CSS injected once ─────────────────────────────────────────── */
const CSS = `
@keyframes fw-burst { 0%{transform:scale(0) rotate(0deg);opacity:1} 60%{opacity:0.8} 100%{transform:scale(2.5) rotate(90deg);opacity:0} }
@keyframes fw-ring  { 0%{transform:scale(0);opacity:1} 100%{transform:scale(3);opacity:0} }
@keyframes snowfall { 0%{transform:translateY(-30px) rotate(0deg) scale(1);opacity:1} 100%{transform:translateY(105vh) rotate(720deg) scale(0.5);opacity:0.2} }
@keyframes confetti-fall { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(105vh) rotate(720deg);opacity:0} }
@keyframes twinkle   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.2;transform:scale(0.7)} }
@keyframes color-blob { 0%{transform:scale(0) rotate(0deg);opacity:0.9} 50%{opacity:0.7} 100%{transform:scale(2.5) rotate(180deg);opacity:0} }
@keyframes float-up  { 0%{transform:translateY(0px) scale(1);opacity:1} 100%{transform:translateY(-120vh) scale(0.5);opacity:0} }
@keyframes pulse-glow { 0%,100%{box-shadow:0 0 30px rgba(255,200,0,0.4)} 50%{box-shadow:0 0 80px rgba(255,200,0,0.9),0 0 120px rgba(255,100,0,0.5)} }
@keyframes text-shimmer { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes bounce-in { 0%{transform:scale(0.3) translateY(60px);opacity:0} 60%{transform:scale(1.05) translateY(-10px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
`;

/* ── Festival themes ─────────────────────────────────────────────────────── */
interface FestivalTheme {
  name: string; emoji: string; bg: string; bgOverlay: string;
  textColor: string; accentColor: string; cardBg: string;
  particles: 'fireworks' | 'snow' | 'confetti' | 'stars' | 'colors';
  particleChars?: string[];
  colors: string[];
  greeting: string;
}

const THEMES: Record<string, FestivalTheme> = {
  DIWALI: {
    name: 'Diwali', emoji: '🪔',
    bg: 'linear-gradient(135deg, #0d001f 0%, #1f0533 25%, #2d0a00 60%, #1a0800 100%)',
    bgOverlay: 'rgba(20,0,40,0.85)',
    textColor: '#ffd700', accentColor: '#ff8c00',
    cardBg: 'rgba(40,10,0,0.9)',
    particles: 'fireworks',
    colors: ['#ff6b35','#ffd700','#ff3366','#ff9933','#cc33ff','#fff','#ffcc00','#ff6600','#ff0066'],
    greeting: '✨ May the festival of lights bring joy, prosperity and happiness to you and your family! ✨',
  },
  CHRISTMAS: {
    name: 'Christmas', emoji: '🎄',
    bg: 'linear-gradient(135deg, #0d2b0d 0%, #1a0000 50%, #0d2b0d 100%)',
    bgOverlay: 'rgba(10,30,10,0.88)',
    textColor: '#f0f0f0', accentColor: '#ff4444',
    cardBg: 'rgba(10,30,10,0.9)',
    particles: 'snow',
    particleChars: ['❄','❅','❆','*','✦'],
    colors: ['#ffffff','#ff4444','#22aa22','#ffd700','#aaffaa','#ffaaaa'],
    greeting: '🎁 Wishing you a very Merry Christmas! May your days be merry and bright! 🎅',
  },
  HOLI: {
    name: 'Holi', emoji: '🌈',
    bg: 'linear-gradient(135deg, #220011 0%, #002244 50%, #112200 100%)',
    bgOverlay: 'rgba(10,0,20,0.7)',
    textColor: '#ffffff', accentColor: '#ff66ff',
    cardBg: 'rgba(0,0,0,0.75)',
    particles: 'colors',
    colors: ['#ff0000','#ff6600','#ffcc00','#00cc00','#0066ff','#cc00ff','#ff0099','#00ffcc','#ff3300'],
    greeting: '🎨 Happy Holi! May the colors of this festival fill your life with happiness, health and prosperity! 🌈',
  },
  EID: {
    name: 'Eid', emoji: '🌙',
    bg: 'linear-gradient(135deg, #010d01 0%, #001a0d 40%, #050014 100%)',
    bgOverlay: 'rgba(0,15,5,0.9)',
    textColor: '#ffd700', accentColor: '#c0a000',
    cardBg: 'rgba(0,20,10,0.9)',
    particles: 'stars',
    particleChars: ['★','✦','✧','✨','🌙','⭐','✵'],
    colors: ['#ffd700','#c0a000','#ffffff','#aaffaa','#ffcc44'],
    greeting: '🌙 Eid Mubarak! May Allah bless you with peace, happiness and prosperity! 🕌',
  },
  NEW_YEAR: {
    name: 'New Year', emoji: '🎆',
    bg: 'linear-gradient(135deg, #000020 0%, #000050 50%, #000020 100%)',
    bgOverlay: 'rgba(0,0,30,0.9)',
    textColor: '#ffffff', accentColor: '#ffd700',
    cardBg: 'rgba(0,0,40,0.9)',
    particles: 'confetti',
    colors: ['#ff4444','#4444ff','#44ff44','#ffd700','#ff44ff','#44ffff','#ffffff','#ff8800'],
    greeting: '🎆 Happy New Year! Wishing you joy, success and happiness in the year ahead! 🥂',
  },
  NAVRATRI: {
    name: 'Navratri', emoji: '💃',
    bg: 'linear-gradient(135deg, #1a0011 0%, #330022 30%, #110033 60%, #001122 100%)',
    bgOverlay: 'rgba(20,0,20,0.85)',
    textColor: '#ff99cc', accentColor: '#ff44aa',
    cardBg: 'rgba(30,0,25,0.9)',
    particles: 'colors',
    colors: ['#ff0066','#ff6600','#ffcc00','#00ccff','#9900ff','#ff3399','#ff9933','#33ffcc'],
    greeting: '💃 Happy Navratri! May Goddess Durga bless you with strength, wisdom and joy! 🙏',
  },
  DUSSEHRA: {
    name: 'Dussehra', emoji: '🏹',
    bg: 'linear-gradient(135deg, #1a0000 0%, #330500 40%, #1a0a00 100%)',
    bgOverlay: 'rgba(20,2,0,0.88)',
    textColor: '#ff8800', accentColor: '#ff3300',
    cardBg: 'rgba(25,5,0,0.9)',
    particles: 'fireworks',
    colors: ['#ff6600','#ff3300','#ffd700','#ff9900','#cc3300','#ffcc00','#ff0000'],
    greeting: '🏹 Happy Dussehra! May good always triumph over evil! Wishing you victory in all your endeavours! 🙏',
  },
  PONGAL: {
    name: 'Pongal', emoji: '🍯',
    bg: 'linear-gradient(135deg, #1a0800 0%, #2d1500 40%, #1a1a00 100%)',
    bgOverlay: 'rgba(20,10,0,0.88)',
    textColor: '#ffcc00', accentColor: '#ff6600',
    cardBg: 'rgba(25,12,0,0.9)',
    particles: 'fireworks',
    colors: ['#ffcc00','#ff6600','#ff3300','#ffaa00','#ffffff','#ffdd44'],
    greeting: '🌾 Happy Pongal! May this harvest festival bring abundant blessings and prosperity! 🌾',
  },
  EASTER: {
    name: 'Easter', emoji: '🐣',
    bg: 'linear-gradient(135deg, #0a1020 0%, #1a0530 50%, #051a10 100%)',
    bgOverlay: 'rgba(8,8,25,0.88)',
    textColor: '#ffccff', accentColor: '#ff99ff',
    cardBg: 'rgba(10,5,25,0.9)',
    particles: 'confetti',
    colors: ['#ff99ff','#99ffcc','#ffff99','#99ccff','#ffcc99','#ccffcc','#ff99cc'],
    greeting: '🐣 Happy Easter! May this special day bring you joy, peace and new beginnings! 🌷',
  },
};

/* ── Particle generation ─────────────────────────────────────────────────── */
interface Particle { id: number; x: number; y: number; color: string; char?: string; size: number; delay: number; dur: number; rot?: number; }

function generateParticles(theme: FestivalTheme, n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: (i * 137.508) % 100,
    y: theme.particles === 'fireworks' ? 20 + ((i * 41) % 60) : theme.particles === 'stars' ? (i * 71) % 90 : -5,
    color: theme.colors[i % theme.colors.length],
    char: theme.particleChars?.[i % theme.particleChars.length],
    size: theme.particles === 'snow' ? 12 + (i % 3) * 8 : theme.particles === 'colors' ? 40 + (i % 5) * 30 : theme.particles === 'stars' ? 10 + (i % 4) * 6 : 8 + (i % 4) * 6,
    delay: (i * 0.31) % 5,
    dur: theme.particles === 'snow' ? 5 + (i % 4) : theme.particles === 'fireworks' ? 1.2 + (i % 3) * 0.4 : theme.particles === 'stars' ? 1.5 + (i % 3) : 3 + (i % 3),
    rot: (i * 73) % 360,
  }));
}

/* ── Particle renderer ───────────────────────────────────────────────────── */
const Particles = ({ theme, particles }: { theme: FestivalTheme; particles: Particle[] }) => (
  <>
    {particles.map(p => {
      const base: React.CSSProperties = {
        position: 'absolute', left: `${p.x}%`, pointerEvents: 'none', zIndex: 1,
        animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in',
      };
      if (theme.particles === 'fireworks') {
        return (
          <React.Fragment key={p.id}>
            <div style={{ ...base, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: p.color, animationName: 'fw-burst' }} />
            <div style={{ ...base, top: `${p.y}%`, width: p.size * 2.5, height: p.size * 2.5, borderRadius: '50%', border: `2px solid ${p.color}`, animationName: 'fw-ring', animationDelay: `${p.delay + 0.1}s` }} />
          </React.Fragment>
        );
      }
      if (theme.particles === 'snow') {
        return <div key={p.id} style={{ ...base, top: -p.size, fontSize: p.size, color: p.color, animationName: 'snowfall', animationTimingFunction: 'linear' }}>{p.char}</div>;
      }
      if (theme.particles === 'confetti') {
        const isRect = p.id % 2 === 0;
        return <div key={p.id} style={{ ...base, top: -p.size, width: isRect ? p.size * 0.4 : p.size * 0.6, height: isRect ? p.size : p.size * 0.6, borderRadius: isRect ? 2 : '50%', background: p.color, animationName: 'confetti-fall', animationTimingFunction: 'linear', transform: `rotate(${p.rot}deg)` }} />;
      }
      if (theme.particles === 'stars') {
        return <div key={p.id} style={{ ...base, top: `${p.y}%`, fontSize: p.size, color: p.color, animationName: 'twinkle', animationTimingFunction: 'ease-in-out' }}>{p.char}</div>;
      }
      if (theme.particles === 'colors') {
        return <div key={p.id} style={{ ...base, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: `${p.color}cc`, animationName: 'color-blob', filter: 'blur(3px)' }} />;
      }
      return null;
    })}
  </>
);

/* ── Main component ──────────────────────────────────────────────────────── */
const FestivalOverlay = () => {
  const { data } = useAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [styleInjected, setStyleInjected] = useState(false);

  useEffect(() => {
    if (!styleInjected) {
      const el = document.createElement('style');
      el.textContent = CSS;
      document.head.appendChild(el);
      setStyleInjected(true);
    }
  }, [styleInjected]);

  const announcements: any[] = Array.isArray(data) ? data : [];
  const festivalAnn = announcements.find(
    a => a.subtype === 'FESTIVAL' && !a.isRead && a.id !== dismissed
  );

  const theme = festivalAnn ? (THEMES[festivalAnn.festivalKey] ?? THEMES['DIWALI']) : null;
  const particles = useMemo(
    () => (theme ? generateParticles(theme, 40) : []),
    [theme]
  );

  if (!festivalAnn || !theme) return null;

  const handleDismiss = () => {
    markRead.mutate(festivalAnn.id);
    setDismissed(festivalAnn.id);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: theme.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
      onClick={handleDismiss}
    >
      {/* Animated particles */}
      <Particles theme={theme} particles={particles} />

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute', top: 20, right: 20,
          zIndex: 10, background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '50%', width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)',
          transition: 'background 0.2s',
        }}
        title="Dismiss"
      >
        <X size={20} />
      </button>

      {/* Content card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 5,
          background: theme.cardBg,
          border: `1px solid ${theme.accentColor}44`,
          borderRadius: 24, padding: '40px 48px',
          maxWidth: 560, width: '90%',
          textAlign: 'center',
          backdropFilter: 'blur(12px)',
          boxShadow: `0 0 60px ${theme.accentColor}30, 0 8px 40px rgba(0,0,0,0.6)`,
          animation: 'bounce-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          animationName: 'bounce-in',
        }}
      >
        {/* Festival emoji */}
        <div style={{ fontSize: 72, marginBottom: 12, lineHeight: 1, filter: 'drop-shadow(0 0 20px rgba(255,200,0,0.6))' }}>
          {theme.emoji}
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 28, fontWeight: 800, marginBottom: 8,
          background: `linear-gradient(90deg, ${theme.textColor}, ${theme.accentColor}, ${theme.textColor})`,
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: 'text-shimmer 3s ease infinite',
        }}>
          {festivalAnn.title}
        </h1>

        {/* Festival name badge */}
        <div style={{
          display: 'inline-block', marginBottom: 16,
          background: `${theme.accentColor}22`,
          border: `1px solid ${theme.accentColor}66`,
          borderRadius: 20, padding: '4px 16px',
          fontSize: 13, fontWeight: 600, color: theme.accentColor,
          letterSpacing: 1,
        }}>
          {theme.name.toUpperCase()}
        </div>

        {/* Greeting */}
        <p style={{ fontSize: 15, color: `${theme.textColor}cc`, lineHeight: 1.7, marginBottom: 8 }}>
          {theme.greeting}
        </p>

        {/* Content */}
        {festivalAnn.content && festivalAnn.content !== festivalAnn.title && (
          <p style={{ fontSize: 14, color: `${theme.textColor}88`, lineHeight: 1.6, marginBottom: 24 }}>
            {festivalAnn.content}
          </p>
        )}

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          style={{
            marginTop: 24, padding: '12px 36px',
            background: `linear-gradient(135deg, ${theme.accentColor}, ${theme.textColor}88)`,
            border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 700, color: '#000',
            cursor: 'pointer', letterSpacing: 0.5,
            boxShadow: `0 4px 20px ${theme.accentColor}66`,
            transition: 'transform 0.2s',
          }}
        >
          Celebrate! 🎉
        </button>

        <p style={{ fontSize: 11, color: `${theme.textColor}44`, marginTop: 16 }}>
          Click anywhere to dismiss
        </p>
      </div>
    </div>
  );
};

export default FestivalOverlay;
