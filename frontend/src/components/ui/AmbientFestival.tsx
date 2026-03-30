/**
 * AmbientFestival — persistent, non-blocking festival background particles.
 *
 * • Fixed overlay, z-index 1, pointer-events: none → never blocks clicks
 * • Very low opacity (0.10 – 0.22) → decorative, not distracting
 * • Driven by FestivalContext → active for the full festival period
 */
import React, { useMemo, useEffect, useRef } from 'react';
import { useFestival } from '../../contexts/FestivalContext';

/* ── CSS injected once into <head> ──────────────────────────────────────── */
const KEYFRAMES = `
@keyframes afloat  { 0%{transform:translateY(0)   rotate(0deg)  scale(1);  opacity:var(--af-op)}
                    50%{transform:translateY(-40px) rotate(180deg) scale(1.1);opacity:calc(var(--af-op)*0.6)}
                   100%{transform:translateY(-110vh) rotate(360deg) scale(0.7);opacity:0} }

@keyframes afall   { 0%{transform:translateY(-30px) rotate(0deg);  opacity:var(--af-op)}
                   100%{transform:translateY(108vh)  rotate(540deg); opacity:0.05} }

@keyframes atwink  { 0%,100%{opacity:var(--af-op); transform:scale(1)}
                        50%{opacity:calc(var(--af-op)*0.2); transform:scale(0.55)} }

@keyframes adrift  { 0%{transform:translate(0,0)        scale(1);   opacity:var(--af-op)}
                    40%{transform:translate(25px,-45px)  scale(1.15); opacity:calc(var(--af-op)*0.7)}
                   100%{transform:translate(-15px,-100vh) scale(0.6); opacity:0} }

@keyframes hstripe { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
`;

let _cssInjected = false;
function injectCss() {
  if (_cssInjected) return;
  const el = document.createElement('style');
  el.id = 'ambient-festival-css';
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
  _cssInjected = true;
}

/* ── Stable particle seed (so positions don't jump on re-render) ──────── */
interface Particle {
  id: number;
  x: number;       // %
  startY: number;  // % (top for fall/drift; bottom edge for float)
  char: string;
  color: string;
  size: number;    // px
  delay: number;   // s
  dur: number;     // s
  opacity: number; // 0.10–0.22
}

function buildParticles(
  _festivalKey: string,
  chars: string[],
  colors: string[],
  animation: string,
  n = 28,
): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const x = (i * 137.508) % 100;
    const startY =
      animation === 'fall' || animation === 'drift'
        ? -8
        : 95 + (i % 5) * 2;

    return {
      id: i,
      x,
      startY,
      char: chars[i % chars.length],
      color: colors[i % colors.length],
      size: 16 + (i % 5) * 5,            // 16–36 px — much bigger
      delay: parseFloat(((i * 0.61) % 9).toFixed(2)),
      dur: parseFloat((9 + (i % 6) * 2).toFixed(1)),
      opacity: parseFloat((0.55 + (i % 4) * 0.12).toFixed(2)), // 0.55–0.91 — visible
    };
  });
}

const animMap: Record<string, string> = {
  float:   'afloat',
  fall:    'afall',
  twinkle: 'atwink',
  drift:   'adrift',
};

/* ── Component ───────────────────────────────────────────────────────────── */
const AmbientFestival: React.FC = () => {
  const { festival } = useFestival();
  const injected = useRef(false);

  useEffect(() => {
    if (!injected.current) { injectCss(); injected.current = true; }
  }, []);

  const particles = useMemo(() => {
    if (!festival) return [];
    return buildParticles(
      festival.key,
      festival.particleChars,
      festival.particleColors,
      festival.particleAnimation,
    );
  }, [festival]);

  if (!festival) return null;

  const anim = animMap[festival.particleAnimation] ?? 'afloat';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        pointerEvents: 'none',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {particles.map((p) => (
        <span
          key={`${festival.key}-${p.id}`}
          style={
            {
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.startY}%`,
              fontSize: p.size,
              color: p.color,
              lineHeight: 1,
              display: 'block',
              '--af-op': p.opacity,
              opacity: p.opacity,
              animation: `${anim} ${p.dur}s ${p.delay}s infinite ease-in-out`,
              // Dark outline shadow → visible on white/light bg
              // Colour glow → visible on dark bg
              // Both together → works on any background
              filter: `drop-shadow(0 0 ${Math.round(p.size * 0.4)}px ${p.color}) drop-shadow(0 1px 3px rgba(0,0,0,0.65))`,
            } as React.CSSProperties
          }
        >
          {p.char}
        </span>
      ))}
    </div>
  );
};

export default AmbientFestival;
