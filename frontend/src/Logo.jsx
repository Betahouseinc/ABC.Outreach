export default function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 8.7 L18 15.3" stroke="#39ff14" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M18 8.7 L6 15.3" stroke="#39ff14" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
