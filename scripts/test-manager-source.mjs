import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import YAML from 'yaml';
import { installProducts } from '../src/scripts/manager/products.mjs';
import { readManagerSources } from './manager-source.mjs';
import { serializeJsonLd } from '../src/lib/json-ld.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manager = readManagerSources(root);

const imageEditor = () => {
  const fields = new Map();
  const context = {
    $: id => {
      if (!fields.has(id)) fields.set(id, { value: '', innerHTML: '' });
      return fields.get(id);
    },
    state: { products: [], formData: {} },
    productEditorPolicy: { offeringType: 'physical-product', modelStrategy: 'series' },
    cloneArray: value => structuredClone(Array.isArray(value) ? value : []),
    updateImageFieldPreview: () => {}, escapeHtml: value => String(value ?? ''),
    thumbnailMarkup: () => '',
  };
  installProducts(context);
  return context;
};

test('image editor reconciles legacy covers without changing source arrays or public image order', () => {
  const editor = imageEditor();
  for (const product of [
    { image: 'cover', galleryImages: ['second', 'third'] },
    { image: 'cover', galleryImages: ['cover', 'second', 'cover'] },
    { image: 'cover' }, { galleryImages: ['first', '', 'second'] }, {},
  ]) {
    const before = structuredClone(product);
    editor.setFormData(product);
    assert.deepEqual(editor.state.formData.galleryImages, [...new Set([product.image, ...(product.galleryImages || [])].filter(Boolean))]);
    assert.equal(editor.$('image').value, editor.state.formData.galleryImages[0] || '');
    assert.deepEqual(product, before);
  }
});

test('changing and deleting covers never resurrects a removed image or discards the remaining gallery', () => {
  const editor = imageEditor();
  editor.setFormData({ image: 'cover', galleryImages: ['second', 'third'] });
  editor.setProductMainImage('replacement');
  assert.deepEqual(editor.state.formData.galleryImages, ['replacement', 'second', 'third']);
  editor.state.formData.galleryImages.splice(0, 1); editor.syncProductMainImage();
  assert.equal(editor.$('image').value, 'second');
  editor.state.formData.galleryImages = ['', '  ', 'third']; editor.syncProductMainImage();
  assert.equal(editor.$('image').value, 'third');
  editor.state.formData.galleryImages = []; editor.syncProductMainImage();
  assert.equal(editor.$('image').value, '');
  editor.setProductMainImage(''); assert.deepEqual(editor.state.formData.galleryImages, []);
  editor.setProductMainImage('new'); assert.deepEqual(editor.state.formData.galleryImages, ['new']);
});

test('every actual product cover remains first when opening the compatible Manager editor', () => {
  const editor = imageEditor();
  const folder = resolve(root, 'src/content/products');
  for (const name of readdirSync(folder).filter(value => value.endsWith('.mdoc'))) {
    const source = readFileSync(resolve(folder, name), 'utf8').replace(/^\uFEFF/, '');
    const product = YAML.parse(source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)[1]);
    const before = JSON.stringify(product);
    editor.setFormData(product);
    const expected = [...new Set([product.image, ...(product.galleryImages || [])].map(value => String(value ?? '').trim()).filter(Boolean))];
    assert.deepEqual(editor.state.formData.galleryImages, expected, name);
    assert.equal(editor.$('image').value, expected[0] || '', name);
    assert.equal(JSON.stringify(product), before, name + ' mutated');
  }
});

test('Manager source audits follow connected components, CSS and all feature scripts', () => {
  assert.equal([...manager.files.keys()].filter(path => path.endsWith('.astro')).length, 16);
  assert.equal([...manager.files.keys()].filter(path => path.endsWith('.mjs')).length, 15);
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
