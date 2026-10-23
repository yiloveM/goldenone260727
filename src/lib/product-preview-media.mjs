import { safeContentUrl } from './content-links.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function productPreviewMedia(data, media) {
  const resolve = value => { const safe=safeContentUrl(String(value ?? '').trim().replace(/^r2\//i,'/r2/'),true);return safe?safeContentUrl(media(safe),true):''; };
  const cover=resolve(data.image), seen=new Set(cover?[cover]:[]), gallery=[];
  for(const value of Array.isArray(data.galleryImages)?data.galleryImages:[]) {
    const src=resolve(value);if(src&&!seen.has(src)){seen.add(src);gallery.push(src);}
  }
  // Keep separate detail groups, including repeated images with different captions.
  const details=(Array.isArray(data.detailImages)?data.detailImages:[]).flatMap(item=>{
    if(!item||typeof item!=='object')return [];const src=resolve(item.image);
    return src?[{src,title:typeof item.title==='string'?item.title:'',caption:typeof item.caption==='string'?item.caption:''}]:[];
  });
  return {cover,gallery,details};
}

export function renderProductPreviewMedia(data, media, { includeCover = true, title = data.title || '' } = {}) {
  const {cover,gallery,details}=productPreviewMedia(data,media);
  const image=(src,alt)=>`<img src="${escape(src)}" alt="${escape(alt)}" loading="lazy" style="display:block;max-width:100%;height:auto;object-fit:contain">`;
  const photos=[...(includeCover&&cover?[cover]:[]),...gallery];
  return (photos.length?`<section class="preview-card" aria-label="Product images"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:16px">${photos.map(src=>`<figure style="margin:0;min-width:0">${image(src,title)}</figure>`).join('')}</div></section>`:'')+
    details.map(item=>`<figure class="preview-card" style="margin:20px 0;min-width:0;overflow-wrap:anywhere">${item.title?`<h2>${escape(item.title)}</h2>`:''}${image(item.src,item.title||title)}${item.caption?`<figcaption style="margin-top:8px;font-size:14px;line-height:1.6;white-space:pre-wrap">${escape(item.caption)}</figcaption>`:''}</figure>`).join('');
}
