import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { readManagerSources } from './manager-source.mjs';
import { serializeJsonLd } from '../src/lib/json-ld.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manager = readManagerSources(root);

test('Manager source audits follow connected components, CSS and all feature scripts', () => {
  assert.equal([...manager.files.keys()].filter(path => path.endsWith('.astro')).length, 14);
  assert.equal([...manager.files.keys()].filter(path => path.endsWith('.mjs')).length, 9);
  assert.ok(manager.files.has('src/styles/manager.css'));
  assert.match(manager.text, /\/api\/manager\/products/);
  assert.match(manager.text, /data-panel="publish"/);
});

test('Manager imports form a directed acyclic graph with no feature-to-feature imports', () => {
  const visit = (path, stack = []) => {
    assert.ok(!stack.includes(path), 'Import cycle: ' + [...stack, path].join(' -> '));
    for (const next of manager.imports.get(path)) visit(next, [...stack, path]);
  };
  visit('src/pages/manager/index.astro');
  for (const [path, imports] of manager.imports) {
    if (path.startsWith('src/scripts/manager/') && !path.endsWith('/bootstrap.mjs')) assert.deepEqual(imports, []);
  }
});

test('extracted JavaScript has no syntax errors or unbound cross-module names', () => {
  const files = [...manager.files.keys()].filter(path => path.endsWith('.mjs')).map(path => resolve(root, path));
  const program = ts.createProgram(files, { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022, skipLibCheck: true });
  const errors = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics().filter(item => [2304, 2552].includes(item.code))];
  assert.deepEqual(errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, ' ')), []);
});

test('serialized Manager config cannot terminate the JSON script element', () => {
  const value = { publicR2AssetBaseUrl: '</script><img src=x onerror=alert(1)>', productEditorPolicy: { offeringType: 'service' } };
  const serialized = serializeJsonLd(value);
  assert.ok(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), value);
  assert.match(manager.files.get('src/pages/manager/index.astro'), /set:html=\{serializeJsonLd\(/);
});

test('source reader ignores disconnected files but fails if a connected module is missing', () => {
  const base = resolve(root, '.sandbox/manager-source-tests');
  mkdirSync(base, { recursive: true });
  const fixture = mkdtempSync(resolve(base, 'case-'));
  const page = resolve(fixture, 'src/pages/manager/index.astro');
  const module = resolve(fixture, 'src/scripts/manager/unused.mjs');
  mkdirSync(dirname(page), { recursive: true }); mkdirSync(dirname(module), { recursive: true });
  writeFileSync(page, '---\n---\n<p>Fixture</p>'); writeFileSync(module, 'disconnected marker');
  assert.equal(readManagerSources(fixture).files.size, 1);
  writeFileSync(page, "---\nimport '../../scripts/manager/missing.mjs';\n---\n");
  assert.throws(() => readManagerSources(fixture), /ENOENT/);
});
