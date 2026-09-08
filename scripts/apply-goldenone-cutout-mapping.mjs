import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const catalogPath = path.resolve(root, 'src', 'data', 'product-media-catalog.json');
const productRoot = path.resolve(root, 'src', 'content', 'products');
const args = process.argv.slice(2);
const option = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || fallback) : fallback;
};
const manifestPath = path.resolve(
  root,
  option('--manifest', "don't push/sitedata/r2-upload/goldenone-cutouts/cutout-processing-manifest.json")
);

const [catalog, manifest] = await Promise.all([
  readFile(catalogPath, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))),
  readFile(manifestPath, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, ''))),
]);
const entries = Array.isArray(manifest.objects) ? manifest.objects : [];
const failures = Array.isArray(manifest.failures) ? manifest.failures : [];
if (failures.length) throw new Error(`Cutout processing manifest contains ${failures.length} failure(s).`);
if (!entries.length || entries.length !== manifest.selection?.selectedObjects) {
  throw new Error('Cutout processing must complete every selected object before applying public mappings.');
}

const mediaById = new Map(catalog.media.map(media => [media.id, media]));
const cutoutById = new Map();
for (const entry of entries) {
  const media = mediaById.get(entry.mediaId);
  if (!media) throw new Error(`Unknown media ID in cutout manifest: ${entry.mediaId}`);
  if (media.sha256 !== entry.sourceSha256 || media.publicUrl !== entry.sourcePublicUrl) {
    throw new Error(`Source mapping changed after cutout processing: ${entry.mediaId}`);
  }
  if (!entry.publicUrl?.startsWith(`${catalog.delivery.publicBaseUrl.replace(/\/+$/, '')}/`)) {
    throw new Error(`Cutout URL does not use the configured R2 public base: ${entry.mediaId}`);
  }
  cutoutById.set(entry.mediaId, entry);
}

const replacements = [];
catalog.media = catalog.media.map(media => {
  const entry = cutoutById.get(media.id);
  if (!entry) return media;
  const previousDisplayUrl = media.display?.publicUrl;
  replacements.push([media.publicUrl, entry.publicUrl]);
  if (previousDisplayUrl && previousDisplayUrl !== entry.publicUrl) replacements.push([previousDisplayUrl, entry.publicUrl]);
  return {
    ...media,
    display: {
      variant: 'background-removed',
      processorRevision: manifest.processor?.revision || 'goldenone-cutout-v1',
      r2ObjectKey: entry.r2ObjectKey,
      publicUrl: entry.publicUrl,
      contentType: entry.contentType,
      bytes: entry.bytes,
      sha256: entry.sha256,
      alpha: entry.alpha,
    },
  };
});
catalog.delivery.backgroundRemovedMedia = {
  enabled: true,
  processorRevision: manifest.processor?.revision || 'goldenone-cutout-v1',
  generatedAt: manifest.generatedAt,
  originalObjectsRetained: true,
};
catalog.summary.backgroundRemovedImageObjects = entries.length;
catalog.summary.backgroundRemovalExcludedInformationImages = manifest.selection?.excludedInformationImages || 0;

const productFiles = (await readdir(productRoot))
  .filter(file => file.toLowerCase().endsWith('.mdoc'))
  .sort();
let changedFiles = 0;
let replacementCount = 0;
for (const file of productFiles) {
  const filePath = path.join(productRoot, file);
  const original = await readFile(filePath, 'utf8');
  let updated = original;
  for (const [from, to] of replacements) {
    if (!from || from === to || !updated.includes(from)) continue;
    const occurrences = updated.split(from).length - 1;
    updated = updated.split(from).join(to);
    replacementCount += occurrences;
  }
  if (updated !== original) {
    await writeFile(filePath, updated, 'utf8');
    changedFiles += 1;
  }
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Applied ${entries.length} transparent media mappings.`);
console.log(`Updated ${changedFiles} product files with ${replacementCount} URL replacement(s).`);
