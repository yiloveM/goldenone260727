import { confirmDeletionPlan } from '../../lib/admin-dialog.mjs';
export function installFormalContent(context) {
  const selected={product:new Set(),blog:new Set()},busy=new Set();
  const config={product:{prefix:'product',list:'productList',filter:'filteredProducts',render:'renderProducts',reload:'loadProducts',status:'productBrowserStatus',endpoint:'product-deletion'},blog:{prefix:'blog',list:'blogList',filter:'filteredBlogPosts',render:'renderBlogPosts',reload:'loadBlogPosts',status:'blogStatus',endpoint:'blog-deletion'}};
  const formalCheckbox=(kind,record)=>`<input type="checkbox" data-formal-select="${kind}" data-source-path="${context.escapeHtml(record.sourcePath||'')}" aria-label="选择 ${context.escapeHtml(record.locale||'en')} ${context.escapeHtml(record.title)}" ${selected[kind].has(record.sourcePath)?'checked':''} ${!record.sourceSha||busy.has(kind)?'disabled':''} />`;
  const formalDeleteButton=(kind,record)=>`<button type="button" class="button danger" data-formal-delete="${kind}" data-source-path="${context.escapeHtml(record.sourcePath||'')}" ${!record.sourceSha||busy.has(kind)?'disabled':''}>删除</button>`;
  const syncFormalSelection=kind=>{
    const settings=config[kind],rows=context[settings.filter]().filter(row=>row.sourceSha),chosen=rows.filter(row=>selected[kind].has(row.sourcePath));
    const all=context.$(`${settings.prefix}ContentSelectAll`);all.checked=!!rows.length&&chosen.length===rows.length;all.indeterminate=chosen.length>0&&chosen.length<rows.length;all.disabled=busy.has(kind)||!rows.length;
    context.$(`${settings.prefix}ContentSelection`).textContent=`已选 ${chosen.length} 项 / 当前筛选 ${rows.length} 项（全部分页）`;
    context.$(`${settings.prefix}ContentDelete`).disabled=busy.has(kind)||!chosen.length;
    context.$(`${settings.prefix}ContentClear`).disabled=busy.has(kind)||!chosen.length;
    context.$(`${settings.prefix}ContentBulk`).hidden=!chosen.length;
    context.$(`${settings.prefix}ContentTranslate`).disabled=busy.has(kind)||!chosen.length||chosen.length>5||chosen.some(row=>(row.locale||'en')!=='en');
    const available=new Set(rows.map(row=>row.sourcePath));
    context.$(settings.list).querySelectorAll('[data-formal-select],[data-formal-delete]').forEach(node=>{node.disabled=busy.has(kind)||!available.has(node.dataset.sourcePath);});
  };
  const removeFormalContent=async(kind,path='')=>{
    const settings=config[kind],rows=context[settings.filter]().filter(row=>path?row.sourcePath===path:selected[kind].has(row.sourcePath));
    if(busy.has(kind)||!rows.length)return;
    const returnFocus=document.activeElement;
    busy.add(kind);syncFormalSelection(kind);
    try {
      const plan=await context.requestJson(`/api/manager/${settings.endpoint}`,{method:'POST',body:JSON.stringify({selection:rows.map(({sourcePath,sourceSha})=>({sourcePath,sourceSha}))})});
      if(!await confirmDeletionPlan(plan,{returnFocus}))return;
      const result=await context.requestJson(`/api/manager/${settings.endpoint}`,{method:'DELETE',body:JSON.stringify({...plan,confirmed:true})});
      selected[kind].clear();await context[settings.reload]();context.setStatus(settings.status,result.message);
    }finally{busy.delete(kind);syncFormalSelection(kind);}
  };
  for(const [kind,settings] of Object.entries(config)) {
    const list=context.$(settings.list),prefix=settings.prefix;
    const toolbar=document.createElement('div');toolbar.className='toolbar is-row formal-content-toolbar';
    toolbar.innerHTML=`<label class="toggle"><input id="${prefix}ContentSelectAll" type="checkbox" />全选当前筛选</label><span role="status" aria-live="polite" id="${prefix}ContentSelection">已选 0 项</span><span class="formal-bulk-actions" id="${prefix}ContentBulk" hidden><button class="button secondary" id="${prefix}ContentTranslate" type="button" title="选择英语原文，每批最多 5 篇">翻译选中原文</button><button class="button secondary" id="${prefix}ContentClear" disabled type="button">清空选择</button><button class="button danger" id="${prefix}ContentDelete" disabled type="button">删除选中${kind==='product'?'产品':'文章'}</button></span>`;list.before(toolbar);
    context.$(`${prefix}ContentTranslate`).addEventListener('click',()=>context.beginTranslation(kind,context[settings.filter]().filter(row=>selected[kind].has(row.sourcePath))).catch(error=>context.setStatus(settings.status,error.message,true)));
    context.$(`${prefix}ContentSelectAll`).addEventListener('change',event=>{selected[kind]=new Set(event.target.checked?context[settings.filter]().filter(row=>row.sourceSha).map(row=>row.sourcePath):[]);context[settings.render]();});
    context.$(`${prefix}ContentClear`).addEventListener('click',()=>{selected[kind].clear();context[settings.render]();});
    const fail=error=>context.setStatus(settings.status,error.message,true);
    context.$(`${prefix}ContentDelete`).addEventListener('click',()=>removeFormalContent(kind).catch(fail));
    list.addEventListener('change',event=>{const input=event.target.closest('[data-formal-select]');if(!input)return;if(input.checked)selected[kind].add(input.dataset.sourcePath);else selected[kind].delete(input.dataset.sourcePath);syncFormalSelection(kind);});
    list.addEventListener('click',event=>{const button=event.target.closest('[data-formal-delete]');if(button&&!button.disabled)removeFormalContent(kind,button.dataset.sourcePath).catch(fail);});
    const filters=kind==='product'?[['searchInput','input'],['categoryFilter','change'],['productLanguageFilter','change']]:[['blogSearchInput','input'],['blogLanguageFilter','change'],['blogCategoryFilter','change']];
    for(const [id,event] of filters)context.$(id).addEventListener(event,()=>{selected[kind].clear();context[settings.render]();});
  }
  Object.assign(context,{formalCheckbox,formalDeleteButton,syncFormalSelection,removeFormalContent});
}
