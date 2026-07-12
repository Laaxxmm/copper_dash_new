// Copper-themed inline SVG illustrations. Self-contained (no external images),
// so they render offline and on any host. Copper palette, editorial line-art.

/** A coil of copper wire — the login hero. */
export function CopperCoil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <radialGradient id="coilGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#E5915A" />
          <stop offset="55%" stopColor="#C0621F" />
          <stop offset="100%" stopColor="#8F3F10" />
        </radialGradient>
        <linearGradient id="wire" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D2792F" />
          <stop offset="100%" stopColor="#9C4419" />
        </linearGradient>
      </defs>
      {/* stacked coil rings */}
      {Array.from({ length: 9 }).map((_, i) => (
        <ellipse
          key={i}
          cx="120"
          cy={70 + i * 12}
          rx={70 - Math.abs(i - 4) * 2}
          ry="19"
          stroke="url(#wire)"
          strokeWidth="7"
          opacity={0.55 + i * 0.05}
        />
      ))}
      {/* wire ends coming off the coil */}
      <path d="M52 74 C30 66 22 44 40 30" stroke="url(#wire)" strokeWidth="7" strokeLinecap="round" />
      <path d="M188 178 C214 186 222 208 202 220" stroke="url(#wire)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="40" cy="30" r="6" fill="url(#coilGlow)" />
      <circle cx="202" cy="220" r="6" fill="url(#coilGlow)" />
    </svg>
  );
}

/** Three stacked copper cathode bars — a compact badge/empty-state motif. */
export function CopperIngots({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="ingot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D2792F" />
          <stop offset="100%" stopColor="#A24A16" />
        </linearGradient>
      </defs>
      {[
        { x: 18, y: 54 }, { x: 54, y: 54 }, { x: 36, y: 26 },
      ].map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y})`}>
          <path d="M0 8 L14 0 L62 0 L48 8 Z" fill="#E3925C" />
          <rect x="0" y="8" width="48" height="26" rx="2" fill="url(#ingot)" />
          <path d="M48 8 L62 0 L62 26 L48 34 Z" fill="#8F3F10" />
        </g>
      ))}
    </svg>
  );
}
