import type { AdminPortalConfig } from './admin-portals';

export const rewritePortalText = (text: string, portal: AdminPortalConfig) => {
  // Manager prefixes its own API requests. Rewriting the inline helper would
  // also rewrite its '/api/' guard and produce a duplicated UUID path.
  if (portal.name === 'manager') return text;

  const prefix = `/${portal.uuid}`;
  let rewritten = text.replace(/(["'`])\/api\//g, (_match, quote: string) => `${quote}${prefix}/api/`);

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
