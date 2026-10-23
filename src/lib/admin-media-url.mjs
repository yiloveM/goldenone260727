import { publicMediaUrl } from './public-media-url.mjs';

// Display-only normalization: callers keep the original CMS value when saving.
export function adminMediaUrl(value, assetBase = '', publicOrigin = '', { temporary = false, objectKey = false } = {}) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  raw = raw.replace(/^r2\//i, '/r2/');
  if (temporary && (/^blob:https?:\/\//i.test(raw) || /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(raw))) return raw;
  if (objectKey && !/^[a-z][a-z0-9+.-]*:|^\//i.test(raw)) raw = '/r2/' + raw.replace(/ /g, '%20');
  const resolved = publicMediaUrl(raw, assetBase, publicOrigin);
  // A missing public origin must never fall back to the private portal host.
  return /^https?:\/\//i.test(resolved) && !/^https?:\/\/cdn\.example\.com(?:\/|$)/i.test(resolved) ? resolved : '';
}
