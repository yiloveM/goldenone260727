import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';
import { requireInternalPortalAccess } from '../../../lib/admin-portals';
import { githubFetch, getRepoFullName, getBranch, workflowRunsUrl } from '../../../lib/manager/github';
import { decodeGitBlob } from '../../../lib/site-git';
import { configSnapshot } from '../../../../scripts/llms-discovery/config.mjs';
export const prerender=false;
export const GET:APIRoute=async({locals,request,cookies})=>{
  const env=getRuntimeEnv(locals),denied=requireInternalPortalAccess(request,env,'keystatic');if(denied)return denied;
  try{
    const assets=env?.ASSETS as {fetch:(request:Request)=>Promise<Response>}|undefined;
    if(!assets)return new Response('状态尚未生成。',{status:503});
    const result=await assets.fetch(new Request(new URL('/_llms/status.json',request.url)));
    if(!result.ok)return new Response('状态尚未生成。',{status:503});
    const report=await result.json() as Record<string,any>;
    const repo=getRepoFullName(env),branch=getBranch(env),token=cookies.get('keystatic-gh-access-token')?.value;
    if(!token)return new Response('请重新登录站长后台。',{status:401});
    const current=await githubFetch<{encoding:string;content:string}>(`https://api.github.com/repos/${repo}/contents/src/data/ai-seo-settings.json?ref=${encodeURIComponent(branch)}`,token);
    if(current.encoding!=='base64')throw new Error('Unreadable configuration.');
    const bytes=new TextEncoder().encode(configSnapshot(JSON.parse(decodeGitBlob(current.content))));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    return Response.json({enabled:report.enabled,matchesCurrent:hash===report.configHash,locales:report.locales,limits:report.limits,skipped:report.skipped,logsUrl:workflowRunsUrl(repo,'site-publish.yml')},{headers:{'cache-control':'private, no-store','x-robots-tag':'noindex'}});
  }catch{return new Response('生成状态暂时无法读取，请稍后重试。',{status:503,headers:{'cache-control':'no-store'}});}
};
