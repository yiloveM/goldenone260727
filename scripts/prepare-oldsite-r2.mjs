import { createHash } from 'node:crypto';
import { copyFile, link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const outputRelative = option('output') || 'oldsite';
const oldsiteRoot = path.resolve(root, outputRelative);
const expectedPrefix = `${path.resolve(root)}${path.sep}`;
if (!oldsiteRoot.startsWith(expectedPrefix)) {
  console.error(`Refusing input outside the project: ${oldsiteRoot}`);
  process.exit(1);
}

const pageAssetRoot = path.join(oldsiteRoot, 'page-assets');
const packageRoot = path.join(oldsiteRoot, 'r2-upload', 'legacy');
const bucket = option('bucket') || '<your-r2-bucket>';
const cdnBase = (option('cdn-base') || 'https://cdn.example.com').replace(/\/+$/, '');
const includeKinds = new Set(['image', 'document', 'media', 'font']);
const pages = JSON.parse(await readFile(path.join(oldsiteRoot, 'pages.json'), 'utf8'));
const assets = JSON.parse(await readFile(path.join(oldsiteRoot, 'assets-manifest.json'), 'utf8'));

const normalizeUrl = value => String(value || '').replace(/#.*$/, '').toLowerCase();
const assetByUrl = new Map(assets.map(asset => [normalizeUrl(asset.url), asset]));
const shortHash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
const slugify = (value, fallback = 'asset') => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 72)
  .replace(/-+$/g, '') || fallback;

const routeFolder = page => {
  const url = new URL(page.url);
  if (url.pathname === '/') return 'home';
  const segments = url.pathname.split('/').filter(Boolean).map(segment => slugify(segment.replace(/\.[a-z0-9]+$/i, ''), 'page'));
  return segments.join('/') || `page-${shortHash(page.url)}`;
};

const extensionFrom = asset => {
  const byType = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3',
    'font/woff': 'woff', 'font/woff2': 'woff2', 'font/ttf': 'ttf',
  };
  const contentType = String(asset.contentType || '').split(';')[0].toLowerCase();
  if (byType[contentType]) return byType[contentType];
  const extension = path.extname(new URL(asset.finalUrl || asset.url).pathname).replace(/^\./, '').toLowerCase();
  return extension || 'bin';
};

const directoryFor = kind => ({ image: 'images', document: 'documents', media: 'media', font: 'fonts' }[kind] || 'files');
const pageKeyword = page => {
  const url = new URL(page.url);
  const originalSlug = path.basename(url.pathname, path.extname(url.pathname));
  return slugify(originalSlug || page.title, 'home');
};
const sourceAssetKeyword = (pageAsset, asset, page) => {
  const original = path.basename(new URL(asset.finalUrl || asset.url).pathname, path.extname(new URL(asset.finalUrl || asset.url).pathname));
  const label = pageAsset.alt || pageAsset.title || asset.alt || asset.title || asset.caption || asset.labels?.find(Boolean) || original;
  return slugify(label, slugify(page.title, 'asset'));
};

const ensureLinkedFile = async (source, destination) => {
  try { await stat(destination); return 'existing'; } catch { await mkdir(path.dirname(destination), { recursive: true }); }
  try { await link(source, destination); return 'hardlink'; } catch { await copyFile(source, destination); return 'copy'; }
};

for (const target of [pageAssetRoot, packageRoot]) {
  const resolved = path.resolve(target);
  const safePrefix = `${path.resolve(oldsiteRoot)}${path.sep}`;
  if (!resolved.startsWith(safePrefix)) throw new Error(`Refusing to rebuild outside oldsite: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
}
await Promise.all([mkdir(pageAssetRoot, { recursive: true }), mkdir(packageRoot, { recursive: true })]);

const objectMap = [];
const pageIndex = [];
let hardlinks = 0;
let fallbackCopies = 0;

const addPageAsset = async (page, pageAsset, asset, pageFolder, usedKeys, usedSemanticKeys, position) => {
  const kind = asset.kind || pageAsset.kind || 'other';
  const digest = asset.sha256 || shortHash(asset.url);
  const routeSlug = pageKeyword(page);
  const sourceSlug = sourceAssetKeyword(pageAsset, asset, page);
  const role = pageAsset.role || (kind === 'image' ? (position === 1 ? 'primary-image' : `detail-image-${position}`) : `${kind}-${position}`);
  let semanticSlug = sourceSlug.includes(routeSlug) ? sourceSlug : slugify(`${routeSlug}-${sourceSlug}`);
  if (usedSemanticKeys.has(semanticSlug)) semanticSlug = slugify(`${semanticSlug}-${role}`);
  let semanticCollision = 1;
  const semanticBase = semanticSlug;
  while (usedSemanticKeys.has(semanticSlug)) semanticSlug = `${semanticBase}-${++semanticCollision}`;
  usedSemanticKeys.add(semanticSlug);
  const filename = `${semanticSlug}-${digest.slice(0, 8)}.${extensionFrom(asset)}`;
  const objectKeyBase = `pages/${routeFolder(page)}/${directoryFor(kind)}/${filename}`;
  let objectKey = objectKeyBase;
  let collision = 1;
  while (usedKeys.has(objectKey)) objectKey = objectKeyBase.replace(/(\.[^.]+)$/, `-${++collision}$1`);
  usedKeys.add(objectKey);
  const source = path.join(oldsiteRoot, asset.localFile);
  const pageDestination = path.join(pageFolder, directoryFor(kind), filename);
  const packageFile = `${directoryFor(kind)}/${objectKey}`;
  const packageDestination = path.join(packageRoot, ...packageFile.split('/'));
  for (const destination of [pageDestination, packageDestination]) {
    const result = await ensureLinkedFile(source, destination);
    if (result === 'hardlink') hardlinks += 1;
    if (result === 'copy') fallbackCopies += 1;
  }
  const record = {
    kind,
    role,
    sourcePage: page.url,
    sourceUrl: asset.url,
    finalUrl: asset.finalUrl || asset.url,
    alt: pageAsset.alt || asset.alt || '',
    title: pageAsset.title || asset.title || '',
    caption: pageAsset.caption || asset.caption || '',
    contentType: asset.contentType || 'application/octet-stream',
    bytes: asset.bytes || 0,
    sha256: asset.sha256,
    sourceLocalFile: asset.localFile,
    pageLocalFile: path.relative(oldsiteRoot, pageDestination).replace(/\\/g, '/'),
    packageFile,
    r2ObjectKey: objectKey,
    cdnUrl: `${cdnBase}/${objectKey}`,
    seoKeyBasis: {
      legacyPageSlug: routeSlug,
      sourceAssetKeyword: sourceSlug,
      uniqueLongTailSlug: semanticSlug,
      sourceFields: [
        'legacy URL slug',
        ...(pageAsset.alt || asset.alt ? ['alt'] : []),
        ...(pageAsset.title || asset.title ? ['title'] : []),
        ...(pageAsset.caption || asset.caption ? ['caption'] : []),
        ...(asset.originalFilename ? ['original filename'] : []),
      ],
    },
  };
  objectMap.push(record);
  return record;
};

const globallyUsedKeys = new Set();
const assignedUrls = new Set();
for (const page of pages) {
  const folder = path.join(pageAssetRoot, page.type || 'page', ...routeFolder(page).split('/'));
  await mkdir(folder, { recursive: true });
  const records = [];
  const seenOnPage = new Set();
  const usedSemanticKeys = new Set();
  let position = 0;
  for (const pageAsset of page.assets || []) {
    const key = normalizeUrl(pageAsset.url);
    if (!key || seenOnPage.has(key)) continue;
    seenOnPage.add(key);
    const asset = assetByUrl.get(key);
    if (!asset || asset.status !== 200 || !asset.localFile || !includeKinds.has(asset.kind)) continue;
    assignedUrls.add(key);
    position += 1;
    records.push(await addPageAsset(page, pageAsset, asset, folder, globallyUsedKeys, usedSemanticKeys, position));
  }
  const record = {
    pageUrl: page.url,
    legacyPath: page.legacyPath || new URL(page.url).pathname,
    targetPath: page.targetPath || page.legacyPath || new URL(page.url).pathname,
    pageType: page.type,
    title: page.title,
    sourceFile: page.sourceFile,
    folder: path.relative(oldsiteRoot, folder).replace(/\\/g, '/'),
    assets: records,
  };
  await writeFile(path.join(folder, 'assets.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  pageIndex.push(record);
}

for (const asset of assets) {
  const key = normalizeUrl(asset.url);
  if (assignedUrls.has(key) || asset.status !== 200 || !asset.localFile || !includeKinds.has(asset.kind)) continue;
  const syntheticPage = { url: new URL('/shared-assets', pages[0]?.url || 'https://example.com').toString(), title: 'Shared assets' };
  await addPageAsset(syntheticPage, asset, asset, path.join(pageAssetRoot, 'shared'), globallyUsedKeys, new Set(), 1);
}

const uploadManifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceRoot: outputRelative.replace(/\\/g, '/'),
  packageRoot: `${outputRelative.replace(/\\/g, '/')}/r2-upload/legacy`,
  bucket,
  cdnBase,
  keyPolicy: 'Keys combine the exact legacy page slug, source asset metadata, a distinct semantic role when needed, and a short content hash. Local wrapper folders are never inferred as R2 prefixes.',
  objects: objectMap.map(({ packageFile, r2ObjectKey, contentType, bytes, sha256, sourcePage, sourceUrl, alt, title, caption, kind, seoKeyBasis }) => ({
    packageFile,
    r2ObjectKey,
    contentType,
    bytes,
    sha256,
    sourcePage,
    sourceUrl,
    alt,
    title,
    caption,
    kind,
    seoKeyBasis,
  })),
};

const uploadScript = `param(
  [Parameter(Mandatory = $true)][string]$Bucket,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$manifestPath = Join-Path $packageRoot 'r2-upload-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$objects = @($manifest.objects)
$uploaded = 0

foreach ($object in $objects) {
  $source = Join-Path $packageRoot ([string]$object.packageFile).Replace('/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Mapped local file is missing: $source"
  }

  $target = "$Bucket/$($object.r2ObjectKey)"
  $uploaded++
  Write-Progress -Activity 'Uploading mapped old-site assets to Cloudflare R2' -Status "$uploaded / $($objects.Count): $($object.r2ObjectKey)" -PercentComplete (($uploaded / [Math]::Max($objects.Count, 1)) * 100)

  if ($DryRun) {
    Write-Host "DRY RUN  $source -> $target"
    continue
  }

  $wranglerArguments = @(
    'wrangler', 'r2', 'object', 'put', $target,
    "--file=$source",
    "--content-type=$($object.contentType)",
    '--cache-control=public, max-age=31536000, immutable',
    '--remote'
  )
  & npx @wranglerArguments

  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler upload failed: $($object.r2ObjectKey)"
  }
}

Write-Progress -Activity 'Uploading mapped old-site assets to Cloudflare R2' -Completed
Write-Host "Processed $uploaded mapped objects for bucket '$Bucket'."
`;

const guide = `# Authorized old-site media upload to Cloudflare R2

This package was generated from the page-to-asset mapping. Do not rename files, folders, or object keys after generation.

## Package contract

- Package folder: \`${outputRelative.replace(/\\/g, '/')}/r2-upload/legacy\`
- Upload mapping: \`r2-upload-manifest.json\`
- PowerShell uploader: \`upload.ps1\`
- Mapped objects: ${objectMap.length}
- Suggested bucket: \`${bucket}\`
- CDN root: \`${cdnBase}\`

The local package path and the R2 object key are separate fields. \`upload.ps1\` reads each mapping entry and uploads exactly to \`r2ObjectKey\`; it never adds \`oldsite/\`, \`r2-upload/\`, \`legacy/\`, or a local drive path to the R2 key.

## Upload from this folder

Open PowerShell in the generated package folder:

\`\`\`powershell
cd .\\${outputRelative.replace(/\//g, '\\')}\\r2-upload\\legacy
.\\upload.ps1 -Bucket '${bucket}' -DryRun
.\\upload.ps1 -Bucket '${bucket}'
\`\`\`

\`-DryRun\` prints every local-file-to-R2-key mapping without uploading. The real command uses Wrangler's remote R2 API and preserves the explicit page folders and filenames in the manifest.

Before upload, confirm Wrangler and the bucket:

\`\`\`powershell
npx wrangler --version
npx wrangler r2 bucket info '${bucket}'
\`\`\`

If the execution environment requires a proxy, configure it outside the project before upload. Do not commit local network settings into this repository or the generated package.

## Verify

1. Confirm the final line reports ${objectMap.length} processed objects.
2. Open several \`cdnUrl\` values from \`page-assets-index.json\` after the CDN custom domain is active.
3. Check that R2 keys start with \`pages/\` or \`shared/\`, not a local wrapper folder.
4. Keep the R2 Public Development URL disabled and use a Custom Domain for public delivery.
5. Keep the manifest. It is the source of truth for Manager maintenance and future key changes.

Each filename combines the original page URL slug, the best authorized source description (alt, title, caption, or original filename), a distinct page role when descriptions repeat, and a short content hash. Review \`seoKeyBasis\` in the manifest against the researched keyword-to-page map before upload; do not insert unrelated search terms.

Readable filenames help asset management and make image URLs understandable. Search visibility still depends mainly on crawlable page context, descriptive alt text, surrounding copy, image quality, dimensions, performance, and correct metadata; filenames alone do not guarantee image ranking.

Cloudflare references:

- https://developers.cloudflare.com/r2/reference/wrangler-commands/
- https://developers.cloudflare.com/r2/objects/upload-objects/
`;

await Promise.all([
  writeFile(path.join(oldsiteRoot, 'page-assets-index.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), pages: pageIndex }, null, 2)}\n`, 'utf8'),
  writeFile(path.join(oldsiteRoot, 'r2-object-map.json'), `${JSON.stringify(uploadManifest, null, 2)}\n`, 'utf8'),
  writeFile(path.join(packageRoot, 'r2-upload-manifest.json'), `${JSON.stringify(uploadManifest, null, 2)}\n`, 'utf8'),
  writeFile(path.join(packageRoot, 'upload.ps1'), uploadScript, 'utf8'),
  writeFile(path.join(oldsiteRoot, 'R2-UPLOAD-GUIDE.md'), guide, 'utf8'),
]);

console.log(JSON.stringify({
  pages: pageIndex.length,
  mappedObjects: objectMap.length,
  hardlinks,
  fallbackCopies,
  pageAssetRoot: `${outputRelative.replace(/\\/g, '/')}/page-assets`,
  uploadPackage: `${outputRelative.replace(/\\/g, '/')}/r2-upload/legacy`,
}, null, 2));
