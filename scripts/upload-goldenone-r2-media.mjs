import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const wranglerEntry = path.resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const option = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || fallback) : fallback;
};
const concurrency = Math.max(1, Math.min(10, Number.parseInt(option('--concurrency', '6'), 10) || 6));
const dryRun = has('--dry-run');
const forceAll = has('--force-all');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const defaultManifestPath = path.resolve(root, "don't push", 'sitedata', 'r2-upload', 'goldenone', 'r2-upload-manifest.json');
const manifestPath = path.resolve(root, option('--manifest', defaultManifestPath));
const packageRoot = path.dirname(manifestPath);
const statePath = path.join(packageRoot, '.upload-state.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourceRoot = path.resolve(packageRoot, String(manifest.sourceRoot || '.'));
const bucket = option('--bucket', String(manifest.bucket || '').trim());
if (!bucket) throw new Error('R2 bucket is missing from the upload manifest.');

let state = {};
if (!forceAll) {
  try {
    state = JSON.parse((await readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

let stateWrite = Promise.resolve();
const saveState = () => {
  const snapshot = JSON.stringify(state, null, 2) + '\n';
  stateWrite = stateWrite.then(() => writeFile(statePath, snapshot, 'utf8'));
  return stateWrite;
};

const runWrangler = wranglerArgs => new Promise(resolve => {
  const child = spawn(process.execPath, [wranglerEntry, ...wranglerArgs], {
    cwd: root,
    env: { ...process.env, XDG_CONFIG_HOME: path.resolve(root, '.wrangler-config') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = chunk => {
    if (output.length < 100_000) output += chunk.toString();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', error => resolve({ status: 1, output: `${output}\n${error.message}` }));
  child.on('close', status => resolve({ status: status ?? 1, output }));
});

const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
const pending = objects
  .map((entry, index) => ({ entry, index }))
  .filter(({ entry }) => forceAll || state[entry.r2ObjectKey] !== entry.sha256);
console.log(`Golden One R2 upload: ${objects.length - pending.length} complete, ${pending.length} pending, concurrency ${concurrency}.`);

if (dryRun) {
  for (const { entry, index } of pending) console.log(`[${index + 1}/${objects.length}] DRY RUN ${bucket}/${entry.r2ObjectKey}`);
  process.exit(0);
}

let cursor = 0;
let completedThisRun = 0;
const failures = [];
const uploadOne = async ({ entry, index }) => {
  const sourceReference = String(entry.localFile || entry.sourceFile || '').trim();
  if (!sourceReference) throw new Error(`Manifest object is missing localFile/sourceFile: ${entry.r2ObjectKey}`);
  const source = path.resolve(sourceRoot, ...sourceReference.split('/'));
  const target = `${bucket}/${entry.r2ObjectKey}`;
  const wranglerArgs = [
    'r2', 'object', 'put', target,
    '--file', source,
    '--remote',
    '--content-type', entry.contentType,
    '--cache-control', entry.cacheControl,
    '--force',
  ];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await runWrangler(wranglerArgs);
    if (result.status === 0) {
      state[entry.r2ObjectKey] = entry.sha256;
      completedThisRun += 1;
      await saveState();
      console.log(`[${index + 1}/${objects.length}] OK ${entry.r2ObjectKey}`);
      return;
    }
    if (attempt < 3) await wait(attempt * 5000);
    else {
      const details = result.output.trim().split(/\r?\n/).slice(-8).join('\n');
      failures.push({ key: entry.r2ObjectKey, details });
      console.error(`[${index + 1}/${objects.length}] FAILED ${entry.r2ObjectKey}`);
    }
  }
};

const worker = async () => {
  while (cursor < pending.length) {
    const task = pending[cursor];
    cursor += 1;
    await uploadOne(task);
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, worker));
await stateWrite;

if (failures.length) {
  console.error(`R2 upload finished with ${failures.length} failed object(s). Re-run the same command to resume.`);
  for (const failure of failures) console.error(`\n${failure.key}\n${failure.details}`);
  process.exit(1);
}

const verified = objects.filter(entry => state[entry.r2ObjectKey] === entry.sha256).length;
console.log(`R2 upload complete: ${verified}/${objects.length} manifest objects recorded; ${completedThisRun} uploaded in this run.`);
