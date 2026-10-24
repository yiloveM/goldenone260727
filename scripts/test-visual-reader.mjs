import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReader } from '@keystatic/core/reader';
const output=resolve('.sandbox/site-visual-reader');await mkdir(output,{recursive:true});const run=await mkdtemp(resolve(output,'run-'));
await build({stdin:{contents:"import{config,singleton}from'@keystatic/core';import{siteVisualFields}from'./src/keystatic/site-visual-fields';export default config({storage:{kind:'local'},singletons:{siteVisuals:singleton({label:'站点视觉',path:'src/data/site-visuals',format:'json',schema:siteVisualFields()})}})",resolveDir:process.cwd(),loader:'ts'},outfile:resolve(run,'config.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',define:{'import.meta.env':'{}'},logLevel:'silent'});
const {default:config}=await import(pathToFileURL(resolve(run,'config.mjs')));const root=resolve(run,'content');await mkdir(resolve(root,'src/data'),{recursive:true});
const read=()=>createReader(root,config).singletons.siteVisuals.read(),file=resolve(root,'src/data/site-visuals.json');assert.equal(await read(),null);
const source=JSON.parse(await readFile('src/data/site-visuals.json','utf8'));let checks=1;
for(const mode of ['OFF','ON_EMPTY','ON','OFF_KEEP','RE_ENABLE']){const data=structuredClone(source),visual=data.home.heroSlides[0].visual;visual.enabled=['ON_EMPTY','ON','RE_ENABLE'].includes(mode);visual.image=['ON','OFF_KEEP','RE_ENABLE'].includes(mode)?'/r2/fixtures/banner.webp':'';visual.localizedAlts=[{locale:'es',text:'Ilustración'}];await writeFile(file,JSON.stringify(data));assert.deepEqual(await read(),data);await writeFile(file,JSON.stringify(await read()));assert.deepEqual(await read(),data);checks++;}
const minimal={version:1,home:{heroSlides:[],center:{},primaryCta:{}},pages:Object.fromEntries(Object.keys(source.pages).map(key=>[key,{}])),categories:[]};await writeFile(file,JSON.stringify(minimal));const parsed=await read();assert.equal(parsed.pages.about.enabled,false);assert.equal(parsed.pages.about.focusX,null);checks++;
console.log(JSON.stringify({reader:'REAL_KEYSTATIC',passed:checks,sourceFile:'COPY_ONLY',cloudWrites:'NONE'}));
