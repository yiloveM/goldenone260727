type Assets={fetch:(request:Request)=>Promise<Response>};
type Settings={enabled:boolean;markdown:boolean;llmsFull:boolean};
export async function discoveryResponse(request:Request,assets:Assets|undefined,settings:Settings):Promise<Response|null>{
  const url=new URL(request.url),isMarkdown=url.pathname.endsWith('.md');
  if(!isMarkdown&&!/(?:^|\/)llms(?:-full)?\.txt$/.test(url.pathname))return null;
  const absent=()=>new Response(request.method==='HEAD'?null:'Not found.',{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex','x-content-type-options':'nosniff'}});
  if(!['GET','HEAD'].includes(request.method)||!assets)return absent();
  if(!isMarkdown&&(!settings.enabled||url.pathname.endsWith('llms-full.txt')&&!settings.llmsFull))return absent();
  const response=await assets.fetch(new Request(request,{method:'GET'}));
  if(response.status!==200)return absent();
  const body=await response.text();
  if(isMarkdown&&!body.startsWith('<!-- businessweb-ai-discovery:v2 -->')){
    // Keep unrelated, existing Markdown assets usable even when this optional
    // system is OFF; only reject an HTML fallback masquerading as Markdown.
    if(/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body)||/text\/html/i.test(response.headers.get('content-type')||''))return absent();
    return new Response(request.method==='HEAD'?null:body,{status:response.status,headers:response.headers});
  }
  if(isMarkdown?(!settings.enabled||!settings.markdown):!/^# [^\r\n]+\n/.test(body))return absent();
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  headers.set('content-type',isMarkdown?'text/markdown; charset=utf-8':'text/plain; charset=utf-8');
  headers.set('cache-control','public, max-age=0, must-revalidate');headers.set('x-content-type-options','nosniff');
  if(isMarkdown){
    headers.set('x-robots-tag','noindex, follow');
    const scope=body.match(/^<!-- discovery-scope:(\/(?:[a-z0-9-]+\/)*llms\.txt) -->$/im)?.[1];
    if(scope)headers.set('link',`<${scope}>; rel="describedby"`);
  }
  return new Response(request.method==='HEAD'?null:body,{status:200,headers});
}
