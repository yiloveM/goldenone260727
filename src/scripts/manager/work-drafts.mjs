import { adminDialog } from '../../lib/admin-dialog.mjs';
export function installWorkDrafts(context) {
  const config = { product: {list:'draftList',records:'drafts',render:'renderDrafts',reload:'loadDrafts',status:'statusText',title:'产品'},blog:{list:'blogDraftWorkList',records:'blogDrafts',render:'renderBlogWorkDrafts',reload:'loadBlogDrafts',status:'blogStatus',title:'文章'},review:{list:'reviewDraftList',records:'reviewDrafts',render:'renderReviews',reload:'loadReviews',status:'reviewStatus',title:'评价'} };
  const busy = new Set();
  const workDraftBusy = status => ['queued','dispatching','running'].includes(status);
  const workDraftStatus = status => ({draft:'未应用',queued:'任务处理中',dispatching:'任务提交中',running:'任务运行中',applied:'已应用 · 网站更新请查看发布记录',failed:'应用未完成'}[status] || '状态待确认');
  const showWorkDraftHistory = kind => Boolean(context.$(`${kind}WorkShowHistory`)?.checked);
  const workDraftVisible = (kind,draft) => draft.status !== 'applied' || showWorkDraftHistory(kind);
  const workDraftCheckbox = (kind,draft) => `<input type="checkbox" data-work-select="${kind}:${context.escapeHtml(draft.id)}" ${workDraftBusy(draft.status)?'disabled':''} aria-label="选择工作记录 ${context.escapeHtml(draft.productTitle||draft.blogTitle||draft.buyerLabel||'')}" />`;
  const workDraftActions = (kind,draft) => `<button class="button danger" data-work-delete="${kind}:${context.escapeHtml(draft.id)}" ${workDraftBusy(draft.status)?'disabled':''} type="button">${draft.status==='applied'?'移除记录':'删除草稿'}</button>`;

  const selectedRows = kind => [...context.$(config[kind].list).querySelectorAll(`[data-work-select^="${kind}:"]:checked`)].map(input=>input.dataset.workSelect.slice(kind.length+1));
  const syncWorkDraftControls = kind => {
    const settings=config[kind],list=context.$(settings.list),all=context.$(`${kind}WorkSelectAll`);
    if(!list||!all)return;
    const inputs=[...list.querySelectorAll('[data-work-select]:not(:disabled)')],selected=inputs.filter(input=>input.checked).length;
    all.checked=!!inputs.length&&selected===inputs.length;all.indeterminate=selected>0&&selected<inputs.length;all.disabled=busy.has(kind)||!inputs.length;
    context.$(`${kind}WorkSelection`).textContent=`已选 ${selected} 条`;
    context.$(`${kind}WorkDelete`).disabled=busy.has(kind)||!selected;
  };
  const deleteWorkDrafts = async(kind,ids=selectedRows(kind))=>{
    if(busy.has(kind)||!ids.length)return;
    const settings=config[kind],rows=context.state[settings.records].filter(record=>ids.includes(record.id));
    if(rows.length!==ids.length||rows.some(record=>workDraftBusy(record.status)))throw new Error('工作记录已变化或任务仍在执行，请刷新。');
    const returnFocus=document.activeElement;
    busy.add(kind);syncWorkDraftControls(kind);
    try {
      const confirmed=await adminDialog({returnFocus,title:`移除 ${rows.length} 条${settings.title}工作草稿记录`,danger:true,confirmLabel:'确认移除记录',message:'这里只移除这条工作记录。产品、文章、图片和下载文件会保留；正在处理的任务暂时不能移除。',items:rows.map(record=>({title:record.productTitle||record.blogTitle||record.buyerLabel||record.id,detail:`${workDraftStatus(record.status)} · ${context.formatDate(record.updatedAt)}`}))});
      if(!confirmed)return;
      await context.requestJson(`/api/manager/${kind}-drafts`,{method:'DELETE',body:JSON.stringify({confirmed:true,records:rows.map(({id,updatedAt})=>({id,updatedAt}))})});
      const activeKey={product:'activeDraftId',blog:'activeBlogDraftId',review:'activeReviewDraftId'}[kind];
      if(ids.includes(context.state[activeKey]))context.state[activeKey]='';
      await context[settings.reload]();context.setStatus(settings.status,'工作记录已移除，正式网站内容保持。');
    }finally{busy.delete(kind);syncWorkDraftControls(kind);}
  };
  for(const [kind,settings] of Object.entries(config)) {
    const list=context.$(settings.list);if(!list)continue;
    const toolbar=document.createElement('div');toolbar.className='toolbar is-row work-draft-toolbar';
    toolbar.innerHTML=`<label class="toggle"><input type="checkbox" id="${kind}WorkShowHistory" />显示已应用历史</label><label class="toggle"><input type="checkbox" id="${kind}WorkSelectAll" />全选当前工作记录</label><button class="button secondary" id="${kind}WorkRefresh" type="button">刷新记录</button><span role="status" id="${kind}WorkSelection">已选 0 条</span><button class="button danger" id="${kind}WorkDelete" disabled type="button">删除选中工作记录</button>`;
    list.before(toolbar);
    context.$(`${kind}WorkRefresh`).addEventListener('click',()=>context[settings.reload]().catch(error=>context.setStatus(settings.status,error.message,true)));
    context.$(`${kind}WorkShowHistory`).addEventListener('change',()=>context[settings.render]());
    context.$(`${kind}WorkSelectAll`).addEventListener('change',event=>{list.querySelectorAll('[data-work-select]:not(:disabled)').forEach(input=>{input.checked=event.target.checked;});syncWorkDraftControls(kind);});
    list.addEventListener('change',()=>syncWorkDraftControls(kind));
    const fail=error=>context.setStatus(settings.status,error.message,true);
    context.$(`${kind}WorkDelete`).addEventListener('click',()=>deleteWorkDrafts(kind).catch(fail));
    list.addEventListener('click',event=>{const button=event.target.closest('[data-work-delete]');if(button&&!button.disabled){event.stopPropagation();deleteWorkDrafts(kind,[button.dataset.workDelete.slice(kind.length+1)]).catch(fail);}});
  }
  Object.assign(context,{workDraftBusy,workDraftStatus,workDraftVisible,workDraftCheckbox,workDraftActions,syncWorkDraftControls,deleteWorkDrafts});
}
