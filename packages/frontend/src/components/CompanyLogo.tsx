'use client';

// Company logo via the Google Favicon API — a single keyless, rate-limit-free
// source. Two states only: the image, or the letter avatar on error.
//
// The image starts invisible and fades in on load (see .company-logo in
// globals.css) so a row of logos doesn't pop in one by one as favicons land.
// If the image is already cached (`complete` at mount), it shows immediately.

import { useRef, useState } from 'react';
import { companyLogoUrl } from '../utils/companyLogo';

export default function CompanyLogo({ companyName, domain, size = 40 }: {
  companyName: string;
  domain?: string;
  size?: number;
}) {
  // State is keyed by the company so a recycled instance (list re-render with
  // a different job) resets during render instead of one frame later in an
  // effect — no flash of the previous company's logo/error state.
  const key = `${companyName}|${domain ?? ''}`;
  const [state, setState] = useState({ key, imgErr: false, loaded: false });
  if (state.key !== key) setState({ key, imgErr: false, loaded: false });
  const { imgErr, loaded } = state.key === key ? state : { imgErr: false, loaded: false };
  const setImgErr = (v: boolean) => setState(s => ({ ...s, imgErr: v }));
  const setLoaded = (v: boolean) => setState(s => (s.loaded === v ? s : { ...s, loaded: v }));
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Cached images fire `load` before React attaches the handler; check once
  // the node exists via a ref callback rather than an effect.
  const attach = (img: HTMLImageElement | null) => {
    imgRef.current = img;
    if (img && img.complete && img.naturalWidth > 0) queueMicrotask(() => setLoaded(true));
  };

  const url = companyLogoUrl({ companyName, domain });

  if (url && !imgErr) {
    return (
      <img
        ref={attach}
        src={url}
        alt={`${companyName} logo`}
        width={size}
        height={size}
        className={`company-logo ${loaded ? 'is-loaded' : ''}`}
        style={{
          width: size, height: size, objectFit: 'contain', flexShrink: 0,
          // Consistent frame: logos with baked-in white padding (e.g. Asana)
          // otherwise read as floating white boxes on the cream background.
          borderRadius: 6, background: 'var(--bg-surface)',
          border: '1px solid var(--border)', padding: 2,
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setImgErr(true)}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="company-logo--fallback" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--primary-soft)', color: 'var(--primary)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700,
    }}>
      {companyName.charAt(0).toUpperCase()}
    </span>
  );
}
