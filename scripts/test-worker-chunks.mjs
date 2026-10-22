import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync} from 'node:zlib';
import {compactWorkerChunks} from './worker-chunks.mjs';
test('Worker whitespace compaction keeps public data, identifiers and JS semantics',async()=>{
  const plugin=compactWorkerChunks();
  const source=`/*! MIT license */
    export function NamedHandler(value) { return value?.name ?? 'Default'; }
    export class NamedModel { get unit() { return '20 mm² · 2.5 MPa'; } }
    export const content={ar:'مرحبا',zh:'技术参数',date:'2026-10-22',nested:[{model:'X20',value:'20 °C'}]};
    export const regex = /x\\/y/;
    export const calculation = 2 + + 3;
  `;
  const result=await plugin.renderChunk(source,{fileName:'chunks/worker.mjs'});
  const load=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const before=await load(source),after=await load(result.code);
  assert.deepEqual(after.content,before.content);assert.equal(after.NamedHandler.name,before.NamedHandler.name);assert.equal(after.NamedModel.name,before.NamedModel.name);assert.equal(new after.NamedModel().unit,new before.NamedModel().unit);assert.equal(after.regex.source,before.regex.source);assert.equal(after.calculation,before.calculation);assert.match(result.code,/MIT license/);assert.ok(result.map);
  assert.equal(await plugin.renderChunk(source,{fileName:'assets/client.js'}),null);
  const expanded='export const content = [\n'+Array.from({length:1000},(_,i)=>`  { model: 'X${i}', pressure: '2.5 MPa' },\n`).join('')+'];';
  const compact=await plugin.renderChunk(expanded,{fileName:'chunks/data.mjs'});assert.ok(gzipSync(compact.code).length<gzipSync(expanded).length);
});
