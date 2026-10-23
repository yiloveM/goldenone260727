import { confirmDialog } from '../../lib/admin-dialog.mjs';

export function installWorkspace(context) {
  const clean = new Map(), retained = new Map(), $ = context.$;
  const forms = { product: 'productForm', blog: 'blogForm', translation: 'translationEditorForm', review: 'reviewForm', visual: 'visualForm' };
  const fingerprint = kind => {
    if (kind === 'visual') return JSON.stringify(context.visualPayload());
    const form = $(forms[kind]); if (!form) return '';
    const fields = [...form.querySelectorAll('input,textarea,select,[contenteditable=true]')].map(node => [node.id || node.dataset.list || node.dataset.field || '', node.type === 'checkbox' ? node.checked : node.isContentEditable ? node.innerHTML : node.value]);
    return JSON.stringify([fields, kind === 'product' ? context.state.formData : kind === 'translation' ? context.state.translationFormData : null]);
  };
  const markEditorClean = kind => clean.set(kind, fingerprint(kind));
  const editorIsDirty = kind => clean.has(kind) && clean.get(kind) !== fingerprint(kind);
  const allowDiscard = async kind => !editorIsDirty(kind) || await confirmDialog('当前修改尚未保存。放弃后会重新载入已保存内容；取消可以继续编辑。', { title: '放弃未保存的修改？', confirmLabel: '放弃修改', cancelLabel: '继续编辑' });
  Object.assign(context, { markEditorClean, editorIsDirty, allowDiscard });

  // Hooks run before bootstrap binds buttons, preserving ordinary function and
  // in-flight save semantics. Switching workspaces keeps editors in memory.
  for (const [kind, names] of Object.entries({ product: ['selectProduct', 'startNewProduct'], blog: ['selectBlogPost', 'startNewBlog'], translation: ['openTranslationDraftEditor'], review: ['fillReviewForm'] })) {
    for (const name of names) { const original = context[name]; if (!original) continue; context[name] = async (...args) => { if (!await allowDiscard(kind)) return; const result = await original(...args); markEditorClean(kind); retained.set(kind, true); updateEditorContext(kind); return result; }; }
  }
  for (const [kind, name] of [['product','saveDraft'],['blog','saveBlogDraft'],['translation','saveTranslationDraftEditor'],['review','saveReviewDraft']]) {
    const original = context[name]; context[name] = async (...args) => { const result = await original(...args); if (result) markEditorClean(kind); if (result) refreshWorkspace().catch(() => {}); return result; };
  }
  for (const [kind, name] of [['product','showProductBrowser'],['blog','showBlogBrowser'],['translation','closeTranslationEditor']]) {
    const original = context[name]; context[name] = async (...args) => { if (!await allowDiscard(kind)) return; markEditorClean(kind); retained.set(kind, false); return original(...args); };
  }
  const originalTab = context.activateTab;
  context.activateTab = tab => {
    const productEditing = retained.get('product') && editorIsDirty('product'), blogEditing = retained.get('blog') && editorIsDirty('blog');
    // Core's tab initialization has no reason to discard an editor.
    const productBrowser = context.showProductBrowser, blogBrowser = context.showBlogBrowser;
    context.showProductBrowser = () => {}; context.showBlogBrowser = () => {};
    try { originalTab(tab); } finally { context.showProductBrowser = productBrowser; context.showBlogBrowser = blogBrowser; }
    if (tab === 'products') productEditing ? context.showProductEditor() : productBrowser();
    if (tab === 'blog') blogEditing ? context.showBlogEditor() : blogBrowser();
    const translation = ['translation','product-drafts','blog-drafts','translation-editor'].includes(tab);
    $('translationWorkspaceNav').hidden = !translation;
    document.querySelector('[data-workspace=translation]')?.classList.toggle('is-active', translation);
    if (tab === 'product-order') document.querySelector('.sidebar [data-tab=products]')?.classList.add('is-active');
    if (tab === 'product-order') context.loadOrderDrafts().catch(error => context.setStatus('orderStatus', error.message, true));
    if (tab === 'visuals') context.loadVisuals().catch(error => context.setStatus('visualStatus', error.message, true));
    if (tab === 'translation') { fillTranslationSources(); context.restoreTranslationTask().catch(error => context.setStatus('translationStatus', error.message, true)); }
    if (tab === 'dashboard') refreshWorkspace().catch(() => {});
    setMenu(false);
  };

  const sidebar = $('managerSidebar'), menu = $('managerMenuButton'), shade = $('managerMenuShade'), media = matchMedia('(max-width:980px)');
  function setMenu(open) { sidebar.classList.toggle('is-open', open && media.matches); sidebar.inert = media.matches && !open; shade.hidden = !open || !media.matches; menu.setAttribute('aria-expanded', String(open && media.matches)); document.body.classList.toggle('manager-menu-open', open && media.matches); }
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; setMenu(open); if (open) sidebar.querySelector('button')?.focus(); });
  shade.addEventListener('click', () => { setMenu(false); menu.focus(); }); media.addEventListener('change', () => setMenu(false)); setMenu(false);
  $('managerMenuClose').addEventListener('click',()=>{setMenu(false);menu.focus();});
  document.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') { setMenu(false); menu.focus(); }
    if (event.key === 'Tab') { const nodes = [...sidebar.querySelectorAll('button,a')].filter(node => !node.hidden && !node.disabled && node.getBoundingClientRect().height); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  });
  document.querySelectorAll('[data-workspace],[data-workspace-target]').forEach(button => button.addEventListener('click', () => context.activateTab(button.dataset.workspaceTarget || button.dataset.workspace)));
  let refreshing = null;
  const refreshWorkspace = () => {
    if (refreshing) return refreshing;
    refreshing = context.requestJson('/api/manager/workspace').then(data => {
      $('workspacePending').textContent = Number.isInteger(data.pending) ? String(data.pending) : '—';
      $('workspaceUnpublished').textContent = data.known && Number.isInteger(data.unpublished) ? String(data.unpublished) : '待确认';
      $('workspaceStatus').textContent = data.message || '状态已更新。';
      const reminder = document.querySelector('.publication-guidance'); reminder.hidden = data.known && data.unpublished === 0;
      reminder.classList.toggle('has-changes', data.known && data.unpublished > 0);
      $('publicationGuidanceText').textContent = data.known ? `有 ${data.unpublished} 项已审核变更，完成编辑后请在“网站发布”统一更新。` : '暂时无法确认未发布变更，请更新状态后核对。';
      return data;
    }).catch(error => { $('workspaceStatus').textContent = error.message; $('workspaceUnpublished').textContent = '待确认'; document.querySelector('.publication-guidance').hidden = false; $('publicationGuidanceText').textContent = '暂时无法确认未发布变更，请稍后更新状态。'; }).finally(() => { refreshing = null; });
    return refreshing;
  };
  $('workspaceRefresh').addEventListener('click', () => refreshWorkspace());
  const updateTranslationOverview = () => {
    const task=context.state.translationTask,tasks=context.state.translationTasks||[],active=tasks.filter(item=>item.status!=='completed');
    $('workspaceTranslation').textContent=active.length?`${active.length} 项处理中`:task?task.status==='idle'?'暂无任务':'已完成，待核对':'待确认';
    $('translationTaskList').innerHTML=tasks.slice(0,10).map((item,index)=>`<button class="button secondary" type="button" data-translation-task="${context.escapeHtml(item.requestId)}">翻译任务 ${index+1} · ${context.escapeHtml(item.locales||'')} · ${item.status==='completed'?'已完成':'处理中'}</button>`).join('');
  };
  $('translationTaskList').addEventListener('click',event=>{const button=event.target.closest('[data-translation-task]');if(button){context.state.translationRequestId=button.dataset.translationTask;context.pollTranslationStatus().catch(error=>context.setStatus('translationStatus',error.message,true));}});

  function updateEditorContext(kind) {
    if (kind === 'product') { $('viewProductButton').href = context.publicContentUrl('product', context.state.products.find(item => item.slug === context.state.activeSlug)); if ($('productSlug').readOnly) $('productSlug').closest('.field').hidden = true; }
    if (kind === 'blog' && $('blogSlug').readOnly) $('blogSlug').closest('.field').hidden = true;
    document.querySelectorAll('.editor-readonly-summary').forEach(node => { const group = node.dataset.editorKind; if (group === 'product') node.textContent = `${$('productSlug').value || '新产品'} · ${$('offeringType').selectedOptions[0]?.textContent.replace(/（.*?）/g, '') || ''} · ${$('modelStrategy').selectedOptions[0]?.textContent || ''}`; if (group === 'blog') node.textContent = $('blogSlug').value || '新文章'; });
  }
  function organizeForm(kind, groups) {
    const form = $(forms[kind]); if (!form) return;
    const summary = document.createElement('p'); summary.className = 'editor-readonly-summary'; summary.dataset.editorKind = kind; form.before(summary);
    const nav = document.createElement('nav'); nav.className = 'editor-section-nav'; nav.setAttribute('aria-label', '编辑分区'); form.before(nav);
    groups.forEach(([title, ids], index) => {
      const fields = ids.map(id => $(id)?.closest('.field')).filter(Boolean); if (!fields.length) return;
      const section = document.createElement('details'); section.className = 'editor-group'; section.id = `${kind}-group-${index}`; section.open = index < 2;
      const label = document.createElement('summary'); label.textContent = title; const body = document.createElement('div'); body.className = 'form'; section.append(label, body);
      for (const field of [...new Set(fields)]) body.append(field); form.append(section);
      const button = document.createElement('button'); button.className = 'button secondary'; button.type = 'button'; button.textContent = title; button.onclick = () => { section.open = true; section.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; nav.append(button);
    });
    form.nextElementSibling?.classList.add('editor-save-bar');
  }
  organizeForm('product', [['基本信息',['title','category','series','description','published','featured']],['产品图片',['galleryList','detailImageList']],['详细内容',['productContent','applicationsList','highlightsList']],['参数与表格',['specsList','specTablesList']],['常见问题与评价',['faqsList','productReviewList']]]);
  organizeForm('blog', [['基本信息',['blogTitle','blogCategory','blogPublishDate','blogAuthor','blogFeatured','blogDescription']],['封面与正文',['blogImage','blogBody']]]);
  for (const id of ['productSlug','offeringType','modelStrategy','sortOrder','image','blogSlug']) { const field = $(id)?.closest('.field'); if (field) field.hidden = true; }
  // New-record identifiers remain editable: only read-only values move into summary.
  for (const [name, id] of [['startNewProduct','productSlug'],['startNewBlog','blogSlug']]) { const original = context[name]; context[name] = async (...args) => { await original(...args); if (!$(id).readOnly) $(id).closest('.field').hidden = false; }; }
  for (const [id, label] of [['saveBlogDraftButton','保存草稿'],['viewBlogButton','查看网站'],['reloadButton','更新草稿列表'],['reloadBlogDraftButton','更新草稿列表'],['productDraftRefreshButton','更新列表'],['blogDraftRefreshButton','更新列表']]) if ($(id)) $(id).textContent = label;
  const preview = async kind => { const id = kind === 'product' ? context.state.activeDraftId : context.state.activeBlogDraftId, records = kind === 'product' ? context.state.drafts : context.state.blogDrafts, row = records.find(item => item.id === id), status = kind === 'product' ? 'statusText' : 'blogStatus'; if (!row || editorIsDirty(kind)) return context.setStatus(status, '请先保存当前修改，再预览草稿。', true); return context.openAuthenticatedPreview(`/api/manager/content-preview?kind=${kind}&id=${encodeURIComponent(id)}&version=${encodeURIComponent(row.updatedAt)}`, status); };
  $('previewProductDraft').addEventListener('click', () => preview('product'));
  const blogPreview = document.createElement('button'); blogPreview.type = 'button'; blogPreview.className = 'button secondary'; blogPreview.textContent = '预览草稿'; blogPreview.id = 'previewBlogDraft'; $('saveBlogDraftButton').before(blogPreview); blogPreview.addEventListener('click', () => preview('blog'));

  async function fillTranslationSources() {
    if (!context.state.blogPosts.length) await context.loadBlogPosts().catch(() => {});
    const select = $('translationSourcePicker'), previous = select.value, type = $('translationSourceType').value;
    const sources = [...(type !== 'blog' ? context.state.products.map(item => ({ ...item, type: 'products' })) : []), ...(type !== 'products' ? context.state.blogPosts.map(item => ({ ...item, type: 'blog' })) : [])].filter(item => item.published !== false);
    select.innerHTML = '<option value="">请选择要翻译的原文</option>' + sources.map(item => `<option value="${context.escapeHtml(item.type + ':' + item.slug)}">${item.type === 'products' ? '产品' : '文章'} · ${context.escapeHtml(item.title)}</option>`).join('') + '<option value="*">当前范围全部原文（提交前核对）</option>';
    if(context.state.translationSelection?.length)select.insertAdjacentHTML('beforeend',`<option value="@selected">列表中选中的 ${context.state.translationSelection.length} 篇原文</option>`);
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }
  $('translationSourceType').addEventListener('change', () => { $('translationSlug').value = ''; fillTranslationSources(); });
  $('translationSourcePicker').addEventListener('change', event => { const value = event.target.value; $('translationSlug').value = value.includes(':') ? value.slice(value.indexOf(':') + 1) : ''; });
  const beginTranslation = async(kind,rows)=>{if(!rows.length||rows.length>5||rows.some(row=>(row.locale||'en')!=='en'))throw new Error('请在英语列表选择 1 到 5 篇原文。');context.state.translationSelection=rows.map(row=>({slug:row.slug,title:row.title,sourceType:kind==='product'?'products':'blog'}));$('translationSourceType').value=kind==='product'?'products':'blog';context.activateTab('translation');await fillTranslationSources();$('translationSourcePicker').value=rows.length===1?`${kind==='product'?'products':'blog'}:${rows[0].slug}`:'@selected';$('translationSlug').value=rows.length===1?rows[0].slug:'';};
  const submitTranslation = context.submitTranslation;let translating=false;
  context.submitTranslation = async () => {
    if(translating)return;
    if(!context.selectedLocales().length)throw new Error('请至少选择一个目标语言。');
    const source = $('translationSourcePicker').value; if (!source) throw new Error('请先选择要翻译的原文。');
    if (source.includes(':')) $('translationSourceType').value = source.split(':')[0];
    const selected = context.selectedLocales(); if (!selected.length) throw new Error('请至少选择一个目标语言。');
    if (context.state.translationChecking || context.state.translationRequestId && !context.state.translationDone) throw new Error('当前翻译仍在处理，请先等待任务完成。');
    const rows=source==='@selected'?context.state.translationSelection:[];
    if (!await confirmDialog(`原文：${rows.length?rows.map(item=>item.title).join('、'):$('translationSourcePicker').selectedOptions[0].textContent}\n目标语言：${selected.join('、')}\n${$('translationOverwrite').checked ? '将重新生成已有草稿，请确认范围。' : '保留已有草稿。'}生成结果需要审核，不会自动发布网站。`, { title: '核对翻译范围', confirmLabel: '提交翻译任务' })) return;
    translating=true;$('translationSubmitButton').disabled=true;
    try{if(!rows.length)return await submitTranslation();
      const failed=[];let accepted=0;
      for(const row of rows){try{await context.requestJson('/api/manager/ai/translations',{method:'POST',body:JSON.stringify({sourceType:row.sourceType,sourceSlug:row.slug,locales:selected,overwrite:$('translationOverwrite').checked,apiKeyOffset:Date.now()})});accepted++;}catch(error){failed.push(row);}context.setStatus('translationStatus',`已提交 ${accepted} 篇，尚有 ${rows.length-accepted-failed.length} 篇待提交。`);}
      context.state.translationSelection=failed;context.state.translationRestored=false;await context.restoreTranslationTask();await fillTranslationSources();context.setStatus('translationStatus',`已提交 ${accepted} 篇原文。${failed.length?`${failed.length} 篇未提交，请等待当前任务结束后只重试未提交的原文。`:'状态会自动更新，完成后请审核草稿。'}`);
    }finally{translating=false;$('translationSubmitButton').disabled=false;}
  };
  Object.assign(context, { refreshWorkspace, updateTranslationOverview, fillTranslationSources, beginTranslation });
}
