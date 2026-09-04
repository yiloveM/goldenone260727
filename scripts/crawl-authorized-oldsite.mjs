import { createHash } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Agent, ProxyAgent } from 'undici';

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const help = `
Capture an explicitly authorized public legacy site into /oldsite.

Usage:
  npm run oldsite:crawl -- --url "https://old.example.com" --authorized [--proxy "http://proxy.example:port"] [--rebuild]

Options:
  --url                 Required legacy-site root URL.
  --authorized          Required acknowledgement that the owner authorized this migration.
  --output              Project-relative output directory (default: oldsite).
  --proxy               Try this HTTP(S) proxy first, then direct access.
  --metadata-only       Capture pages and asset metadata without downloading binaries.
  --max-pages           Safety limit for public HTML pages (default: 5000).
  --page-concurrency    Concurrent page requests (default: 8).
  --asset-concurrency   Concurrent asset requests (default: 10).
  --rebuild             Remove only the resolved output directory before capture.
`.trim();

if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}
if (!args.includes('--authorized')) {
  console.error('Refusing to crawl without --authorized. Record the site owner authorization first.');
  process.exit(1);
}

let sourceRoot;
try {
  sourceRoot = new URL(option('url'));
  if (!['http:', 'https:'].includes(sourceRoot.protocol)) throw new Error('unsupported protocol');
  sourceRoot.hash = '';
  sourceRoot.search = '';
  sourceRoot.pathname = sourceRoot.pathname.replace(/\/+$/, '') || '/';
} catch {
  console.error('--url must be an absolute HTTP(S) legacy-site URL.');
  process.exit(1);
}

const outputRelative = option('output') || 'oldsite';
const outputRoot = path.resolve(root, outputRelative);
const expectedPrefix = `${path.resolve(root)}${path.sep}`;
if (!outputRoot.startsWith(expectedPrefix)) {
  console.error(`Refusing output outside the project: ${outputRoot}`);
  process.exit(1);
}
if (args.includes('--rebuild')) await rm(outputRoot, { recursive: true, force: true });

const rawRoot = path.join(outputRoot, 'raw');
const pageRoot = path.join(rawRoot, 'pages');
const sitemapRoot = path.join(rawRoot, 'sitemaps');
const assetRoot = path.join(outputRoot, 'assets');
const fetchedAt = new Date().toISOString();
const downloadAssets = !args.includes('--metadata-only');
const maxPages = Math.max(1, Number(option('max-pages') || 5000));
const pageConcurrency = Math.max(1, Number(option('page-concurrency') || 8));
const assetConcurrency = Math.max(1, Number(option('asset-concurrency') || 10));
const proxyUrl = option('proxy');
const userAgent = `BusinessWebAuthorizedMigration/1.0 (+${sourceRoot.origin}/)`;
const directDispatcher = new Agent({ connect: { timeout: 30000 } });
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null;

const unique = values => Array.from(new Set(values.filter(Boolean)));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalizeReference = value => String(value || '').replace(/#.*$/, '');
const sameOrigin = value => {
  try { return new URL(value).origin === sourceRoot.origin; } catch { return false; }
};
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const decodeEntities = value => String(value || '')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const stripTags = value => clean(decodeEntities(String(value || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')));

const visibleText = html => decodeEntities(String(html || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer|main|table)>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .split(/\r?\n/)
  .map(clean)
  .filter(Boolean)
  .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
  .join('\n');

const attributes = source => Object.fromEntries(
  Array.from(String(source || '').matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g))
    .map(match => [match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')])
);

const absolute = (value, pageUrl) => {
  try {
    if (!value || /^(?:data|javascript|mailto|tel):/i.test(value)) return '';
    const resolved = new URL(value, pageUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) return '';
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return '';
  }
};

const elementTexts = (html, tag) => Array.from(String(html || '').matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')))
  .map(match => stripTags(match[1]))
  .filter(Boolean);

const extractMeta = html => Array.from(String(html || '').matchAll(/<meta\b([^>]+)>/gi))
  .map(match => attributes(match[1]))
  .map(attrs => ({ key: clean(attrs.name || attrs.property || attrs['http-equiv']), content: clean(attrs.content) }))
  .filter(item => item.key || item.content);

const metaValue = (items, key) => items.find(item => item.key.toLowerCase() === key.toLowerCase())?.content || '';

const extractLinks = (html, pageUrl) => Array.from(String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))
  .map(match => {
    const attrs = attributes(match[1]);
    return { url: absolute(attrs.href, pageUrl), text: stripTags(match[2]), title: clean(attrs.title), rel: clean(attrs.rel) };
  })
  .filter(link => link.url);

const extractJsonLd = html => Array.from(String(html || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
  .flatMap(match => {
    const attrs = attributes(match[1]);
    if (String(attrs.type || '').toLowerCase() !== 'application/ld+json') return [];
    try { return [JSON.parse(match[2])]; } catch { return [{ parseError: true, raw: clean(match[2]) }]; }
  });

const extractTables = html => Array.from(String(html || '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi))
  .map(table => ({
    rows: Array.from(table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(row =>
      Array.from(row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)).map(cell => stripTags(cell[1]))
    ).filter(row => row.some(Boolean)),
  }))
  .filter(table => table.rows.length);

const assetKindFrom = (url, hint = '') => {
  const extension = (() => { try { return path.extname(new URL(url).pathname).toLowerCase(); } catch { return ''; } })();
  if (hint) return hint;
  if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(extension)) return 'image';
  if (/\.(?:pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z)$/i.test(extension)) return 'document';
  if (/\.(?:mp4|mov|m4v|webm|mp3|wav|ogg)$/i.test(extension)) return 'media';
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(extension)) return 'font';
  if (extension === '.css') return 'style';
  if (/\.(?:js|mjs)$/i.test(extension)) return 'script';
  return 'other';
};

const extractAssets = (html, pageUrl, meta) => {
  const records = [];
  const add = (value, kind, details = {}) => {
    const url = absolute(value, pageUrl);
    if (url) records.push({ url, kind: assetKindFrom(url, kind), ...details });
  };
  for (const match of String(html || '').matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    add(attrs['data-src'] || attrs['data-original'] || attrs.src, 'image', { alt: clean(attrs.alt), title: clean(attrs.title) });
    for (const srcset of [attrs.srcset, attrs['data-srcset']].filter(Boolean)) {
      for (const candidate of srcset.split(',')) add(candidate.trim().split(/\s+/)[0], 'image', { alt: clean(attrs.alt), title: clean(attrs.title) });
    }
  }
  for (const match of String(html || '').matchAll(/<(?:source|video|audio)\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    add(attrs.src, match[0].toLowerCase().startsWith('<source') ? '' : 'media', { title: clean(attrs.title) });
    if (attrs.poster) add(attrs.poster, 'image', { title: clean(attrs.title) });
    for (const srcset of [attrs.srcset, attrs['data-srcset']].filter(Boolean)) {
      for (const candidate of srcset.split(',')) add(candidate.trim().split(/\s+/)[0], 'image');
    }
  }
  for (const match of String(html || '').matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) add(match[2], '');
  for (const item of meta) if (/^(?:og:image|twitter:image)$/i.test(item.key)) add(item.content, 'image');
  for (const match of String(html || '').matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = attributes(match[1]);
    const rel = String(attrs.rel || '').toLowerCase();
    if (/icon|image_src/.test(rel)) add(attrs.href, 'image', { title: clean(attrs.title) });
    else if (rel.includes('stylesheet')) add(attrs.href, 'style');
    else if (rel.includes('preload') && attrs.href) add(attrs.href, assetKindFrom(attrs.href), { title: clean(attrs.title) });
  }
  for (const match of String(html || '').matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs.src) add(attrs.src, 'script');
  }
  for (const link of extractLinks(html, pageUrl)) {
    const kind = assetKindFrom(link.url);
    if (['document', 'media'].includes(kind)) add(link.url, kind, { title: link.title, label: link.text });
  }
  return records;
};

const schemaTypes = values => {
  const types = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const type = value['@type'];
    if (Array.isArray(type)) types.push(...type.map(String));
    else if (type) types.push(String(type));
    Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return unique(types);
};

const classifyPage = (url, jsonLd = []) => {
  const pathname = new URL(url).pathname.toLowerCase();
  const types = schemaTypes(jsonLd).map(type => type.toLowerCase());
  if (pathname === '/' || pathname === '') return 'home';
  if (types.includes('product')) return 'product';
  if (types.some(type => ['article', 'blogposting', 'newsarticle'].includes(type))) return 'article';
  if (types.includes('service')) return 'service';
  if (/(?:^|[-/])contact(?:[-/.]|$)/.test(pathname)) return 'contact';
  if (/(?:^|[-/])about(?:[-/.]|$)/.test(pathname)) return 'about';
  if (/(?:^|[-/])faq(?:[-/.]|$)/.test(pathname)) return 'faq';
  if (/(?:news|blog|resources?|articles?)(?:[-/.]|$)/.test(pathname)) return 'article-or-index';
  return 'page';
};

const safeFilename = (url, extension) => {
  const parsed = new URL(url);
  const readable = `${parsed.hostname}${parsed.pathname === '/' ? '/index' : parsed.pathname}`
    .replace(/[^a-z0-9._-]+/gi, '__')
    .replace(/^_+|_+$/g, '')
    .slice(0, 170);
  return `${readable || 'page'}-${sha256(url).slice(0, 10)}${extension}`;
};

const extensionFor = (url, contentType = '', fallback = '.bin') => {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();
  if (extension && extension.length <= 9) return extension;
  const byType = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif',
    'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico',
    'application/pdf': '.pdf', 'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js',
    'font/woff': '.woff', 'font/woff2': '.woff2', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3',
  };
  return byType[String(contentType).split(';')[0].toLowerCase()] || fallback;
};

async function fetchResponse(url, options = {}) {
  const dispatchers = proxyDispatcher ? [proxyDispatcher, directDispatcher] : [directDispatcher];
  let lastError;
  for (const dispatcher of dispatchers) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          dispatcher,
          redirect: 'follow',
          signal: AbortSignal.timeout(options.timeout || 45000),
          headers: { 'user-agent': userAgent, accept: options.accept || '*/*' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    if (dispatcher === proxyDispatcher) console.warn(`Proxy failed for ${url}; retrying direct.`);
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const isHtmlCandidate = value => {
  try {
    const url = new URL(value);
    if (url.origin !== sourceRoot.origin) return false;
    if (/\/(?:admin|wp-admin|wp-login|cart|checkout)(?:\/|$)/i.test(url.pathname)) return false;
    return !/\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|m4v|mov|mp3|mp4|otf|pdf|png|pptx?|rar|rss|svg|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)(?:$|[?#])/i.test(url.pathname);
  } catch { return false; }
};

await Promise.all([pageRoot, sitemapRoot, assetRoot].map(directory => mkdir(directory, { recursive: true })));

let robotsText = '';
try {
  robotsText = await (await fetchResponse(new URL('/robots.txt', sourceRoot).toString(), { accept: 'text/plain,text/html' })).text();
  await writeFile(path.join(rawRoot, 'robots.txt'), robotsText, 'utf8');
} catch (error) {
  await writeFile(path.join(rawRoot, 'robots-error.txt'), String(error?.message || error), 'utf8');
}

const sitemapQueue = unique([
  ...Array.from(robotsText.matchAll(/^\s*Sitemap:\s*(\S+)/gim), match => absolute(match[1], sourceRoot)),
  new URL('/sitemap.xml', sourceRoot).toString(),
]);
const seenSitemaps = new Set();
const sitemapPages = new Set();
const sitemapImageRecords = [];
const xmlLocations = xml => Array.from(String(xml || '').matchAll(/<loc>([\s\S]*?)<\/loc>/gi), match => clean(decodeEntities(match[1])));

while (sitemapQueue.length && seenSitemaps.size < 100) {
  const sitemapUrl = sitemapQueue.shift();
  if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
  seenSitemaps.add(sitemapUrl);
  try {
    const xml = await (await fetchResponse(sitemapUrl, { accept: 'application/xml,text/xml,text/plain' })).text();
    await writeFile(path.join(sitemapRoot, safeFilename(sitemapUrl, '.xml')), xml, 'utf8');
    const locations = xmlLocations(xml).map(value => absolute(value, sitemapUrl)).filter(Boolean);
    if (/<sitemapindex\b/i.test(xml)) {
      for (const location of locations) if (!seenSitemaps.has(location)) sitemapQueue.push(location);
    } else {
      for (const location of locations) if (isHtmlCandidate(location)) sitemapPages.add(normalizeReference(location));
    }
    for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const pageUrl = clean(decodeEntities(block[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || ''));
      for (const image of block[1].matchAll(/<image:image>([\s\S]*?)<\/image:image>/gi)) {
        const imageUrl = clean(decodeEntities(image[1].match(/<image:loc>([\s\S]*?)<\/image:loc>/i)?.[1] || ''));
        if (imageUrl) sitemapImageRecords.push({
          url: absolute(imageUrl, sitemapUrl),
          kind: 'image',
          title: clean(decodeEntities(image[1].match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1] || '')),
          caption: clean(decodeEntities(image[1].match(/<image:caption>([\s\S]*?)<\/image:caption>/i)?.[1] || '')),
          sourcePage: absolute(pageUrl, sitemapUrl),
        });
      }
    }
  } catch (error) {
    console.warn(`Could not read sitemap ${sitemapUrl}: ${error?.message || error}`);
  }
}

const pageQueue = unique([sourceRoot.toString(), ...sitemapPages]).slice(0, maxPages);
const queuedPages = new Set(pageQueue);
const pages = [];
const crawlErrors = [];
for (let cursor = 0; cursor < Math.min(pageQueue.length, maxPages);) {
  const batch = pageQueue.slice(cursor, Math.min(cursor + pageConcurrency, pageQueue.length, maxPages));
  cursor += batch.length;
  const results = await mapConcurrent(batch, pageConcurrency, async url => {
    try {
      const response = await fetchResponse(url, { accept: 'text/html,application/xhtml+xml' });
      const contentType = response.headers.get('content-type') || '';
      if (!/html|xhtml/i.test(contentType)) throw new Error(`Expected HTML, received ${contentType || 'unknown content type'}`);
      const html = await response.text();
      const sourceFile = `raw/pages/${safeFilename(url, '.html')}`;
      await writeFile(path.join(outputRoot, sourceFile), html, 'utf8');
      const links = extractLinks(html, url);
      const meta = extractMeta(html);
      const jsonLd = extractJsonLd(html);
      const assets = extractAssets(html, url, meta);
      const text = visibleText(html);
      const canonicalAttrs = Array.from(html.matchAll(/<link\b([^>]+)>/gi)).map(match => attributes(match[1]))
        .find(item => String(item.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
      return {
        url,
        finalUrl: response.url,
        legacyPath: new URL(url).pathname,
        targetPath: new URL(url).pathname,
        status: response.status,
        fetchedAt,
        contentType,
        lastModified: response.headers.get('last-modified') || '',
        sourceFile,
        sourceSha256: sha256(html),
        type: classifyPage(url, jsonLd),
        title: stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
        metaDescription: metaValue(meta, 'description'),
        metaKeywords: metaValue(meta, 'keywords'),
        metaRobots: metaValue(meta, 'robots'),
        canonical: absolute(canonicalAttrs?.href, url),
        openGraph: Object.fromEntries(meta.filter(item => item.key.toLowerCase().startsWith('og:')).map(item => [item.key, item.content])),
        twitter: Object.fromEntries(meta.filter(item => item.key.toLowerCase().startsWith('twitter:')).map(item => [item.key, item.content])),
        meta,
        headings: Object.fromEntries(['h1', 'h2', 'h3', 'h4'].map(tag => [tag, elementTexts(html, tag)])),
        paragraphs: elementTexts(html, 'p'),
        lists: elementTexts(html, 'li'),
        tables: extractTables(html),
        jsonLd,
        schemaTypes: schemaTypes(jsonLd),
        links,
        images: assets.filter(asset => asset.kind === 'image'),
        assets,
        emails: unique(text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || []),
        phones: unique((text.match(/\+?\d[\d\s().-]{7,}\d/g) || []).map(clean)),
        text,
      };
    } catch (error) {
      crawlErrors.push({ url, error: String(error?.message || error), fetchedAt });
      return null;
    }
  });
  for (const page of results.filter(Boolean)) {
    pages.push(page);
    for (const link of page.links) {
      const candidate = normalizeReference(link.url);
      if (isHtmlCandidate(candidate) && !queuedPages.has(candidate) && queuedPages.size < maxPages) {
        queuedPages.add(candidate);
        pageQueue.push(candidate);
      }
    }
  }
  console.log(`Captured ${pages.length}/${Math.min(pageQueue.length, maxPages)} discovered public pages.`);
}

const assetLookup = new Map();
const addAsset = (asset, sourcePage = '') => {
  if (!asset?.url) return;
  const key = normalizeReference(asset.url).toLowerCase();
  const existing = assetLookup.get(key) || { url: normalizeReference(asset.url), kind: asset.kind || assetKindFrom(asset.url), sourcePages: [], labels: [] };
  existing.sourcePages = unique([...existing.sourcePages, sourcePage, asset.sourcePage]);
  existing.labels = unique([...existing.labels, asset.label, asset.alt, asset.title, asset.caption]);
  for (const field of ['alt', 'title', 'caption']) if (!existing[field] && asset[field]) existing[field] = clean(asset[field]);
  assetLookup.set(key, existing);
};
for (const record of sitemapImageRecords) addAsset(record, record.sourcePage);
for (const page of pages) for (const asset of page.assets) addAsset(asset, page.url);
const assetEntries = Array.from(assetLookup.values()).sort((left, right) => left.url.localeCompare(right.url));

async function downloadBinary(entry) {
  const crossOriginCode = ['style', 'script', 'font'].includes(entry.kind) && !sameOrigin(entry.url);
  if (crossOriginCode) return { ...entry, status: 'external-reference-only', reason: 'Cross-origin code or font is recorded but not copied.' };
  try {
    const response = await fetchResponse(entry.url, { timeout: 90000 });
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = sha256(bytes);
    const contentType = response.headers.get('content-type') || '';
    const kind = entry.kind === 'other' ? assetKindFrom(response.url || entry.url) : entry.kind;
    const extension = extensionFor(response.url || entry.url, contentType);
    const directory = path.join(assetRoot, `${kind}s`);
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, `${digest}${extension}`);
    try { await stat(target); } catch { await writeFile(target, bytes); }
    return {
      ...entry,
      kind,
      finalUrl: response.url,
      status: response.status,
      contentType,
      bytes: bytes.length,
      sha256: digest,
      originalFilename: path.basename(new URL(response.url || entry.url).pathname),
      localFile: path.relative(outputRoot, target).replace(/\\/g, '/'),
      fetchedAt,
    };
  } catch (error) {
    return { ...entry, status: 0, error: String(error?.message || error), fetchedAt };
  }
}

let assetManifest = assetEntries.map(entry => ({ ...entry, status: 'not-downloaded' }));
if (downloadAssets) {
  console.log(`Downloading ${assetEntries.length} referenced assets...`);
  assetManifest = await mapConcurrent(assetEntries, assetConcurrency, downloadBinary);
}

const successfulAssets = assetManifest.filter(item => item.status === 200);
const routeMap = {
  sourceOrigin: sourceRoot.origin,
  generatedAt: fetchedAt,
  policy: 'legacy-primary-routes',
  redirectPolicy: 'Do not add a redirect when the exact legacy path is retained as the primary route.',
  routes: pages.map(page => ({
    sourceUrl: page.url,
    legacyPath: page.legacyPath,
    targetPath: page.targetPath,
    pageType: page.type,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    sourceFile: page.sourceFile,
  })),
};
const contacts = {
  emails: unique(pages.flatMap(page => page.emails)).sort(),
  phones: unique(pages.flatMap(page => page.phones)).sort(),
  contactPages: pages.filter(page => ['contact', 'about', 'faq'].includes(page.type)).map(page => ({ url: page.url, title: page.title, sourceFile: page.sourceFile })),
};
const manifest = {
  source: sourceRoot.origin,
  authorizationContext: option('authorization-note') || 'The project owner stated that this public legacy-site material is authorized for migration.',
  fetchedAt,
  mode: downloadAssets ? 'full-with-assets' : 'metadata-only',
  proxyPolicy: proxyUrl ? 'proxy-first-with-direct-fallback' : 'direct',
  counts: {
    discoveredPages: queuedPages.size,
    pagesFetched: pages.length,
    crawlErrors: crawlErrors.length,
    sitemapsFetched: seenSitemaps.size,
    assetUrls: assetEntries.length,
    assetsDownloaded: successfulAssets.length,
    assetBytes: successfulAssets.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
  },
  files: {
    pages: 'pages.json',
    pagesJsonl: 'pages.jsonl',
    routes: 'route-map.json',
    contacts: 'contacts-extracted.json',
    assets: 'assets-manifest.json',
    errors: 'crawl-errors.json',
    rawPages: 'raw/pages/',
    rawSitemaps: 'raw/sitemaps/',
    contentAddressedAssets: 'assets/',
  },
};

await Promise.all([
  writeJson(path.join(outputRoot, 'pages.json'), pages),
  writeFile(path.join(outputRoot, 'pages.jsonl'), `${pages.map(page => JSON.stringify(page)).join('\n')}\n`, 'utf8'),
  writeJson(path.join(outputRoot, 'route-map.json'), routeMap),
  writeJson(path.join(outputRoot, 'contacts-extracted.json'), contacts),
  writeJson(path.join(outputRoot, 'assets-manifest.json'), assetManifest),
  writeJson(path.join(outputRoot, 'crawl-errors.json'), crawlErrors),
  writeJson(path.join(outputRoot, 'manifest.json'), manifest),
]);

await writeFile(path.join(outputRoot, 'README.md'), `# Authorized old-site capture

Source: ${sourceRoot.origin}
Fetched: ${fetchedAt}
Mode: ${manifest.mode}

This local directory preserves raw public HTML, extracted information architecture, copy, product tables, metadata, JSON-LD, contacts, media metadata, and downloaded public assets from the owner-authorized legacy site.

- \`route-map.json\` makes every old URL path an explicit proposed primary route.
- \`pages.json\` maps each page to headings, copy, tables, metadata, links, images, and source HTML.
- \`assets-manifest.json\` maps every asset to its source pages and content-addressed local file.
- \`raw/\` is the loss-resistant source archive when extraction is incomplete.
- Run \`npm run oldsite:prepare -- --output "${outputRelative.replace(/\\/g, '/')}"\` to create page folders, R2 keys, the upload manifest, and the upload guide.

Captured claims remain subject to owner verification. Source capture proves where a statement came from; it does not independently validate certifications, capacities, dates, prices, or performance.
`, 'utf8');

console.log(JSON.stringify(manifest.counts, null, 2));
await Promise.allSettled([directDispatcher.close(), proxyDispatcher?.close()].filter(Boolean));
