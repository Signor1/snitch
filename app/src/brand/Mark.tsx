export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="snitch-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9d5cff" />
          <stop offset="1" stopColor="#3b0a6b" />
        </linearGradient>
      </defs>
      {/* badge */}
      <path d="M32 3l8.500 5.500 10-1 3 9.500 7.500 6.500-4.500 9 2 10-9 4-4 9.500-10-1.500L32 61l-4-6.500-10 1.500-4-9.500-9-4 2-10L2.500 23.500 10 17l3-9.500 10 1z" fill="url(#snitch-shield)" stroke="#050505" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M32 9l6.500 4.300 7.800-.8 2.300 7.400 5.800 5-3.500 7 1.500 7.800-7 3.100-3.100 7.400-7.800-1.200L32 54l-2.500-5-7.800 1.200-3.100-7.400-7-3.100 1.500-7.800-3.500-7 5.800-5 2.300-7.400 7.800.8z" fill="#050505" />
      {/* eye */}
      <path d="M13 31c5.500-7.500 11.500-11 19-11s13.500 3.500 19 11c-5.500 7.500-11.500 11-19 11S18.500 38.500 13 31z" fill="none" stroke="#00e5ff" strokeWidth="3" strokeLinejoin="round" />
      {/* keyhole pupil */}
      <circle cx="32" cy="29" r="4.600" fill="#00e5ff" />
      <path d="M29.800 31h4.400l1.800 8h-8z" fill="#00e5ff" />
    </svg>
  );
}

export function Logo({ height = 48, className }: { height?: number; className?: string }) {
  const w = (height * 450) / 110;
  return (
    <svg viewBox="0 0 450 110" width={w} height={height} className={className} role="img" aria-label="SNITCH">
      <defs>
        <linearGradient id="snitch-letters" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#ece6f7" />
          <stop offset="1" stopColor="#b79cff" />
        </linearGradient>
        <filter id="snitch-glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* gap cut through the letters */}
        <mask id="snitch-cut">
          <rect width="430" height="110" fill="#fff" />
          <rect x="-10" y="51" width="450" height="7" fill="#000" transform="skewY(-2.500)" />
        </mask>
      </defs>
      <g transform="skewX(-9)">
        {/* shadow */}
        <g fill="#3b0a6b" transform="translate(5 6)">
          <LogoLetters />
        </g>
        <g fill="url(#snitch-letters)" mask="url(#snitch-cut)" stroke="#050505" strokeWidth="1.5">
          <LogoLetters />
        </g>
        {/* keyhole as the I */}
        <g fill="#00e5ff" filter="url(#snitch-glow)">
          <circle cx="201" cy="36" r="17" />
          <path d="M192 44h18l7 52h-32z" />
        </g>
      </g>
      {/* wire */}
      <g filter="url(#snitch-glow)">
        <path d="M0 62 L150 55.500 L165 49 L180 62 L195 49 L210 55 L430 43" fill="none" stroke="#00e5ff" strokeWidth="2.500" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// Paths, not text, so the logo doesn't depend on a font loading. The I is the keyhole.
function LogoLetters() {
  return (
    <>
      {/* S */}
      <path d="M22 14h56v22H44v10h34v50H22V74h34V64H22z" />
      {/* N */}
      <path d="M92 14h24l28 44V14h22v82h-24l-28-44v44H92z" />
      {/* T */}
      <path d="M232 14h66v22h-22v60h-22V36h-22z" />
      {/* C */}
      <path d="M308 14h56v22h-34v38h34v22h-56z" />
      {/* H */}
      <path d="M376 14h22v30h20V14h22v82h-22V66h-20v30h-22z" />
    </>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Mark size={30} />
      <Logo height={24} />
    </span>
  );
}
