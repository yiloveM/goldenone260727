import { safeContentUrl } from './content-links.mjs';

// Content stores /r2/ keys, while private portals live on another hostname.
// Resolve that stable key through this site's configured public media base.
export function publicMediaUrl(value, assetBase = '', publicOrigin = '') {
  const source = String(value ?? '').trim().replace(/^r2\//i, '/r2/');
  const safe = safeContentUrl(source, true); if (!safe) return '';
  if (safe.startsWith('/r2/')) {
    const key = safe.slice(4);
    let decoded=key;
    try{for(let index=0;index<5;index++){if(/%(?:2e|2f|5c)/i.test(decoded))return '';const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}}catch{return '';}
    if (decoded.includes('%') || /[\u0000-\u001f\\<>"']/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..')) return '';
    try {
      if(!String(assetBase).trim())throw new Error('Missing public media base');
      const base = new URL(assetBase, publicOrigin || undefined);
      if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.hostname === 'cdn.example.com' || base.search || base.hash) throw new Error('Invalid public media base');
      return `${base.href.replace(/\/+$/, '')}/${key}`;
    } catch { /* Existing public /r2/ proxy remains the configured fallback. */ }
  }
  if (publicOrigin && safe.startsWith('/')) {
    try { const origin = new URL(publicOrigin); if (['https:', 'http:'].includes(origin.protocol) && !origin.username && !origin.password) return new URL(safe, origin).href; } catch { return ''; }
  }
  return safe;
}
