// Inventory mark — isometric stacked crates with a lime accent crate on top.
// Matches the catalog brand style. Scales cleanly; `size` in px.
export default function Logo({ size = 34 }) {
  const u = (n) => 'a' + Math.round(n) + size // unique gradient ids per size
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={u(1)} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#94c08e" />
          <stop offset="1" stopColor="#52894b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${u(1)})`} />
      <g fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M16 26 L32 18 L48 26 L48 42 L32 50 L16 42 Z" />
        <path d="M16 26 L32 34 L48 26 M32 34 L32 50" />
      </g>
    </svg>
  )
}
