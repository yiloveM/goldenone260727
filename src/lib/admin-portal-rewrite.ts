import type { AdminPortalConfig } from './admin-portals';

export const rewritePortalText = (text: string, portal: AdminPortalConfig) => {
  const prefix = `/${portal.uuid}`;
  let rewritten = text.replace(/(["'`])\/api\//g, (_match, quote: string) => `${quote}${prefix}/api/`);

  if (portal.name !== 'keystatic') return rewritten;

  rewritten = rewritten
    .replace(/(["'`])\/keystatic(?=\/|["'`?])/g, (_match, quote: string) => `${quote}${prefix}`)
    .replace(/(\})\/keystatic(?=\/|["'`?])/g, `$1${prefix}`)
    // Keystatic parses the browser URL with regex literals, not only path strings.
    .replace(/\\\/keystatic(?=\\\/|\(\?:)/g, `\\/${portal.uuid}`);

  return rewritten;
};

export const rewritePortalLocation = (value: string, portal: AdminPortalConfig) => {
  if (portal.name === 'keystatic' && (value === '/keystatic' || value.startsWith('/keystatic/'))) {
    return `/${portal.uuid}${value.slice('/keystatic'.length)}`;
  }
  if (value.startsWith('/api/')) return `/${portal.uuid}${value}`;
  return value;
};
