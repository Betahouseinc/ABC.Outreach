// eXoMail wordmark. Interim until the new logo arrives: swap the markup here and it changes everywhere.
export default function Logo({ size = 18, sub = true }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15 }}>
      <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 600, fontSize: size, letterSpacing: '-0.02em', color: 'var(--text)' }}>
        e<span style={{ color: 'var(--brand)' }}>X</span>oMail
      </span>
      {sub && <span style={{ fontSize: Math.max(11, Math.round(size * 0.62)), color: 'var(--text3)' }}>by eXommerce</span>}
    </span>
  );
}
