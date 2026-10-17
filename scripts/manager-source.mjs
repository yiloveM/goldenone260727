import { readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const entry = 'src/pages/manager/index.astro';
const owned = path => path === entry || path === 'src/styles/manager.css' ||
  path.startsWith('src/components/manager/') || path.startsWith('src/scripts/manager/');

// Follow only the Manager UI's actual imports, not disconnected files or API code.
export function readManagerSources(root) {
  const base = realpathSync(root);
  const files = new Map();
  const imports = new Map();
  function visit(path) {
    if (files.has(path)) return;
    const file = resolve(base, path);
    const actual = relative(base, realpathSync(file));
    if (actual.startsWith(`..${sep}`) || actual === '..' || resolve(base, actual) !== file) {
      throw new Error(`Manager source escapes its project or uses a redirected file: ${path}`);
    }
    const text = readFileSync(file, 'utf8');
    files.set(path, text);
    const targets = ts.preProcessFile(text, true, true).importedFiles
      .filter(item => item.fileName.startsWith('.'))
      .map(item => relative(base, resolve(dirname(file), item.fileName)).split(sep).join('/'))
      .filter(owned);
    imports.set(path, targets);
    targets.forEach(visit);
  }
  visit(entry);
  return { files, imports, text: [...files.values()].join('\n') };
}
