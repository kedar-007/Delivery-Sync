import React from 'react';

interface BrandLogoProps {
  variant?: 'mark' | 'full';
  /** Height in px — width scales proportionally */
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * BrandLogo — renders the DSV OpsPulse brand mark.
 *
 * Uses CSS custom properties so the mark always harmonises with the active
 * theme.  The sidebar sets --ds-primary / --ds-accent on :root, so both
 * light and dark (and every colour preset) are handled automatically.
 *
 * variant="mark"  → adaptive SVG icon for sidebar / compact contexts
 * variant="full"  → full logo PNG with text, for splash / loader contexts
 */
const BrandLogo = ({ variant = 'full', height = 36, className, style }: BrandLogoProps) => {
  // useId must be called unconditionally (Rules of Hooks)
  const rawId = React.useId();
  const uid   = rawId.replace(/:/g, '');

  if (variant === 'mark') {
    const s = height;

    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ flexShrink: 0, ...style }}
        aria-label="DSV OpsPulse"
      >
        <defs>
          {/* Primary-colour background gradient — pulls from theme CSS vars */}
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="rgb(var(--ds-primary))"       stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--ds-primary-hover))" stopOpacity="1" />
          </linearGradient>

          {/* Accent-colour gem stroke — pulls from theme CSS vars */}
          <linearGradient id={`${uid}-gem`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="rgb(var(--ds-accent))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgb(var(--ds-accent))" stopOpacity="0.5" />
          </linearGradient>

          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Rounded square background — theme primary */}
        <rect width="40" height="40" rx="10" fill={`url(#${uid}-bg)`} />

        {/* Subtle top-edge shine */}
        <rect width="40" height="20" rx="10" fill="white" fillOpacity="0.08" />

        {/* Hexagon gem — theme accent */}
        <path
          d="M20 8 L29.5 13.5 L29.5 26.5 L20 32 L10.5 26.5 L10.5 13.5 Z"
          fill="none"
          stroke={`url(#${uid}-gem)`}
          strokeWidth="1.5"
          filter={`url(#${uid}-glow)`}
        />

        {/* Inner gem facets */}
        <path d="M20 8 L29.5 13.5 L20 20 Z" fill="white" fillOpacity="0.13" />
        <path d="M20 8 L10.5 13.5 L20 20 Z" fill="white" fillOpacity="0.06" />
        <path d="M20 20 L29.5 13.5 L29.5 26.5 Z" fill="white" fillOpacity="0.05" />
        <path d="M20 20 L10.5 26.5 L29.5 26.5 Z" fill="white" fillOpacity="0.10" />

        {/* Centre "D" wordmark */}
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="white"
          fillOpacity="0.95"
          letterSpacing="-0.5"
        >
          D
        </text>

        {/* Orbit dot — theme accent */}
        <circle cx="29.5" cy="20" r="2" fill="rgb(var(--ds-accent))" opacity="0.9" />
      </svg>
    );
  }

  // Full logo — static PNG (login / splash)
  return (
    <img
      src="/app/logo.png"
      alt="DSV OpsPulse"
      draggable={false}
      className={className}
      style={{
        height,
        width: 'auto',
        objectFit: 'contain',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
    />
  );
};

export default BrandLogo;
