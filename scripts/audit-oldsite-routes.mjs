import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const oldsiteRoot = path.resolve(root, option('output') || 'oldsite');
const routeMapFile = path.join(oldsiteRoot, 'route-map.json');
try {
  await access(routeMapFile);
} catch {
  if (args.includes('--required')) {
    console.error(`Old-site route map is required but missing: ${routeMapFile}`);
    process.exit(1);
  }
  console.log('Old-site route audit skipped: no oldsite/route-map.json is present.');
  process.exit(0);
}

const distOption = option('dist');
const candidates = distOption
  ? [path.resolve(root, distOption)]
  : [path.join(root, 'dist', 'client'), path.join(root, 'dist')];
let publicRoot = '';
for (const candidate of candidates) {
  try { if ((await stat(candidate)).isDirectory()) { publicRoot = candidate; break; } } catch { /* try next */ }
}
if (!publicRoot) {
  console.error('Built public output is missing. Run npm run build before oldsite:audit.');
  process.exit(1);
}

const routeMap = JSON.parse(await readFile(routeMapFile, 'utf8'));
const origin = (option('origin') || process.env.SITE_URL || '').replace(/\/+$/, '');
const missing = [];
const badCanonical = [];
const missingMetadata = [];

const outputCandidates = routePath => {
  const pathname = routePath === '/' ? '' : routePath.replace(/^\/+/, '');
  if (!pathname) return [path.join(publicRoot, 'index.html')];
  return [
    path.join(publicRoot, pathname),
    path.join(publicRoot, pathname, 'index.html'),
    path.join(publicRoot, `${pathname.replace(/\/$/, '')}.html`),
  ];
};

const existingFile = async files => {
  for (const file of files) {
    try { if ((await stat(file)).isFile()) return file; } catch { /* try next */ }
  }
  return '';
};

for (const route of routeMap.routes || []) {
  const routePath = route.targetPath || route.legacyPath;
  const file = await existingFile(outputCandidates(routePath));
  if (!file) {
    missing.push(routePath);
    continue;
  }
  const html = await readFile(file, 'utf8');
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1];
  if (!title || !description) missingMetadata.push({ path: routePath, title: Boolean(title), description: Boolean(description) });
  if (origin) {
    const canonical = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]
      || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["']/i)?.[1];
    const expected = new URL(routePath, `${origin}/`).toString();
    if (canonical !== expected) badCanonical.push({ path: routePath, canonical: canonical || '', expected });
  }
}

const sitemapFiles = (await readdir(publicRoot, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /^sitemap.*\.xml$/i.test(entry.name))
  .map(entry => path.join(publicRoot, entry.name));
const sitemapText = (await Promise.all(sitemapFiles.map(file => readFile(file, 'utf8')))).join('\n');
const sitemapPaths = new Set(Array.from(sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi), match => {
  try { return new URL(match[1]).pathname; } catch { return ''; }
}).filter(Boolean));
const missingSitemap = (routeMap.routes || [])
  .map(route => route.targetPath || route.legacyPath)
  .filter(routePath => !sitemapPaths.has(routePath));

const result = {
  routes: routeMap.routes?.length || 0,
  missing: missing.length,
  badCanonical: badCanonical.length,
  missingMetadata: missingMetadata.length,
  missingSitemap: missingSitemap.length,
  samples: {
    missing: missing.slice(0, 8),
    badCanonical: badCanonical.slice(0, 5),
    missingMetadata: missingMetadata.slice(0, 5),
    missingSitemap: missingSitemap.slice(0, 8),
  },
};
console.log(JSON.stringify(result, null, 2));
if (result.missing || result.badCanonical || result.missingMetadata || result.missingSitemap) process.exitCode = 1;
