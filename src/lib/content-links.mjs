// Shared by browser editors and private previews. Never decode a URL into HTML.
export const safeContentUrl = (value, media = false) => {
  const url = String(value ?? '').trim();
  if (!url || /[\u0000-\u0020\u007f\\<>"']/.test(url)) return '';
  if (/^\/(?!\/)/.test(url) || !media && /^#[^\s]*$/.test(url)) return url;
  if (/^https?:\/\//i.test(url)) {
    try { const parsed = new URL(url); return parsed.username || parsed.password ? '' : url; } catch { return ''; }
  }
  if (!media && /^(?:mailto:[^@\s]+@[^\s]+|tel:\+?[0-9().-]+)$/i.test(url)) return url;
  return '';
};
