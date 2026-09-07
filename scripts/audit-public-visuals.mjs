import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const criticalFiles = ['src/layouts/BaseLayout.astro', 'src/components/IndustryHome.astro'];

for (const file of criticalFiles) {
  try {
    await access(path.join(root, file));
    await readFile(path.join(root, file), 'utf8');
  } catch {
    errors.push(`Required public visual file is missing or unreadable: ${file}`);
  }
}

if (errors.length) {
  console.error(`Public visual baseline audit: ${errors.length} error(s).`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

const classAudit = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-generic-class-names.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if ((classAudit.status ?? 1) !== 0) process.exit(classAudit.status ?? 1);

console.log('Public visual capability audit passed: required public files and application markers are present.');
