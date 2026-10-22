import { parse } from 'parse5';
export const walk = node => [node,...(node.childNodes||[]).flatMap(walk)];
export const attr = (node,name) => node.attrs?.find(item=>item.name===name)?.value || '';
export const text = node => node?.nodeName==='#text'?node.value:(node?.childNodes||[]).map(text).join('');
export const compact = value => String(value||'').replace(/\s+/gu,' ').trim();
export const escapeMarkdown = value => compact(value).replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
const excluded=new Set(['script','style','noscript','nav','footer','header','form','button','input','select','textarea','dialog','svg','iframe','object','embed','template']);
const safeUrl=(value,base)=>{try{const url=new URL(value,base);return ['https:','http:','mailto:','tel:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
const children=(node,base)=>(node.childNodes||[]).map(child=>markdown(child,base)).join('');
const safeTable = (node,base) => {
  // Preserve spanning headers and units rather than flattening ambiguous cells.
  const allowed=new Set(['table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col','p','br','strong','em','sup','sub','a']);
  const clean=node=>{
    if(node.nodeName==='#text')return node.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const inner=(node.childNodes||[]).map(clean).join('');
    if(excluded.has(node.nodeName))return '';
    if(!allowed.has(node.nodeName))return inner;
    const attributes=(node.attrs||[]).filter(item=>['colspan','rowspan'].includes(item.name)&&/^[1-9]\d{0,2}$/.test(item.value)).map(item=>` ${item.name}="${item.value}"`).join('');
    if(node.nodeName==='a'){const href=safeUrl(attr(node,'href'),base);return href?`<a href="${href.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${inner}</a>`:inner;}
    return `<${node.nodeName}${attributes}>${inner}${['br','col'].includes(node.nodeName)?'':`</${node.nodeName}>`}`;
  };return `\n\n${clean(node)}\n\n`;
};
function markdown(node,base){
  if(!node)return '';
  if(node.nodeName==='#text')return node.value.replace(/\s+/gu,' ').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
  const tag=node.nodeName;
  if(excluded.has(tag)||attr(node,'aria-hidden')==='true'||node.attrs?.some(a=>a.name==='hidden'))return '';
  if(tag==='table'){
    const rows=walk(node).filter(n=>n.nodeName==='tr').map(row=>(row.childNodes||[]).filter(n=>['th','td'].includes(n.nodeName)));
    if(!rows.length)return '';
    if(walk(node).some(n=>Number(attr(n,'rowspan')||1)>1||Number(attr(n,'colspan')||1)>1)||rows.some(row=>row.length!==rows[0].length))return safeTable(node,base);
    const lines=rows.map(row=>`| ${row.map(cell=>compact(children(cell,base)).replace(/\|/g,'\\|')).join(' | ')} |`);
    const caption=walk(node).find(n=>n.nodeName==='caption');
    lines.splice(1,0,`| ${rows[0].map(()=>'---').join(' | ')} |`);return '\n\n'+(caption?compact(children(caption,base))+'\n\n':'')+lines.join('\n')+'\n\n';
  }
  if(tag==='pre')return '\n\n````\n'+text(node).replace(/````/g,'` ` ` `')+'\n````\n\n';
  if(tag==='ol'){
    const start=/^[1-9]\d*$/.test(attr(node,'start'))?Number(attr(node,'start')):1;
    return '\n\n'+(node.childNodes||[]).filter(child=>child.nodeName==='li').map((child,index)=>`${start+index}. ${children(child,base).trim().replace(/\n/g,'\n   ')}`).join('\n')+'\n\n';
  }
  const inner=children(node,base);
  if(/^h[1-6]$/.test(tag))return `\n\n${'#'.repeat(Math.max(2,Number(tag[1])))} ${compact(inner)}\n\n`;
  if(tag==='a'){const href=safeUrl(attr(node,'href'),base);return href&&compact(inner)?`[${compact(inner)}](<${href.replace(/[<>\s]/g,c=>encodeURIComponent(c))}>)`:inner;}
  if(tag==='img'){const src=safeUrl(attr(node,'src'),base);return src?`\n\n![${escapeMarkdown(attr(node,'alt'))}](<${src}>)\n\n`:'';}
  if(tag==='li')return `\n- ${inner.trim()}\n`;
  if(tag==='br')return '  \n';
  if(tag==='strong'||tag==='b')return `**${inner}**`;
  if(tag==='em'||tag==='i')return `*${inner}*`;
  if(tag==='sup'||tag==='sub')return `<${tag}>${inner}</${tag}>`;
  if(tag==='code')return '`'+text(node).replace(/`/g,'\\`')+'`';
  if(['p','section','article','div','dl','dt','dd','ul','ol','blockquote'].includes(tag))return `\n\n${inner}\n\n`;
  return inner;
}
export function readPage(html,url){
  const document=parse(html),nodes=walk(document),head=nodes.find(n=>n.nodeName==='head');
  const headNodes=walk(head||{childNodes:[]});
  const main=nodes.find(n=>n.nodeName==='main');
  const canonical=attr(headNodes.find(n=>n.nodeName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical')),'href');
  const robots=headNodes.filter(n=>n.nodeName==='meta'&&['robots','googlebot'].includes(attr(n,'name').toLowerCase())).map(n=>attr(n,'content')).join(',');
  const description=attr(headNodes.find(n=>n.nodeName==='meta'&&attr(n,'name')==='description'),'content');
  const heading=main&&walk(main).find(n=>n.nodeName==='h1');
  const title=compact(text(heading)||text(headNodes.find(n=>n.nodeName==='title')));
  const language=attr(nodes.find(n=>n.nodeName==='html'),'lang');
  const content=main?markdown(main,url).replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim():'';
  const types=[];
  for(const script of headNodes.filter(n=>n.nodeName==='script'&&attr(n,'type').toLowerCase()==='application/ld+json')){
    try{const value=JSON.parse(text(script)),items=Array.isArray(value)?value:[value];for(const item of items.flatMap(value=>value?.['@graph']||[value]))types.push(...(Array.isArray(item?.['@type'])?item['@type']:[item?.['@type']]).filter(value=>typeof value==='string'));}catch{/* Existing JSON-LD checks own malformed public data. */}
  }
  return {title,description:compact(description),canonical,robots,language,content,main:!!main,types,
    // Only our generated tags are removed; authored canonical/hreflang stay byte-identical.
    html:html.replace(/<link\b[^>]*\bdata-llms-discovery=["']true["'][^>]*>\s*/gi,'')};
}
