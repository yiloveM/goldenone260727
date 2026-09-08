import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = path.resolve(root, "don't push", 'sitedata');
const outputRoot = path.join(sourceRoot, 'r2-upload', 'goldenone');
const catalogPath = path.resolve(root, 'src', 'data', 'product-media-catalog.json');
const guidePath = path.resolve(root, 'docs', 'GOLDENONE-PRODUCT-MEDIA.md');
const supported = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.pdf', 'application/pdf'],
]);
const cacheControl = 'public, max-age=31536000, immutable';

let previousMediaById = new Map();
try {
  const previousCatalog = JSON.parse((await readFile(catalogPath, 'utf8')).replace(/^\uFEFF/, ''));
  previousMediaById = new Map((previousCatalog.media || []).map(media => [media.id, media]));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const categories = [
  {
    id: 'lapel-pin-badge',
    sourceName: '徽章',
    name: 'Lapel Pin & Badge',
    commonFacts: [
      'Owner-supplied materials include zinc alloy, stainless iron, aluminum, and iron.',
      'Back treatments include sandblasted, polished, raised or recessed metal logo, and laser marking.',
      'Backing choices include butterfly, rubber, jewelry and deluxe clutches, magnet, safety pin, long stick pin, and screw with nut.',
      'Standard packaging is an OPP bag; optional packaging includes a printed backing card, plastic case, and velvet box.',
    ],
    series: [
      ['die-struck-iron-pin', '冲压铁质徽章', 'Die Struck Iron Pin'],
      ['imitation-hard-enamel-pin', '仿珐琅徽章', 'Imitation Hard Enamel Pin'],
      ['soft-enamel-pin', '烤漆徽章', 'Soft Enamel Pin'],
      ['full-color-printed-pin', '全彩印刷徽章', 'Full Color Printed Pin'],
      ['die-cast-lapel-pin', '压铸徽章', 'Die Cast Lapel Pin'],
      ['3d-lapel-pin', '3D徽章', '3D Lapel Pin'],
      ['spinner-lapel-pin', '旋转徽章', 'Spinner Lapel Pin'],
      ['sliding-pin', '滑动徽章', 'Sliding Pin'],
      ['glow-in-the-dark-pin', '夜光徽章', 'Glow in the dark Pin'],
      ['glitter-pin', '闪粉徽章', 'Glitter Pin'],
    ],
  },
  {
    id: 'medal',
    sourceName: '奖牌',
    name: 'Medal',
    commonFacts: [
      'Owner-supplied base materials include zinc alloy and iron.',
      'Back treatments include a standard sandblasted surface plus optional polished, laser-marked, or raised-back text treatments.',
      'Standard packaging is an OPP bag.',
    ],
    series: [
      ['sports-medal', '体育奖牌', 'Sports Medal'],
      ['carnival-medal', '嘉年华奖牌', 'Carnival Medal', ['Accessory choices include chain, twisted cord, and two-color woven ribbon with eyelet.']],
      ['military-medal', '军事奖章', 'Military Medal'],
    ],
  },
  {
    id: 'challenge-coin',
    sourceName: '纪念币',
    name: 'Challenge Coin',
    commonFacts: [
      'Owner-supplied base materials for double-sided coins include zinc alloy and iron.',
      'Edge choices include flat, 2D or 3D rope, diamond cross cut, oblique or swirl cut, spur or petal, bezel, reeded, and laser text.',
      'Standard packaging is an OPP bag; optional packaging includes a printed card, plastic capsule, velvet box, PVC bag, velvet pouch, and wooden box.',
    ],
    series: [
      ['2d-challenge-coin', '2D 纪念币', '2D Challenge Coin'],
      ['3d-challenge-coin', '3D 纪念币', '3D Challenge Coin'],
      ['bottle-opener-coin', '开瓶器纪念币', 'Bottle Opener Coin'],
      ['spinner-coin', '旋转纪念币', 'Spinner Coin'],
    ],
  },
  {
    id: 'key-chain',
    sourceName: '钥匙扣',
    name: 'Key Chain',
    commonFacts: [
      'Owner-supplied metal keychain material is primarily zinc alloy.',
      'Logo treatments include 3D relief, soft enamel, imitation hard enamel, printing, epoxy-domed sticker, standard laser, and black laser.',
      'Packaging choices include OPP bag, printed card, paper box with velvet tray, cardboard box with EVA tray, window box, and velvet pouch with foil logo.',
      'Hardware choices include round or flat rings in 25, 28, 30, 32, and 35 mm diameters, four-link chain, metal clasp, and pull ring.',
    ],
    series: [
      ['enamel-keychain', '珐琅钥匙扣', 'Enamel Keychain'],
      ['leather-keychain', '皮革钥匙扣', 'Leather Keychain', ['Materials include PU leather and genuine leather; genuine leather choices include split and top-grain leather.', 'Leather edges may use edge paint and the leather may be stitched.']],
      ['3d-keychain', '3D钥匙扣', '3D Keychain'],
      ['trolley-coin-keychain', '购物车代币钥匙扣', 'Trolley Coin Keychain'],
      ['bottle-opener-keychain', '开瓶器钥匙扣', 'Bottle Opener Keychain'],
      ['blank-keychain', '空白钥匙扣', 'Blank Keychain', ['Existing molds are mainly polished blanks or blanks with an insert recess; logo treatments include epoxy-domed sticker and laser marking.']],
      ['spinner-keychain', '旋转钥匙扣', 'Spinner Keychain'],
      ['full-color-printed-keychain', '全彩印刷钥匙扣', 'Full Color Printed Keychain'],
      ['soft-rubber-keychain', '软胶钥匙扣', 'Soft Rubber Keychain'],
    ],
  },
  {
    id: 'golf-accessories-tools',
    sourceName: '高尔夫球类配件&工具',
    name: 'Golf Accessories & Tools',
    commonFacts: [],
    series: [
      ['hat-clip', '帽夹', 'Hat Clip'],
      ['divot-tool', '草皮修复工具', 'Divot Tool', ['A divot tool usually includes an iron ball marker that can receive a custom logo.']],
      ['bag-tag', '包挂饰', 'Bag Tag'],
      ['brush', '刷子', 'Brush'],
    ],
  },
  {
    id: 'belt-buckle',
    sourceName: '皮带扣',
    name: 'Belt Buckle',
    commonFacts: ['Owner-supplied base material is primarily zinc alloy.'],
    series: [['belt-buckle', '皮带扣', 'Belt Buckle']],
  },
  {
    id: 'metal-wooden-plaque',
    sourceName: '金属木牌匾',
    name: 'Metal & Wooden Plaque',
    commonFacts: [],
    series: [['metal-wooden-plaque', '金属木牌匾', 'Metal & Wooden Plaque']],
  },
  {
    id: 'more-metal-crafts',
    sourceName: '其他金属工艺品',
    name: 'More Metal Crafts',
    commonFacts: [],
    series: [
      ['bottle-opener', '开瓶器', 'Bottle Opener', ['Owner-supplied materials include zinc alloy and stainless steel.']],
      ['bottle-stopper', '瓶塞', 'Bottle Stopper'],
      ['ornaments', '装饰品', 'Ornaments'],
      ['fridge-magnet', '冰箱贴', 'Fridge Magnet', ['Materials include zinc alloy, soft PVC, and tinplate; backings include a metal magnet or magnetic rubber.']],
      ['cufflinks-tie-clip', '袖扣与领带夹', 'Cufflinks & Tie Clip', ['Owner-supplied materials include iron and zinc alloy.']],
    ],
  },
  {
    id: 'promotion-gift',
    sourceName: 'Promotion Gift',
    name: 'Promotion Gift',
    commonFacts: [],
    series: [['pending', '待定', 'Pending']],
  },
].map(category => ({
  ...category,
  series: category.series.map(([id, sourceName, name, facts = []]) => ({ id, sourceName, name, facts })),
}));

const categoryByFolder = new Map([
  ['Lapel Pin & Badge', 'lapel-pin-badge'],
  ['Medal', 'medal'],
  ['Challenge Coin', 'challenge-coin'],
  ['Key Chain', 'key-chain'],
  ['Golf Accessories & Tools', 'golf-accessories-tools'],
  ['Belt Buckle', 'belt-buckle'],
  ['Metal & Wooden Plaque', 'metal-wooden-plaque'],
  ['More Metal Crafts', 'more-metal-crafts'],
]);

const seriesFolders = new Map([
  ['3D Lapel Pin', '3d-lapel-pin'],
  ['Die Cast Lapel Pin', 'die-cast-lapel-pin'],
  ['Die Struck Iron Pin', 'die-struck-iron-pin'],
  ['Full Color Printed Pin', 'full-color-printed-pin'],
  ['Glitter Pin', 'glitter-pin'],
  ['Glow in the dark Pin', 'glow-in-the-dark-pin'],
  ['Imitation Hard Enamel Pin', 'imitation-hard-enamel-pin'],
  ['Sliding Pin', 'sliding-pin'],
  ['Soft Enamel Pin', 'soft-enamel-pin'],
  ['Carnival Medal', 'carnival-medal'],
  ['Military Medal', 'military-medal'],
  ['Sport Medal', 'sports-medal'],
  ['2D challenge coin', '2d-challenge-coin'],
  ['3D challenge coin', '3d-challenge-coin'],
  ['Bottle Opener Coin', 'bottle-opener-coin'],
  ['Spinner Coin', 'spinner-coin'],
  ['珐琅钥匙扣', 'enamel-keychain'],
  ['3D钥匙扣', '3d-keychain'],
  ['购物车代币钥匙扣', 'trolley-coin-keychain'],
  ['开瓶器钥匙扣', 'bottle-opener-keychain'],
  ['空白钥匙扣', 'blank-keychain'],
  ['旋转钥匙扣', 'spinner-keychain'],
  ['全彩印刷钥匙扣', 'full-color-printed-keychain'],
  ['软胶钥匙扣', 'soft-rubber-keychain'],
  ['帽夹', 'hat-clip'],
  ['草皮修复工具', 'divot-tool'],
  ['包挂饰', 'bag-tag'],
  ['刷子', 'brush'],
  ['开瓶器', 'bottle-opener'],
  ['瓶塞', 'bottle-stopper'],
  ['装饰品', 'ornaments'],
  ['冰箱贴', 'fridge-magnet'],
  ['袖扣与领带夹', 'cufflinks-tie-clip'],
]);

const descriptiveNames = new Map([
  ['curved and flat Belt Buckle comparation', 'curved-vs-flat-belt-buckle'],
  ['背面配件', 'backing-accessories'],
  ['徽章常见尺寸对比图', 'common-size-comparison'],
  ['徽章LOGO做法及包装', 'logo-methods-and-packaging'],
  ['光面和放沙对比图', 'polished-vs-sandblasted'],
  ['奖牌织带做法', 'ribbon-options'],
  ['奖牌织带做法2', 'ribbon-options-2'],
  ['币包装说明', 'coin-packaging'],
  ['高尔夫球叉logo定制', 'divot-tool-logo-customization'],
  ['高尔夫球刷8种颜色', 'golf-brush-eight-colors'],
  ['高尔夫球叉球叉logo做法', 'divot-tool-logo-methods'],
  ['皮钥匙扣logo-option', 'leather-keychain-logo-options'],
  ['皮钥匙扣logo做法及包装', 'leather-keychain-logo-and-packaging'],
  ['授权证明', 'authorization-evidence'],
  ['ROHS证书', 'rohs-certificate-preview'],
]);

const posix = value => value.split(path.sep).join('/');
const slugify = value => String(value || '')
  .normalize('NFKD')
  .replace(/Antiqule/gi, 'Antique')
  .replace(/\b(?:albb|copy)\b/gi, '')
  .replace(/_副本| - 副本|副本|阿里|尺寸|旋转/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();
const stemOf = filename => filename.slice(0, -path.extname(filename).length);
const stableStem = filename => {
  const stem = stemOf(filename);
  const described = descriptiveNames.get(stem);
  if (described) return described;
  const model = stem.match(/[A-Za-z]{1,4}[ _-]?\d{1,4}(?:[ _-]\d+)?/i)?.[0];
  if (model) return slugify(model);
  const cleaned = slugify(stem);
  if (cleaned && !/^[a-f0-9]{24,}$/i.test(cleaned.replace(/-/g, ''))) return cleaned;
  return 'asset';
};

const classify = relativePath => {
  const parts = relativePath.split('/');
  const filename = parts.at(-1);
  const stem = stemOf(filename);

  if (relativePath === 'goldenone logo.png') {
    return { categoryId: null, seriesId: null, scope: 'brand', collection: 'identity', role: 'brand-logo' };
  }
  if (parts[0] === '证书') {
    const certification = parts[1] === 'ROHS证书' ? 'rohs' : 'sedex';
    const role = path.extname(filename).toLowerCase() === '.pdf' ? 'certification-document' : 'certification-preview';
    return { categoryId: 'certifications', seriesId: certification, scope: 'certification', collection: certification, role };
  }
  if (parts[0] !== 'products') throw new Error(`Unclassified media path: ${relativePath}`);

  const categoryId = categoryByFolder.get(parts[1]);
  if (!categoryId) throw new Error(`Unknown product category folder: ${relativePath}`);
  const rest = parts.slice(2, -1);
  let seriesId = null;
  let scope = 'series';
  let collection = 'gallery';
  let role = 'gallery-image';

  if (categoryId === 'lapel-pin-badge') {
    if (rest[0] === '徽章--通用') {
      scope = 'category-shared';
      collection = stem.includes('配件') ? 'hardware-options' : stem.includes('尺寸') ? 'size-guides' : 'customization-guides';
      role = stem.includes('配件') ? 'hardware-option' : stem.includes('尺寸') ? 'dimension-reference' : 'customization-guide';
    } else seriesId = seriesFolders.get(rest[1]);
  } else if (categoryId === 'medal') {
    if (rest[0] === '奖牌--通用') {
      scope = 'category-shared';
      collection = stem.includes('织带') ? 'ribbon-options' : 'finish-guides';
      role = stem.includes('织带') ? 'ribbon-option' : 'comparison-guide';
    } else seriesId = seriesFolders.get(rest[1]);
  } else if (categoryId === 'challenge-coin') {
    if (rest[0] === 'Challenge Coin产品图片') seriesId = seriesFolders.get(rest[1]);
    else {
      scope = 'category-shared';
      if (rest[0] === 'Challenge Coin的电镀工艺选项') {
        collection = 'plating-options';
        role = 'finish-option';
      } else if (rest.includes('币边缘工艺选项')) {
        collection = 'edge-options';
        role = 'edge-option';
      } else {
        collection = 'packaging-guides';
        role = 'packaging-guide';
      }
    }
  } else if (categoryId === 'key-chain') {
    if (rest[0] === '皮钥匙扣--通用') {
      seriesId = 'leather-keychain';
      scope = 'series-shared';
      collection = 'customization-guides';
      role = 'customization-guide';
    } else if (rest[0] === '皮钥匙扣') {
      seriesId = 'leather-keychain';
      if (rest.includes('尺寸') && stem.includes('尺寸')) {
        collection = 'dimensions';
        role = 'dimension-reference';
      }
    } else if (rest[0] === '钥匙扣') seriesId = seriesFolders.get(rest[1]);
  } else if (categoryId === 'golf-accessories-tools') {
    // One divot-tool logo guide is stored in the brush folder; its filename is the stronger product signal.
    seriesId = stem.includes('高尔夫球叉') ? 'divot-tool' : seriesFolders.get(rest[0]);
    if (rest.includes('高尔夫球叉工艺说明') || /logo|颜色/i.test(stem)) {
      scope = 'series-shared';
      collection = 'customization-guides';
      role = 'customization-guide';
    }
  } else if (categoryId === 'belt-buckle') {
    seriesId = 'belt-buckle';
    if (rest.length < 1) {
      scope = 'series-shared';
      collection = 'construction-guides';
      role = 'comparison-guide';
    }
  } else if (categoryId === 'metal-wooden-plaque') seriesId = 'metal-wooden-plaque';
  else if (categoryId === 'more-metal-crafts') seriesId = seriesFolders.get(rest[0]);

  if (scope === 'series' && !seriesId) throw new Error(`Unknown product series folder: ${relativePath}`);
  return { categoryId, seriesId, scope, collection, role };
};

const walk = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
};
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const csvCell = value => {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

try {
  await access(sourceRoot);
} catch {
  console.error(`Golden One media source directory is missing: ${sourceRoot}`);
  process.exit(1);
}

const wrangler = await readFile(path.resolve(root, 'wrangler.toml'), 'utf8');
const bucket = wrangler.match(/^bucket_name\s*=\s*"([^"]+)"/m)?.[1]?.trim();
const publicBaseUrl = wrangler.match(/^PUBLIC_R2_ASSET_BASE_URL\s*=\s*"([^"]+)"/m)?.[1]?.trim().replace(/\/+$/, '');
if (!bucket || !publicBaseUrl) throw new Error('wrangler.toml must define bucket_name and PUBLIC_R2_ASSET_BASE_URL.');

const sourceFiles = (await walk(sourceRoot))
  .filter(file => supported.has(path.extname(file).toLowerCase()))
  .sort((a, b) => posix(path.relative(sourceRoot, a)).localeCompare(posix(path.relative(sourceRoot, b)), 'en'));

const records = [];
for (const absolute of sourceFiles) {
  const relativePath = posix(path.relative(sourceRoot, absolute));
  const buffer = await readFile(absolute);
  const fileStat = await stat(absolute);
  const classification = classify(relativePath);
  records.push({
    absolute,
    sourceFile: relativePath,
    originalFileName: path.basename(absolute),
    extension: path.extname(absolute).toLowerCase(),
    contentType: supported.get(path.extname(absolute).toLowerCase()),
    bytes: fileStat.size,
    sha256: sha256(buffer),
    ...classification,
  });
}

const dedupeGroups = new Map();
for (const record of records) {
  const key = [record.sha256, record.categoryId || '', record.seriesId || '', record.scope].join(':');
  if (!dedupeGroups.has(key)) dedupeGroups.set(key, []);
  dedupeGroups.get(key).push(record);
}

const objects = [];
const recordToObject = new Map();
for (const [dedupeKey, group] of dedupeGroups) {
  const canonical = group[0];
  const suffix = canonical.sha256.slice(0, 10);
  const filename = `${stableStem(canonical.originalFileName)}-${suffix}${canonical.extension}`;
  let objectFolder;
  if (canonical.scope === 'brand') objectFolder = 'brand';
  else if (canonical.scope === 'certification') objectFolder = `certifications/${canonical.collection}`;
  else if (canonical.scope === 'category-shared') objectFolder = `products/${canonical.categoryId}/_shared/${canonical.collection}`;
  else if (canonical.scope === 'series-shared') objectFolder = `products/${canonical.categoryId}/${canonical.seriesId}/_shared/${canonical.collection}`;
  else objectFolder = `products/${canonical.categoryId}/${canonical.seriesId}/${canonical.collection}`;
  const r2ObjectKey = `${objectFolder}/${filename}`;
  const id = `media-${sha256(Buffer.from(dedupeKey)).slice(0, 14)}`;
  const roles = [...new Set(group.map(record => record.role))];
  const object = {
    id,
    r2ObjectKey,
    publicUrl: `${publicBaseUrl}/${r2ObjectKey}`,
    contentType: canonical.contentType,
    bytes: canonical.bytes,
    sha256: canonical.sha256,
    categoryId: canonical.categoryId,
    seriesId: canonical.seriesId,
    scope: canonical.scope,
    collection: canonical.collection,
    roles,
    sourceFiles: group.map(record => record.sourceFile),
  };
  const previous = previousMediaById.get(id);
  if (previous?.sha256 === canonical.sha256 && previous.display?.publicUrl) {
    object.display = previous.display;
  }
  objects.push(object);
  for (const record of group) recordToObject.set(record, object);
}
objects.sort((a, b) => a.r2ObjectKey.localeCompare(b.r2ObjectKey, 'en'));

const catalogCategories = categories.map(category => ({
  id: category.id,
  sourceName: category.sourceName,
  name: category.name,
  commonFacts: category.commonFacts,
  sharedMediaIds: objects.filter(object => object.categoryId === category.id && object.scope === 'category-shared').map(object => object.id),
  series: category.series.map(series => ({
    ...series,
    mediaIds: objects.filter(object => object.categoryId === category.id && object.seriesId === series.id).map(object => object.id),
    mediaStatus: objects.some(object => object.categoryId === category.id && object.seriesId === series.id) ? 'mapped' : 'no-source-media',
  })),
}));

const catalog = {
  schemaVersion: 1,
  customer: 'Golden One',
  generatedAt: new Date().toISOString(),
  source: {
    workbook: '国际品牌网站资料采集表.xlsx',
    worksheet: '产品资料',
    mediaRoot: "don't push/sitedata",
    excluded: ['products/Key Chain/皮钥匙扣/鑫车皮钥匙扣链接.xlsx'],
  },
  delivery: {
    bucket,
    binding: 'CONTENT_BUCKET',
    publicBaseUrl,
    objectKeyPolicy: 'ASCII semantic hierarchy plus a short content hash; source folders never become public keys.',
  },
  summary: {
    sourceMediaFiles: records.length,
    uploadObjects: objects.length,
    exactDuplicateReferences: records.length - objects.length,
    imageObjects: objects.filter(object => object.contentType.startsWith('image/')).length,
    pdfObjects: objects.filter(object => object.contentType === 'application/pdf').length,
    backgroundRemovedImageObjects: objects.filter(object => object.display?.variant === 'background-removed').length,
  },
  categories: catalogCategories,
  standaloneMedia: objects.filter(object => !object.categoryId || object.categoryId === 'certifications').map(object => object.id),
  media: objects,
};

const uploadManifest = {
  schemaVersion: 1,
  generatedAt: catalog.generatedAt,
  bucket,
  sourceRoot: '../..',
  cacheControl,
  objects: objects.map(object => {
    const canonical = records.find(record => recordToObject.get(record)?.id === object.id);
    return {
      sourceFile: canonical.sourceFile,
      r2ObjectKey: object.r2ObjectKey,
      publicUrl: object.publicUrl,
      contentType: object.contentType,
      cacheControl,
      bytes: object.bytes,
      sha256: object.sha256,
      sourceAliases: object.sourceFiles,
    };
  }),
};

const csvHeader = ['sourceFile', 'r2ObjectKey', 'publicUrl', 'categoryId', 'seriesId', 'scope', 'roles', 'sha256', 'bytes', 'duplicateReference'];
const csvRows = records.map(record => {
  const object = recordToObject.get(record);
  return [
    record.sourceFile,
    object.r2ObjectKey,
    object.publicUrl,
    object.categoryId,
    object.seriesId,
    object.scope,
    object.roles,
    object.sha256,
    object.bytes,
    object.sourceFiles[0] !== record.sourceFile,
  ].map(csvCell).join(',');
});

const uploadScript = `param(
  [string]$Bucket = '${bucket}',
  [switch]$DryRun,
  [switch]$ForceAll
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot 'r2-upload-manifest.json'
$statePath = Join-Path $PSScriptRoot '.upload-state.json'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..\\..\\..')).Path
$wrangler = Join-Path $repoRoot 'node_modules\\wrangler\\bin\\wrangler.js'
$node = (Get-Command node -ErrorAction Stop).Source
$env:XDG_CONFIG_HOME = Join-Path $repoRoot '.wrangler-config'

if (-not (Test-Path -LiteralPath $wrangler)) { throw "Wrangler is missing: $wrangler" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$state = @{}
if ((Test-Path -LiteralPath $statePath) -and -not $ForceAll) {
  $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $saved.PSObject.Properties | ForEach-Object { $state[$_.Name] = [string]$_.Value }
}

$total = @($manifest.objects).Count
$index = 0
foreach ($entry in $manifest.objects) {
  $index += 1
  $source = Join-Path $sourceRoot ([string]$entry.sourceFile -replace '/', '\\')
  $target = "$Bucket/$($entry.r2ObjectKey)"
  if (-not (Test-Path -LiteralPath $source)) { throw "Source file is missing: $source" }
  if (-not $ForceAll -and $state.ContainsKey([string]$entry.r2ObjectKey) -and $state[[string]$entry.r2ObjectKey] -eq [string]$entry.sha256) {
    Write-Host "[$index/$total] SKIP $($entry.r2ObjectKey)"
    continue
  }

  $arguments = @(
    $wrangler, 'r2', 'object', 'put', $target,
    '--file', $source,
    '--remote',
    '--content-type', [string]$entry.contentType,
    '--cache-control', [string]$entry.cacheControl,
    '--force'
  )
  if ($DryRun) {
    Write-Host "[$index/$total] DRY RUN wrangler r2 object put $target"
    continue
  }

  $uploaded = $false
  for ($attempt = 1; $attempt -le 3 -and -not $uploaded; $attempt += 1) {
    Write-Host "[$index/$total] UPLOAD $($entry.r2ObjectKey) (attempt $attempt/3)"
    & $node @arguments
    if ($LASTEXITCODE -eq 0) {
      $uploaded = $true
      $state[[string]$entry.r2ObjectKey] = [string]$entry.sha256
      $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    } elseif ($attempt -lt 3) {
      Start-Sleep -Seconds (10 * $attempt)
    }
  }
  if (-not $uploaded) { throw "R2 upload failed after three attempts: $($entry.r2ObjectKey)" }
}

if ($DryRun) { Write-Host "Dry run complete: $total mapped R2 objects." }
else { Write-Host "Upload complete: $total mapped R2 objects." }
`;

const guide = `# Golden One Product Media Map

Generated from the owner-provided \`产品资料\` worksheet and \`don't push/sitedata\` media tree.

## Output

- Source media references: ${records.length}
- Unique R2 objects: ${objects.length}
- Exact duplicate references removed within the same product series: ${records.length - objects.length}
- Images: ${catalog.summary.imageObjects}
- PDFs: ${catalog.summary.pdfObjects}
- Excluded non-media workbook: \`products/Key Chain/皮钥匙扣/鑫车皮钥匙扣链接.xlsx\`

The tracked machine-readable catalog is \`src/data/product-media-catalog.json\`. It keeps the product taxonomy, owner-supplied factual notes, series-to-media links, stable R2 object keys, and current public URLs. The private CSV and upload manifest remain under \`don't push/sitedata/r2-upload/goldenone\`.

## R2 Upload

From the repository root:

\`\`\`powershell
npm run media:prepare:goldenone
npm run media:upload:goldenone -- --dry-run
npm run media:upload:goldenone
\`\`\`

The uploader uses the project-installed Wrangler, uploads to bucket \`${bucket}\` with bounded concurrency, records successful object hashes in an ignored state file, and safely resumes after interruption. Use \`--force-all\` only when every object must be replaced. The generated \`upload.ps1\` is a slower sequential fallback.

## Modeling Notes

- \`_shared\` objects describe category- or series-wide choices such as plating, edges, backing hardware, ribbon, packaging, dimensions, and logo methods.
- Gallery objects are examples for a specific product series. Model-looking filenames such as \`LP005\`, \`CC09\`, \`DI027\`, and \`BB042\` remain discoverable in the semantic object key.
- A mapped image is owner-provided media, not proof of a certification, customer, performance claim, price, availability, or lead time.
- Series marked \`no-source-media\` exist in the worksheet but currently have no matching image folder. Do not borrow another series image without owner review.
`;

await mkdir(outputRoot, { recursive: true });
await mkdir(path.dirname(catalogPath), { recursive: true });
await mkdir(path.dirname(guidePath), { recursive: true });
await Promise.all([
  writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outputRoot, 'r2-upload-manifest.json'), `${JSON.stringify(uploadManifest, null, 2)}\n`, 'utf8'),
  writeFile(path.join(outputRoot, 'product-media-mapping.csv'), `${csvHeader.join(',')}\n${csvRows.join('\n')}\n`, 'utf8'),
  writeFile(path.join(outputRoot, 'upload.ps1'), uploadScript, 'utf8'),
  writeFile(guidePath, guide, 'utf8'),
]);

console.log(`Golden One media map generated: ${records.length} source references -> ${objects.length} R2 objects.`);
console.log(`Tracked catalog: ${path.relative(root, catalogPath)}`);
console.log(`Private upload package: ${path.relative(root, outputRoot)}`);
