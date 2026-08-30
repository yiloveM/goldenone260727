import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourcePath = new URL('../src/lib/admin-portal-rewrite.ts', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { rewritePortalLocation, rewritePortalText } = await import(moduleUrl);

const portal = {
  name: 'keystatic',
  host: 'admin.example.com',
  uuid: '11111111-1111-4111-8111-111111111111',
};
const prefix = `/${portal.uuid}`;
const input = [
  `fetch('/api/keystatic/tree');`,
  `fetch("/api/ai/translations");`,
  `fetch('/api/analytics/summary');`,
  `fetch('/api/analytics/adjustments');`,
  'router.push(`/keystatic/branch/main`);',
  'new URL("/keystatic", deployedURL);',
  'const homepage = `${window.location.origin}/keystatic`;',
  String.raw`const params = pathname.replace(/^\/keystatic\/?/, "");`,
  String.raw`const custom = pathname.match(/^(.*?\/keystatic(?:\/branch\/[^/]+)?)/);`,
  'const docs = "https://keystatic.cloud/account";',
  String.raw`const escapedDocs = "https:\/\/keystatic.cloud/account";`,
  'const callback = `${window.location.origin}/api/keystatic/github/oauth/callback`;',
  'const localCallback = "http://127.0.0.1/api/keystatic/github/oauth/callback";',
].join('\n');
const output = rewritePortalText(input, portal);

assert.ok(output.includes(`fetch('${prefix}/api/keystatic/tree')`));
assert.ok(output.includes(`fetch("${prefix}/api/ai/translations")`));
assert.ok(output.includes(`fetch('${prefix}/api/analytics/summary')`));
assert.ok(output.includes(`fetch('${prefix}/api/analytics/adjustments')`));
assert.ok(output.includes(`router.push(\`${prefix}/branch/main\`)`));
assert.ok(output.includes(`new URL("${prefix}", deployedURL)`));
assert.ok(output.includes('`${window.location.origin}' + prefix + '`'));
assert.ok(output.includes(String.raw`replace(/^\/11111111-1111-4111-8111-111111111111\/?/, "")`));
assert.ok(output.includes(String.raw`.*?\/11111111-1111-4111-8111-111111111111(?:\/branch`));
assert.ok(!output.includes(String.raw`/^\/keystatic\/?/`));
assert.ok(output.includes('https://keystatic.cloud/account'));
assert.ok(output.includes(String.raw`https:\/\/keystatic.cloud/account`));
assert.ok(output.includes('${window.location.origin}/api/keystatic/github/oauth/callback'));
assert.ok(output.includes('http://127.0.0.1/api/keystatic/github/oauth/callback'));
assert.equal(rewritePortalText(output, portal), output);
assert.equal(rewritePortalLocation('/keystatic/branch/main', portal), `${prefix}/branch/main`);
assert.equal(rewritePortalLocation('/api/keystatic/github/login', portal), `${prefix}/api/keystatic/github/login`);
assert.equal(rewritePortalLocation('https://github.com/login/oauth/authorize', portal), 'https://github.com/login/oauth/authorize');

const manager = {
  ...portal,
  name: 'manager',
  host: 'manager.example.com',
  uuid: '22222222-2222-4222-8222-222222222222',
};
const managerInput = [
  `if (!url.pathname.startsWith('/api/')) return value;`,
  `fetch('/api/manager/status');`,
  `fetch('/api/analytics/summary');`,
  `const docs = '/keystatic/help';`,
].join('\n');
assert.equal(rewritePortalText(managerInput, manager), managerInput);
assert.equal(rewritePortalLocation('/api/manager/status', manager), `/${manager.uuid}/api/manager/status`);

const accessSourcePath = new URL('../src/lib/admin-portals.ts', import.meta.url);
const accessSource = await readFile(accessSourcePath, 'utf8');
const accessCompiled = ts.transpileModule(accessSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const accessModuleUrl = `data:text/javascript;base64,${Buffer.from(accessCompiled).toString('base64')}`;
const { ADMIN_PORTAL_HEADER, requireInternalPortalAccess } = await import(accessModuleUrl);

const configuredEnv = {
  KEYSTATIC_PORTAL_HOST: portal.host,
  KEYSTATIC_PORTAL_UUID: portal.uuid,
  MANAGER_PORTAL_HOST: manager.host,
  MANAGER_PORTAL_UUID: manager.uuid,
};
const trustedRequest = new Request('https://manager.example.com/api/manager/status', {
  headers: { [ADMIN_PORTAL_HEADER]: 'manager' },
});
assert.equal(requireInternalPortalAccess(trustedRequest, configuredEnv, 'manager'), null);

const missingConfigResponse = requireInternalPortalAccess(trustedRequest, {}, 'manager');
assert.equal(missingConfigResponse?.status, 503);

const untrustedResponse = requireInternalPortalAccess(
  new Request('https://manager.example.com/api/manager/status'),
  configuredEnv,
  'manager'
);
assert.equal(untrustedResponse?.status, 403);

console.log('Admin portal gateway and response rewrite checks passed.');
