// eXomail logo (public/exomail-logo.png, transparent background). `height` sets its size; width follows.
export default function Logo({ height = 44 }) {
  return (
    <img src="/exomail-logo.png" alt="eXomail Email Marketing" height={height}
      style={{ height, width: 'auto', display: 'block' }} />
  );
}
