import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, Response } from 'miniflare';

// Run the real bulk reader in workerd: Node's fetch accepts redirect:error,
// whereas the production Cloudflare runtime rejects it before making a request.
test('bulk Git reads work at the edge and never follow credentialed redirects', async () => {
  const result = await build({ stdin: { contents: `
    import { readGitBlobs } from './src/lib/site-git.ts';
    import { githubFetch } from './src/lib/manager/github.ts';
    export default { async fetch(request) {
      try {
        if(new URL(request.url).searchParams.has('rest')) {
          await githubFetch('https://api.github.com/repos/fixture/edge/actions/workflows/site-publish.yml/dispatches','isolated-test-token',{method:'POST',redirect:'follow'});
          return Response.json({ok:true});
        }
        const records = await readGitBlobs({repo:'fixture/edge',branch:'main',token:'isolated-test-token'},
          Array.from({length:9},(_,i)=>(i+1).toString(16).padStart(40,'0')));
        return Response.json({count:records.size});
      } catch (error) { return Response.json({error:error.message},{status:502}); }
    }};
  `, resolveDir: process.cwd() }, bundle:true, write:false, format:'esm', platform:'neutral', external:['cloudflare:workers'], logLevel:'silent' });
  let redirect = 0, calls = 0;
  const mf = new Miniflare({ modules:true, script:result.outputFiles[0].text,
    compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
    outboundService:async request => {
      calls++;
      assert.equal(new URL(request.url).origin,'https://api.github.com');
      assert.equal(request.headers.get('authorization'),'Bearer isolated-test-token');
      if(redirect) return new Response('',{status:redirect,headers:{location:'https://invalid.example/never-follow'}});
      if(new URL(request.url).pathname!=='/graphql') return new Response(null,{status:204});
      const {variables} = await request.json(), repository={nameWithOwner:'fixture/edge'};
      for(const [key,sha] of Object.entries(variables)) if(key.startsWith('s')) repository[`b${key.slice(1)}`]={oid:sha,text:sha,byteSize:40,isBinary:false,isTruncated:false};
      return Response.json({data:{repository}});
    }});
  try {
    const response=await mf.dispatchFetch('http://localhost/');
    const payload=await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.equal(payload.count,9); assert.equal(calls,1);
    const dispatch=await mf.dispatchFetch('http://localhost/?rest');
    assert.equal(dispatch.status,200); assert.equal((await dispatch.json()).ok,true);
    for(const status of [301,302,303,307,308]) for(const query of ['', '?rest']) {
      redirect=status;
      const before=calls, blocked=await mf.dispatchFetch('http://localhost/'+query);
      assert.equal(blocked.status,502);
      assert.match((await blocked.json()).error,/异常跳转/);
      assert.equal(calls,before+1,'redirect target must never be requested');
    }
  } finally { await mf.dispose(); }
});
