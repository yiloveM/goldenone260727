import { z } from 'astro/zod';
import { isIP } from 'node:net';

const key = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const sourcePath = z.string().min(1).max(240);
export const mediaPathSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  entries: z.array(z.strictObject({
    id: key, category: key,
    delivery: z.enum(['r2-public', 'site-static', 'external-public']),
    baseUrl: z.string().url(),
    authority: z.enum(['PUBLIC_R2_ASSET_BASE_URL', 'SITE_URL', 'observed-external']),
    pathPrefix: z.string().max(240), purpose: z.string().min(1).max(500),
    references: z.array(z.strictObject({ path: sourcePath, field: z.string().min(1).max(200) })).min(1).max(40),
    lastVerifiedAt: z.string().datetime({ offset: true }).nullable(),
    verification: z.strictObject({
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      coverage: z.enum(['source-only', 'sampled-http', 'sampled-browser', 'full-active-http']),
      result: z.enum(['unverified', 'pass', 'partial', 'fail']),
      samples: z.array(z.strictObject({
        url: z.string().url(), httpStatus: z.number().int().min(100).max(599),
        contentType: z.string().max(120), naturalWidth: z.number().int().positive().optional(),
      })).max(12),
    }),
  })).max(200),
});
export const mediaPathJsonSchema = () => z.toJSONSchema(mediaPathSchema);

export function publicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // DNS answers are checked again immediately before an online request.
  if (isIP(host) === 6) { const first=parseInt(host.split(':')[0],16);return first>=0x2000&&first<0x4000&&!/^2001:db8:/.test(host); }
  if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host) || /(?:^|\.)example\.(?:com|org|net)$/.test(host)) return false;
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19,51].includes(b) || a === 203 && b === 0);
  }
  return true;
}

export function safeRegistryPath(value, allowEmpty = false) {
  if (value === '' && allowEmpty) return true;
  if (typeof value !== 'string' || !value || /^[/.\\]|^[a-z]:/i.test(value) || /[\\\u0000-\u001f?#]/.test(value)) return false;
  let decoded = value;
  try { for (let i=0;i<5;i++) { const next=decodeURIComponent(decoded); if(next===decoded) break; decoded=next; } } catch { return false; }
  return !/[\\\u0000-\u001f%]/.test(decoded) && !decoded.split('/').some(part => part === '..' || part === '.') && !decoded.startsWith('/');
}

export function publicRegistryUrl(value, base = false) {
  if (typeof value !== 'string' || /[\s\\<>"'\u0000-\u001f]/.test(value) || /(?:^|\/)(?:\.{1,2})(?:\/|$)/.test(value.replace(/^https:\/\//, ''))) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !publicHostname(url.hostname) || url.hash || base && url.search) return null;
    if (/[?&](?:token|sig|signature|x-amz-signature|key|secret|authorization|access_token)=/i.test(url.search)) return null;
    if (!safeRegistryPath(url.pathname.slice(1), true)) return null;
    return url;
  } catch { return null; }
}

export function entryMatches(entry, value, category) {
  if (entry.category !== category) return false;
  const base = new URL(entry.baseUrl), url = new URL(value);
  const prefix = `${base.pathname.replace(/\/+$/, '')}/${entry.pathPrefix}`.replace(/\/+$/, '');
  return url.origin === base.origin && (url.pathname === prefix || url.pathname.startsWith(prefix + '/'));
}

export function validateMediaRegistry(input) {
  const registry = mediaPathSchema.parse(input), seen = new Set();
  for (const entry of registry.entries) {
    if (seen.has(entry.id)) throw new Error('Duplicate media registry id: '+entry.id);
    seen.add(entry.id);
    if (!publicRegistryUrl(entry.baseUrl, true) || !safeRegistryPath(entry.pathPrefix, true)) throw new Error('Unsafe media delivery address/prefix: '+entry.id);
    if (entry.delivery === 'r2-public' && entry.authority !== 'PUBLIC_R2_ASSET_BASE_URL' || entry.delivery === 'site-static' && entry.authority !== 'SITE_URL' || entry.delivery === 'external-public' && entry.authority !== 'observed-external') throw new Error('Inconsistent media authority: '+entry.id);
    if (entry.references.some(ref => !safeRegistryPath(ref.path))) throw new Error('Unsafe source reference: '+entry.id);
    const proof = entry.verification;
    if (entry.lastVerifiedAt === null && (proof.result !== 'unverified' || proof.coverage !== 'source-only' || proof.samples.length)) throw new Error('Unverified entry cannot claim online evidence: '+entry.id);
    if (entry.lastVerifiedAt !== null && (!proof.samples.length || proof.coverage === 'source-only')) throw new Error('Dated verification needs actual online samples: '+entry.id);
    for (const sample of proof.samples) if (!publicRegistryUrl(sample.url) || !entryMatches(entry, sample.url, entry.category)) throw new Error('Invalid verification sample: '+entry.id);
    if (proof.result === 'pass' && proof.samples.some(sample => sample.httpStatus < 200 || sample.httpStatus >= 300 || !/^(?:image\/|application\/pdf)/i.test(sample.contentType))) throw new Error('Passing evidence is not a successful media response: '+entry.id);
  }
  return registry;
}
