import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const importTypeScriptModule = async relativePath => {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};

const { rewritePortalLocation, rewritePortalText } = await importTypeScriptModule('../src/lib/admin-portal-rewrite.ts');
const { ADMIN_PORTAL_HEADER, getAdminPortalConfigSet, requireInternalPortalAccess } =
  await importTypeScriptModule('../src/lib/admin-portals.ts');

const portal = {
  name: 'keystatic',
  host: 'owner-admin.example.com',
  uuid: '11111111-1111-4111-8111-111111111111',
};
const prefix = `/${portal.uuid}`;
const portalEnv = {
  KEYSTATIC_PORTAL_HOST: portal.host,
  KEYSTATIC_PORTAL_UUID: portal.uuid,
  MANAGER_PORTAL_HOST: 'content-admin.example.net',
  MANAGER_PORTAL_UUID: '22222222-2222-4222-8222-222222222222',
};

assert.ok(getAdminPortalConfigSet(portalEnv));
assert.equal(getAdminPortalConfigSet({ ...portalEnv, MANAGER_PORTAL_UUID: portal.uuid }), null);
assert.equal(getAdminPortalConfigSet({ ...portalEnv, MANAGER_PORTAL_HOST: portal.host }), null);
assert.equal(getAdminPortalConfigSet({ ...portalEnv, KEYSTATIC_PORTAL_UUID: 'not-a-uuid' }), null);

const internalRequest = new Request(`https://${portal.host}/api/products/manager`, {
  headers: { [ADMIN_PORTAL_HEADER]: 'keystatic' },
});
assert.equal(requireInternalPortalAccess(internalRequest, portalEnv, 'keystatic'), null);
assert.equal(requireInternalPortalAccess(new Request(`https://${portal.host}/api/products/manager`), portalEnv, 'keystatic')?.status, 403);
assert.equal(requireInternalPortalAccess(new Request('https://public.example.org/api/products/manager'), portalEnv, 'keystatic')?.status, 404);
assert.equal(
  requireInternalPortalAccess(
    new Request(`https://${portal.host}/api/keystatic/github/oauth/callback`),
    portalEnv,
    'keystatic',
    { allowKeystaticOAuthCallback: true }
  ),
  null
);

const input = [
  `fetch('/api/keystatic/tree');`,
  `fetch("/api/ai/translations");`,
  'router.push(`/keystatic/branch/main`);',
  'new URL("/keystatic", deployedURL);',
  'const homepage = `${window.location.origin}/keystatic`;',
  String.raw`const params = pathname.replace(/^\/keystatic\/?/, "");`,
  String.raw`const custom = pathname.match(/^(.*?\/keystatic(?:\/branch\/[^/]+)?)/);`,
  'const docs = "https://keystatic.cloud/account";',
  String.raw`const escapedDocs = "https:\/\/keystatic.cloud/account";`,
  'const callback = `${window.location.origin}/api/keystatic/github/oauth/callback`;',
].join('\n');
const output = rewritePortalText(input, portal);

assert.ok(output.includes(`fetch('${prefix}/api/keystatic/tree')`));
assert.ok(output.includes(`fetch("${prefix}/api/ai/translations")`));
assert.ok(output.includes(`router.push(\`${prefix}/branch/main\`)`));
assert.ok(output.includes(`new URL("${prefix}", deployedURL)`));
assert.ok(output.includes(String.raw`replace(/^\/11111111-1111-4111-8111-111111111111\/?/, "")`));
assert.ok(output.includes(String.raw`.*?\/11111111-1111-4111-8111-111111111111(?:\/branch`));
assert.ok(!output.includes(String.raw`/^\/keystatic\/?/`));
assert.ok(output.includes('https://keystatic.cloud/account'));
assert.ok(output.includes(String.raw`https:\/\/keystatic.cloud/account`));
assert.ok(output.includes('${window.location.origin}/api/keystatic/github/oauth/callback'));
assert.equal(rewritePortalText(output, portal), output);
assert.equal(rewritePortalLocation('/keystatic/branch/main', portal), `${prefix}/branch/main`);
assert.equal(rewritePortalLocation('/api/keystatic/github/login', portal), `${prefix}/api/keystatic/github/login`);
assert.equal(rewritePortalLocation('https://github.com/login/oauth/authorize', portal), 'https://github.com/login/oauth/authorize');

const manager = { ...portal, name: 'manager', uuid: '22222222-2222-4222-8222-222222222222' };
assert.equal(
  rewritePortalText(`fetch('/api/manager/status'); const docs = '/keystatic/help';`, manager),
  `fetch('/${manager.uuid}/api/manager/status'); const docs = '/keystatic/help';`
);

console.log('Admin portal gateway and response rewrite checks passed.');
