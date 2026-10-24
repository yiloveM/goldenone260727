import {sitePolicyFixture} from './site-policy-test-fixture.mjs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReader} from '@keystatic/core/reader';
await mkdir('.sandbox/content-admin-reader',{recursive:true});const out=await mkdtemp(resolve('.sandbox/content-admin-reader/run-'));
await build({plugins:[sitePolicyFixture()],entryPoints:['keystatic.config.ts'],outfile:resolve(out,'config.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{"PROD":true}'},logLevel:'error'});
const {default:config}=await import(pathToFileURL(resolve(out,'config.mjs'))),reader=createReader(process.cwd(),config),counts={};
for(const name of ['products','blog','productTranslations','blogTranslations']){
 let count=0;for(const id of await reader.collections[name].list()){assert.ok(await reader.collections[name].read(id),`${name}/${id}`);count++;}counts[name]=count;
}
assert.ok(config.singletons.blogManager);console.log(JSON.stringify({reader:'PASS',counts,cloudWrites:'NONE'}));
