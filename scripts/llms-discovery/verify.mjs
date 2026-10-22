import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {readPage,escapeMarkdown} from './html.mjs';
import {publicPath} from './config.mjs';
export async function verifyDiscovery({outputDir,origin}){
  const root=resolve(outputDir),base=new URL(origin).origin;
  const at=path=>{assert.ok(publicPath(path),path);const file=resolve(root,'.'+path);assert.ok(file.startsWith(root+sep),path);return file;};
  const outputs=JSON.parse(await readFile(resolve(root,'_llms/generated.json'),'utf8'));
  const report=JSON.parse(await readFile(resolve(root,'_llms/status.json'),'utf8'));
  assert.equal(new Set(outputs).size,outputs.length);assert.equal(report.origin,base);
  let links=0,mirrors=0;
  for(const path of outputs){
    const content=await readFile(at(path),'utf8');
    if(path.endsWith('.md')){
      mirrors++;assert.ok(content.startsWith('<!-- businessweb-ai-discovery:v2 -->'));
      const source=path.endsWith('/index.md')?path.slice(0,-8):path.slice(0,-3);
      let file=at(source+'index.html');
      if(!source.endsWith('/')){file=at(source);try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');}catch{assert.fail('Missing HTML for '+path);}}
      const html=await readFile(file,'utf8'),page=readPage(html,new URL(source,base).href);
      assert.equal(page.canonical,new URL(source,base).href);assert.ok(content.includes(`# ${escapeMarkdown(page.title)}\n`));assert.ok(content.includes(page.content),'Mirror differs from its rendered CMS content: '+path);
      assert.ok(html.includes(`type="text/markdown" href="${path}"`),'Missing real alternate: '+path);
      assert.doesNotMatch(page.robots,/(?:^|[\s,])noindex(?:$|[\s,])/i);
    }else if(path.endsWith('/llms.txt')){
      assert.match(content,/^# [^\n]+\n\n> [^\n]+\n/);
      const locale=report.locales.find(item=>item.path===path);assert.ok(locale,path);
      let count=0;
      for(const line of content.split('\n').filter(line=>line.startsWith('- '))){
        const match=line.match(/^- \[(.+)\]\(<([^>]+)>\): (.+)$/);assert.ok(match,'Invalid v2 link line: '+line);
        const url=new URL(match[2]);assert.equal(url.origin,base);assert.ok(url.pathname.startsWith(path.slice(0,-8)));
        let target=at(url.pathname);if((await stat(target)).isDirectory())target=resolve(target,'index.html');assert.ok((await stat(target)).isFile(),'Missing target '+url.pathname);links++;count++;
      }
      assert.equal(count,locale.entries);
    }else if(path.endsWith('/llms-full.txt'))assert.match(content,/^# /);
  }
  assert.equal(mirrors,report.markdown);
  if(!report.enabled)assert.equal(outputs.length,0);
  return {links,mirrors,locales:report.locales.length,scope:'LOCAL_BUILD_ONLY'};
}
