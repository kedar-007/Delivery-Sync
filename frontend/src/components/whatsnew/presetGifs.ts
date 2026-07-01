// ── Predefined release graphics ───────────────────────────────────────────────
// Self-contained animated SVG "GIFs" used as ready-made release banners. They
// animate in an <img> exactly like a GIF, but ship inline (no network, never
// break). A release stores a short token `preset:<key>` in media_url; custom
// URLs are stored as-is. resolveMedia() turns either into a usable <img src>.

export interface PresetGif {
  key: string;
  label: string;
  svg: string;
}

const banner = (gradFrom: string, gradTo: string, inner: string, extraCss = '') => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220" width="480" height="220">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${gradFrom}"/>
      <stop offset="1" stop-color="${gradTo}"/>
    </linearGradient>
  </defs>
  <style>
    .twinkle{animation:tw 2s ease-in-out infinite}
    .twinkle:nth-child(2n){animation-delay:.5s}
    .twinkle:nth-child(3n){animation-delay:1s}
    @keyframes tw{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}
    .spin{transform-box:fill-box;transform-origin:center;animation:sp 6s linear infinite}
    .spin.rev{animation-direction:reverse;animation-duration:8s}
    @keyframes sp{to{transform:rotate(360deg)}}
    .float{animation:fl 2.4s ease-in-out infinite}
    @keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    .fall{animation:fa 2.6s linear infinite}
    @keyframes fa{0%{transform:translateY(-30px) rotate(0)}100%{transform:translateY(240px) rotate(220deg)}}
    .pulse{transform-box:fill-box;transform-origin:center;animation:pl 1.1s ease-in-out infinite}
    @keyframes pl{0%,100%{opacity:.6;transform:scaleY(.7)}50%{opacity:1;transform:scaleY(1.15)}}
    ${extraCss}
  </style>
  <rect width="480" height="220" fill="url(#bg)"/>
  ${inner}
</svg>`;

const star = (x: number, y: number, r: number) =>
  `<g class="twinkle" style="transform-box:fill-box;transform-origin:center"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/></g>`;

const ROCKET = banner('#2563eb', '#7c3aed', `
  ${star(60, 50, 3)}${star(120, 90, 2)}${star(410, 60, 3)}${star(360, 140, 2)}${star(440, 120, 2)}${star(90, 160, 2)}
  <g class="float">
    <g transform="translate(240 110)">
      <path d="M0,-46 C16,-30 16,8 0,26 C-16,8 -16,-30 0,-46 Z" fill="#fff"/>
      <circle cx="0" cy="-14" r="8" fill="#2563eb"/>
      <path d="M-14,14 L-26,34 L-8,24 Z" fill="#c7d2fe"/>
      <path d="M14,14 L26,34 L8,24 Z" fill="#c7d2fe"/>
      <g class="pulse"><path d="M-7,26 L0,52 L7,26 Z" fill="#fbbf24"/></g>
    </g>
  </g>`);

const SPARKLE = banner('#1d4ed8', '#6d28d9', `
  ${[[80, 60, 9], [160, 150, 6], [250, 70, 12], [330, 140, 7], [410, 80, 10], [200, 120, 5], [360, 50, 6]]
    .map(([x, y, s]) => `<g class="twinkle" style="transform-box:fill-box;transform-origin:center">
      <path d="M${x},${y - s} L${x + s * 0.32},${y - s * 0.32} L${x + s},${y} L${x + s * 0.32},${y + s * 0.32} L${x},${y + s} L${x - s * 0.32},${y + s * 0.32} L${x - s},${y} L${x - s * 0.32},${y - s * 0.32} Z" fill="#fff"/>
    </g>`).join('')}`);

const gear = (cx: number, cy: number, R: number, fill: string, cls: string) => {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    return `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${fill}" transform="rotate(${(i * 45)} ${x} ${y})"/>`;
  }).join('');
  return `<g class="spin ${cls}">${teeth}<circle cx="${cx}" cy="${cy}" r="${R - 4}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${R * 0.4}" fill="url(#bg)"/></g>`;
};

const GEARS = banner('#0e7490', '#4338ca', `
  ${gear(210, 110, 42, '#fff', '')}
  ${gear(290, 150, 30, '#c7d2fe', 'rev')}`);

const CONFETTI = banner('#7c3aed', '#db2777', `
  ${[['#fbbf24', 60, 0], ['#34d399', 130, 0.4], ['#60a5fa', 200, 0.9], ['#f472b6', 270, 0.2], ['#fff', 340, 0.7], ['#fde047', 410, 1.1], ['#a78bfa', 100, 1.4], ['#4ade80', 300, 0.6], ['#f87171', 380, 0.3], ['#38bdf8', 160, 1.2]]
    .map(([c, x, d]) => `<rect x="${x}" y="0" width="10" height="14" rx="2" fill="${c}" class="fall" style="animation-delay:${d}s"/>`).join('')}
  <text x="240" y="120" text-anchor="middle" font-family="system-ui,sans-serif" font-size="44" font-weight="800" fill="#fff" opacity="0.95">🎉</text>`);

const PRESETS: PresetGif[] = [
  { key: 'rocket', label: 'Launch', svg: ROCKET },
  { key: 'sparkle', label: 'New', svg: SPARKLE },
  { key: 'gears', label: 'Improvement', svg: GEARS },
  { key: 'confetti', label: 'Celebrate', svg: CONFETTI },
];

export const PRESET_GIFS = PRESETS;

export const toDataUri = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;

/** Resolve a stored media value (a `preset:<key>` token or a plain URL) to an <img src>. */
export const resolveMedia = (mediaUrl?: string | null): string => {
  if (!mediaUrl) return '';
  if (mediaUrl.startsWith('preset:')) {
    const p = PRESETS.find((x) => x.key === mediaUrl.slice(7));
    return p ? toDataUri(p.svg) : '';
  }
  return mediaUrl;
};
