import React from 'react';
import BrandLogo from './BrandLogo';

const AppLoader = () => (
  <div
    className="min-h-screen w-full flex flex-col items-center justify-center"
    style={{ background: '#0a0f1e' }}
  >
    {/* Radial glow */}
    <div
      className="absolute"
      style={{
        width: 320,
        height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(32,178,170,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}
    />

    <div className="relative flex flex-col items-center gap-6 z-10">
      {/* Logo with spinning rings */}
      <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
        {/* Outer ring */}
        <svg width="100" height="100" viewBox="0 0 100 100"
          style={{ animation: 'ds-spin-slow 4s linear infinite', position: 'absolute' }}>
          <circle cx="50" cy="50" r="46" fill="none"
            stroke="rgba(32,178,170,0.2)" strokeWidth="1.5" strokeDasharray="8 6" />
        </svg>
        {/* Inner ring */}
        <svg width="76" height="76" viewBox="0 0 76 76"
          style={{ animation: 'ds-spin-rev 2.5s linear infinite', position: 'absolute' }}>
          <circle cx="38" cy="38" r="34" fill="none"
            stroke="rgba(32,178,170,0.15)" strokeWidth="1" strokeDasharray="4 8" />
        </svg>

        {/* Actual logo PNG — centred */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <BrandLogo variant="full" height={72} />
        </div>

        {/* Pulse ring */}
        <div style={{
          position: 'absolute',
          width: 64, height: 64,
          borderRadius: '50%',
          border: '2px solid rgba(32,178,170,0.35)',
          animation: 'ds-pulse-ring 2s ease-out infinite',
        }} />
      </div>

      {/* Tagline */}
      <div className="flex flex-col items-center gap-1">
        <span style={{
          fontSize: 11,
          color: 'rgba(148,163,184,0.6)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          Delivery Intelligence Platform
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        width: 140, height: 2, borderRadius: 2,
        background: 'rgba(32,178,170,0.12)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: 'linear-gradient(90deg, #20b2aa, #5eead4)',
          animation: 'ds-progress 1.6s ease-in-out infinite',
        }} />
      </div>
    </div>

    <style>{`
      @keyframes ds-spin-slow  { to { transform: rotate(360deg);  } }
      @keyframes ds-spin-rev   { to { transform: rotate(-360deg); } }
      @keyframes ds-pulse-ring {
        0%   { transform: scale(1);    opacity: 0.6; }
        100% { transform: scale(1.7);  opacity: 0;   }
      }
      @keyframes ds-progress {
        0%   { width: 0%;   margin-left: 0%;   }
        50%  { width: 60%;  margin-left: 20%;  }
        100% { width: 0%;   margin-left: 100%; }
      }
    `}</style>
  </div>
);

export default AppLoader;
