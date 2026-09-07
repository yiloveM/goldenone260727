import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const includedExtensions = new Set(['.astro', '.css', '.jsx', '.scss', '.tsx']);
const excludedSegments = new Set(['keystatic', 'manager']);
const forbidden = [
  /(?:^|[-_])(goldenone|golden-one)(?:$|[-_])/i,
  /(?:^|[-_])(astrowind|legacy|reference-site)(?:$|[-_])/i,
];

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(sourceRoot, absolute);
    const segments = relative.split(path.sep).map(segment => segment.toLowerCase());
    if (entry.isDirectory()) {
      if (!segments.some(segment => excludedSegments.has(segment))) await walk(absolute);
      continue;
    }
    if (includedExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
}

const classNamesFromMarkup = source => Array.from(source.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g))
  .flatMap(match => String(match[1] || match[2] || match[3] || '').split(/\s+/))
  .map(value => value.replace(/\$\{[^}]+\}/g, '').trim())
  .filter(Boolean);
const classNamesFromCss = source => Array.from(source.matchAll(/\.([_a-z][\w-]*)/gi), match => match[1]);

await walk(sourceRoot);
const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const classNames = path.extname(file).toLowerCase() === '.css' ? classNamesFromCss(source) : classNamesFromMarkup(source);
  for (const className of new Set(classNames)) {
    if (!forbidden.some(pattern => pattern.test(className))) continue;
    findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), className });
  }
}

if (findings.length) {
  console.error('Generic class-name audit failed. Public classes must describe reusable roles or states, not this customer, a legacy source, or a reference site.');
  for (const finding of findings) console.error(`- ${finding.file}: .${finding.className}`);
  process.exit(1);
}

console.log(`Generic class-name audit passed across ${files.length} public source files.`);
