import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAnnouncements, useMarkAnnouncementRead } from '../../hooks/usePeople';

/* ── Keyframe CSS ────────────────────────────────────────────────────────── */
const CSS = `
@keyframes fw-burst  { 0%{transform:scale(0) rotate(0deg);opacity:1} 70%{opacity:1} 100%{transform:scale(3) rotate(90deg);opacity:0} }
@keyframes fw-ring   { 0%{transform:scale(0);opacity:1} 100%{transform:scale(4);opacity:0} }
@keyframes fw-trail  { 0%{transform:scaleY(1);opacity:1} 100%{transform:scaleY(0);opacity:0} }
@keyframes snowfall  { 0%{transform:translateY(-40px) rotate(0deg) scale(1);opacity:1} 90%{opacity:1} 100%{transform:translateY(105vh) rotate(720deg) scale(0.6);opacity:0} }
@keyframes confetti-fall { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 90%{opacity:1} 100%{transform:translateY(105vh) rotate(900deg);opacity:0} }
@keyframes twinkle   { 0%,100%{opacity:1;transform:scale(1) rotate(0deg)} 50%{opacity:0.3;transform:scale(0.6) rotate(180deg)} }
@keyframes color-blob { 0%{transform:scale(0) rotate(0deg);opacity:1} 60%{opacity:0.9} 100%{transform:scale(3) rotate(180deg);opacity:0} }
@keyframes float-up  { 0%{transform:translateY(0px) scale(1);opacity:1} 100%{transform:translateY(-110vh) scale(0.4);opacity:0} }
@keyframes text-shimmer { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes bounce-in { 0%{transform:scale(0.2) translateY(80px);opacity:0} 65%{transform:scale(1.08) translateY(-12px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
@keyframes glow-pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
@keyframes ray-spin  { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes hstripe   { 0%{background-position:0% 0%} 100%{background-position:200% 0%} }
`;

/* ── Festival themes ─────────────────────────────────────────────────────── */
interface FestivalTheme {
  name: string; emoji: string;
  overlay: string;        // semi-transparent overlay tint
  glowColor: string;      // center radial glow
  rayColor: string;       // light ray color
  textColor: string; accentColor: string; cardBg: string;
  particles: 'fireworks' | 'snow' | 'confetti' | 'stars' | 'colors';
  particleChars?: string[];
  colors: string[];
  greeting: string;
}

const THEMES: Record<string, FestivalTheme> = {
  DIWALI: {
    name: 'Diwali', emoji: '🪔',
    overlay: 'rgba(40,5,0,0.78)',
    glowColor: 'rgba(255,160,0,0.55)',
    rayColor: 'rgba(255,200,0,0.18)',
    textColor: '#ffd700', accentColor: '#ff8c00',
    cardBg: 'rgba(60,15,0,0.88)',
    particles: 'fireworks',
    colors: ['#ff6b35','#ffd700','#ff3366','#ff9933','#cc33ff','#fff700','#ffcc00','#ff6600','#ff0066','#ffffff'],
    greeting: '✨ May the festival of lights bring joy, prosperity and happiness to you and your family! ✨',
  },
  CHRISTMAS: {
    name: 'Christmas', emoji: '🎄',
    overlay: 'rgba(5,30,5,0.80)',
    glowColor: 'rgba(255,80,80,0.45)',
    rayColor: 'rgba(100,255,100,0.12)',
    textColor: '#f8f8f8', accentColor: '#ff4444',
    cardBg: 'rgba(10,35,10,0.90)',
    particles: 'snow',
    particleChars: ['❄','❅','❆','*','✦','✧'],
    colors: ['#ffffff','#ff4444','#22cc22','#ffd700','#aaffaa','#ffaaaa','#fff'],
    greeting: '🎁 Wishing you a very Merry Christmas! May your days be merry and bright! 🎅',
  },
  HOLI: {
    name: 'Holi', emoji: '🌈',
    overlay: 'rgba(10,0,20,0.72)',
    glowColor: 'rgba(255,0,200,0.40)',
    rayColor: 'rgba(255,200,0,0.10)',
    textColor: '#ffffff', accentColor: '#ff66ff',
    cardBg: 'rgba(15,0,30,0.85)',
    particles: 'colors',
    colors: ['#ff0000','#ff6600','#ffee00','#00ee00','#0066ff','#cc00ff','#ff0099','#00ffee','#ff3300','#ffff00'],
    greeting: '🎨 Happy Holi! May the colors of this festival fill your life with happiness and prosperity! 🌈',
  },
  EID: {
    name: 'Eid', emoji: '🌙',
    overlay: 'rgba(0,20,8,0.82)',
    glowColor: 'rgba(255,220,0,0.45)',
    rayColor: 'rgba(255,220,0,0.12)',
    textColor: '#ffd700', accentColor: '#ffcc00',
    cardBg: 'rgba(0,25,12,0.90)',
    particles: 'stars',
    particleChars: ['★','✦','✧','✨','🌙','⭐','✵','✴'],
    colors: ['#ffd700','#ffee44','#ffffff','#aaffaa','#ffcc44','#ffe066','#fff'],
    greeting: '🌙 Eid Mubarak! May Allah bless you with peace, happiness and prosperity! 🕌',
  },
  NEW_YEAR: {
    name: 'New Year', emoji: '🎆',
    overlay: 'rgba(0,0,30,0.82)',
    glowColor: 'rgba(100,100,255,0.50)',
    rayColor: 'rgba(255,220,0,0.14)',
    textColor: '#ffffff', accentColor: '#ffd700',
    cardBg: 'rgba(5,5,50,0.90)',
    particles: 'confetti',
    colors: ['#ff4444','#4466ff','#44ff66','#ffd700','#ff44ff','#44ffff','#ffffff','#ff8800','#aaaaff'],
    greeting: '🎆 Happy New Year! Wishing you joy, success and happiness in the year ahead! 🥂',
  },
  NAVRATRI: {
    name: 'Navratri', emoji: '💃',
    overlay: 'rgba(25,0,20,0.78)',
    glowColor: 'rgba(255,0,150,0.45)',
    rayColor: 'rgba(255,100,200,0.12)',
    textColor: '#ff99cc', accentColor: '#ff44aa',
    cardBg: 'rgba(35,0,28,0.90)',
    particles: 'colors',
    colors: ['#ff0066','#ff6600','#ffcc00','#00ccff','#9900ff','#ff3399','#ff9933','#33ffcc','#ffff00'],
    greeting: '💃 Happy Navratri! May Goddess Durga bless you with strength, wisdom and joy! 🙏',
  },
  DUSSEHRA: {
    name: 'Dussehra', emoji: '🏹',
    overlay: 'rgba(25,3,0,0.80)',
    glowColor: 'rgba(255,100,0,0.50)',
    rayColor: 'rgba(255,200,0,0.14)',
    textColor: '#ff8800', accentColor: '#ff3300',
    cardBg: 'rgba(30,6,0,0.90)',
    particles: 'fireworks',
    colors: ['#ff6600','#ff3300','#ffd700','#ff9900','#cc3300','#ffcc00','#ff0000','#ffaa00','#fff'],
    greeting: '🏹 Happy Dussehra! May good always triumph over evil! Wishing you victory in all endeavours! 🙏',
  },
  PONGAL: {
    name: 'Pongal', emoji: '🍯',
    overlay: 'rgba(25,10,0,0.80)',
    glowColor: 'rgba(255,200,0,0.50)',
    rayColor: 'rgba(255,180,0,0.14)',
    textColor: '#ffcc00', accentColor: '#ff6600',
    cardBg: 'rgba(30,14,0,0.90)',
    particles: 'fireworks',
    colors: ['#ffcc00','#ff6600','#ff3300','#ffaa00','#ffffff','#ffdd44','#fff700'],
    greeting: '🌾 Happy Pongal! May this harvest festival bring abundant blessings and prosperity! 🌾',
  },
  EASTER: {
    name: 'Easter', emoji: '🐣',
    overlay: 'rgba(10,5,30,0.80)',
    glowColor: 'rgba(200,100,255,0.40)',
    rayColor: 'rgba(255,200,255,0.12)',
    textColor: '#ffccff', accentColor: '#ff99ff',
    cardBg: 'rgba(15,8,35,0.90)',
    particles: 'confetti',
    colors: ['#ff99ff','#99ffcc','#ffff99','#99ccff','#ffcc99','#ccffcc','#ff99cc','#ffffff'],
    greeting: '🐣 Happy Easter! May this special day bring you joy, peace and new beginnings! 🌷',
  },
};

/* ── Particle types ──────────────────────────────────────────────────────── */
interface Particle { id: number; x: number; y: number; color: string; char?: string; size: number; delay: number; dur: number; rot?: number; }

function generateParticles(theme: FestivalTheme, n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: (i * 137.508) % 100,
    y: theme.particles === 'fireworks' ? 10 + ((i * 41) % 65)
      : theme.particles === 'stars'    ? (i * 71) % 88
      : -8,
    color: theme.colors[i % theme.colors.length],
    char: theme.particleChars?.[i % theme.particleChars.length],
    // Bigger sizes for visibility
    size: theme.particles === 'snow'      ? 18 + (i % 4) * 10
        : theme.particles === 'colors'    ? 60 + (i % 6) * 40
        : theme.particles === 'stars'     ? 16 + (i % 5) * 8
        : theme.particles === 'confetti'  ? 14 + (i % 4) * 6
        : 12 + (i % 5) * 7,
    delay:  (i * 0.29) % 5,
    dur:    theme.particles === 'snow'     ? 5 + (i % 5)
          : theme.particles === 'fireworks'? 1.0 + (i % 4) * 0.35
          : theme.particles === 'stars'    ? 1.2 + (i % 4)
          : 2.5 + (i % 4),
    rot: (i * 73) % 360,
  }));
}

/* ── Particle renderer ───────────────────────────────────────────────────── */
const Particles = ({ theme, particles }: { theme: FestivalTheme; particles: Particle[] }) => (
  <>
    {particles.map(p => {
      const base: React.CSSProperties = {
        position: 'absolute', left: `${p.x}%`, pointerEvents: 'none', zIndex: 2,
        animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
        animationIterationCount: 'infinite', animationTimingFunction: 'ease-in',
      };

      if (theme.particles === 'fireworks') {
        const glow = `0 0 ${p.size * 2}px ${p.color}, 0 0 ${p.size * 4}px ${p.color}88`;
        return (
          <React.Fragment key={p.id}>
            <div style={{ ...base, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: p.color, boxShadow: glow, animationName: 'fw-burst' }} />
            <div style={{ ...base, top: `${p.y}%`, width: p.size * 3, height: p.size * 3, borderRadius: '50%', border: `3px solid ${p.color}`, boxShadow: `0 0 12px ${p.color}88`, animationName: 'fw-ring', animationDelay: `${p.delay + 0.05}s` }} />
          </React.Fragment>
        );
      }

      if (theme.particles === 'snow') {
        return (
          <div key={p.id} style={{ ...base, top: -p.size, fontSize: p.size, color: p.color, textShadow: `0 0 ${p.size}px ${p.color}, 0 0 ${p.size * 2}px ${p.color}88`, animationName: 'snowfall', animationTimingFunction: 'linear' }}>
            {p.char}
          </div>
        );
      }

      if (theme.particles === 'confetti') {
        const isRect = p.id % 3 !== 0;
        return (
          <div key={p.id} style={{ ...base, top: -p.size, width: isRect ? p.size * 0.5 : p.size * 0.7, height: isRect ? p.size : p.size * 0.7, borderRadius: isRect ? 3 : '50%', background: p.color, boxShadow: `0 0 8px ${p.color}`, animationName: 'confetti-fall', animationTimingFunction: 'linear', transform: `rotate(${p.rot}deg)` }} />
        );
      }

      if (theme.particles === 'stars') {
        return (
          <div key={p.id} style={{ ...base, top: `${p.y}%`, fontSize: p.size, color: p.color, textShadow: `0 0 ${p.size}px ${p.color}, 0 0 ${p.size * 2}px ${p.color}`, animationName: 'twinkle', animationTimingFunction: 'ease-in-out' }}>
            {p.char}
          </div>
        );
      }

      if (theme.particles === 'colors') {
        // Bright blobs with strong glow — no blur so they stay vivid
        return (
          <div key={p.id} style={{ ...base, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: p.color, opacity: 0.9, boxShadow: `0 0 ${p.size * 1.5}px ${p.color}, 0 0 ${p.size * 3}px ${p.color}66`, animationName: 'color-blob' }} />
        );
      }

      return null;
    })}
  </>
);

/* ── Light rays behind card ──────────────────────────────────────────────── */
const LightRays = ({ color }: { color: string }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
    <div style={{
      width: '180vmax', height: '180vmax',
      background: `conic-gradient(from 0deg, transparent 0deg, ${color} 3deg, transparent 6deg, transparent 18deg, ${color} 21deg, transparent 24deg, transparent 36deg, ${color} 39deg, transparent 42deg, transparent 54deg, ${color} 57deg, transparent 60deg, transparent 72deg, ${color} 75deg, transparent 78deg, transparent 90deg, ${color} 93deg, transparent 96deg, transparent 108deg, ${color} 111deg, transparent 114deg, transparent 126deg, ${color} 129deg, transparent 132deg, transparent 144deg, ${color} 147deg, transparent 150deg, transparent 162deg, ${color} 165deg, transparent 168deg, transparent 180deg, ${color} 183deg, transparent 186deg, transparent 198deg, ${color} 201deg, transparent 204deg, transparent 216deg, ${color} 219deg, transparent 222deg, transparent 234deg, ${color} 237deg, transparent 240deg, transparent 252deg, ${color} 255deg, transparent 258deg, transparent 270deg, ${color} 273deg, transparent 276deg, transparent 288deg, ${color} 291deg, transparent 294deg, transparent 306deg, ${color} 309deg, transparent 312deg, transparent 324deg, ${color} 327deg, transparent 330deg, transparent 342deg, ${color} 345deg, transparent 348deg, transparent 360deg)`,
      animation: 'ray-spin 18s linear infinite',
      transformOrigin: 'center',
    }} />
  </div>
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
    () => (theme ? generateParticles(theme, 60) : []),
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
        background: theme.overlay,
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
      onClick={handleDismiss}
    >
      {/* Radial center glow — makes the whole screen feel lit */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${theme.glowColor} 0%, transparent 70%)`,
        animation: 'glow-pulse 3s ease-in-out infinite',
      }} />

      {/* Rotating light rays */}
      <LightRays color={theme.rayColor} />

      {/* Animated particles */}
      <Particles theme={theme} particles={particles} />

      {/* Close button */}
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 10,
          background: 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.35)',
          borderRadius: '50%', width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          transition: 'background 0.2s, transform 0.2s',
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
          border: `1.5px solid ${theme.accentColor}66`,
          borderRadius: 28, padding: '44px 52px',
          maxWidth: 580, width: '90%',
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: `0 0 80px ${theme.accentColor}50, 0 0 30px ${theme.glowColor}, 0 12px 60px rgba(0,0,0,0.7)`,
          animation: 'bounce-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        {/* Emoji with glow */}
        <div style={{
          fontSize: 80, marginBottom: 14, lineHeight: 1,
          filter: `drop-shadow(0 0 24px ${theme.accentColor}) drop-shadow(0 0 48px ${theme.accentColor}88)`,
          animation: 'glow-pulse 2s ease-in-out infinite',
        }}>
          {theme.emoji}
        </div>

        {/* Shimmering title */}
        <h1 style={{
          fontSize: 30, fontWeight: 800, marginBottom: 10,
          background: `linear-gradient(90deg, ${theme.textColor}, ${theme.accentColor}, #ffffff, ${theme.accentColor}, ${theme.textColor})`,
          backgroundSize: '300% 100%',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: 'text-shimmer 3s ease infinite',
          textShadow: 'none',
        }}>
          {festivalAnn.title}
        </h1>

        {/* Festival badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
          background: `${theme.accentColor}25`,
          border: `1px solid ${theme.accentColor}88`,
          borderRadius: 20, padding: '5px 18px',
          fontSize: 13, fontWeight: 700, color: theme.accentColor,
          letterSpacing: 1.5,
          boxShadow: `0 0 16px ${theme.accentColor}44`,
        }}>
          <span>{theme.emoji}</span>
          {theme.name.toUpperCase()}
        </div>

        {/* Greeting text */}
        <p style={{
          fontSize: 15, color: theme.textColor, lineHeight: 1.75, marginBottom: 8,
          textShadow: `0 0 20px ${theme.accentColor}66`,
        }}>
          {theme.greeting}
        </p>

        {/* Custom content */}
        {festivalAnn.content && festivalAnn.content !== festivalAnn.title && (
          <p style={{
            fontSize: 14, color: `${theme.textColor}bb`, lineHeight: 1.65,
            marginBottom: 28, marginTop: 8,
          }}>
            {festivalAnn.content}
          </p>
        )}

        {/* Celebrate button */}
        <button
          onClick={handleDismiss}
          style={{
            marginTop: 22, padding: '13px 42px',
            background: `linear-gradient(135deg, ${theme.accentColor} 0%, ${theme.textColor} 100%)`,
            border: 'none', borderRadius: 14,
            fontSize: 16, fontWeight: 800, color: '#000',
            cursor: 'pointer', letterSpacing: 0.5,
            boxShadow: `0 4px 24px ${theme.accentColor}88, 0 0 40px ${theme.accentColor}44`,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        >
          Celebrate! 🎉
        </button>

        <p style={{ fontSize: 11, color: `${theme.textColor}55`, marginTop: 18, letterSpacing: 0.5 }}>
          Click anywhere outside to dismiss
        </p>
      </div>
    </div>
  );
};

export default FestivalOverlay;
