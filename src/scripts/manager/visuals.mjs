import { confirmDialog } from '../../lib/admin-dialog.mjs';
export function installVisuals(context) {
  let loaded = false, busy = false, model = { slots: [], drafts: [], locales: [] }, activeDraft = null;
  const esc = context.escapeHtml;
  const visualPayload = () => ({ slots: model.slots.map(({ key, image, mobileImage, alt, localizedAlts, focusX, focusY }) => ({ key, image, mobileImage, alt, localizedAlts, focusX, focusY })), ...(model.slots.some(slot => slot.key === 'home.primary') ? {primaryCta:model.primaryCta || {href:'',labels:[]}} : {}) });
  const status = (message, error = false) => context.setStatus('visualStatus', message, error);
  const renderVisualDrafts = () => {
    const rows=model.drafts.filter(row=>!row.live||context.$('visualShowHistory').checked);
    context.$('visualDrafts').innerHTML=rows.map(row=>{
      const label=row.live?'已上线':row.status==='applied'?(row.releaseKnown===false?'已审核，发布状态待确认':'已审核，等待网站发布'):row.status==='queued'?'正在核对处理结果':'待审核';
      const edit=row.status==='draft'?`<button class="button secondary" data-visual-edit="${esc(row.id)}" type="button">继续编辑</button><button class="button secondary" data-visual-approve="${esc(row.id)}" type="button">审核通过</button>`:'';
      return `<article class="draft"><span><strong>站点图片草稿</strong><small>${context.formatDate(row.updatedAt)} · ${label}</small></span><span class="record-actions">${edit}<button class="button danger" data-visual-delete="${esc(row.id)}" ${row.status==='queued'?'disabled':''} type="button">移除记录</button></span></article>`;
    }).join('')||'<p class="field-help">暂无待处理的站点图片草稿。</p>';
  };
  const renderVisuals = () => {
    const group = context.$('visualGroup').value;
    context.$('visualForm').innerHTML = model.slots.filter(slot => slot.group === group).map((slot, index) => `<details class="visual-slot" data-visual-slot="${esc(slot.key)}" ${index === 0 ? 'open' : ''}><summary>${esc(slot.title)}<span class="content-state">${slot.image ? '使用自定义图片' : '使用本站默认图片'}</span></summary><div class="visual-slot-body"><div class="visual-crop"><img src="${esc(context.normalizeThumbnailUrl(slot.image || slot.fallback))}" alt="" style="object-position:${slot.focusX}% ${slot.focusY}%" loading="lazy"></div><div class="visual-tools"><button class="button secondary" data-visual-pick="image" type="button">更换图片</button><button class="button secondary" data-visual-mobile-preview type="button">查看手机裁切</button><button class="button secondary" data-visual-reset type="button">恢复默认图片</button><a class="button secondary" href="${esc(new URL(slot.path, context.publicSiteOrigin).href)}" target="_blank" rel="noreferrer">查看网站</a></div><p class="field-help">${slot.group === 'home' ? '桌面图建议宽约 2200px。' : '使用横向图片，并检查手机裁切。'}背景为装饰图，保留页面已有文字。</p><div class="form"><div class="field"><label>手机图片（选填）</label><button class="button secondary" data-visual-pick="mobileImage" type="button">${slot.mobileImage ? '更换手机图' : '选择手机图'}</button><button class="button secondary" data-visual-mobile-clear type="button">跟随桌面图片</button></div><div class="field"><label>水平裁切焦点<input type="range" min="0" max="100" data-visual-field="focusX" value="${slot.focusX}"></label><label>垂直裁切焦点<input type="range" min="0" max="100" data-visual-field="focusY" value="${slot.focusY}"></label></div><div class="field"><label>英文图片说明<input data-visual-field="alt" value="${esc(slot.alt)}" maxlength="500" placeholder="装饰背景可留空"></label></div>${model.locales.filter(code => code !== 'en').map(code => `<div class="field"><label>${esc(code)} 图片说明<input data-visual-locale="${esc(code)}" maxlength="500" value="${esc(slot.localizedAlts.find(item => item.locale === code)?.text || '')}" placeholder="装饰背景可留空"></label></div>`).join('')}</div></div></details>`).join('') || '<p class="notice">' + (loaded ? '暂无可编辑的图片位置。' : '正在载入图片位置…') + '</p>';
    if(group==='home'&&model.slots.some(slot=>slot.key==='home.primary')){const cta=model.primaryCta||{href:'',labels:[]};context.$('visualForm').insertAdjacentHTML('beforeend',`<details class="visual-slot"><summary>首屏主要按钮（选填）</summary><div class="visual-slot-body form"><label>跳转到公开页面<input data-visual-cta="href" value="${esc(cta.href)}" placeholder="空白保留原按钮，例如 /products/"></label>${model.locales.map(locale=>`<label>${esc(locale)} 按钮文字<input data-visual-cta="${esc(locale)}" maxlength="500" value="${esc(cta.labels.find(item=>item.locale===locale)?.text||'')}"></label>`).join('')}<p class="field-help">只更改首页主要按钮；未填写对应语言时保留该语言的原按钮。</p></div></details>`);}
    context.$('visualSave').disabled=!model.slots.length;
  };
  const loadVisuals = async (force = false) => {
    if (loaded && !force) return;
    if (force && !await context.allowDiscard?.('visual')) return;
    const data = await context.requestJson('/api/manager/site-visuals'); model = data; model.primaryCta ||= {href:'',labels:[]}; loaded = true; activeDraft = null;
    renderVisuals(); renderVisualDrafts(); context.markEditorClean?.('visual'); status(model.slots.length ? '图片已载入，未修改的图片保持本站当前设置。' : '暂无可编辑的图片位置。');
  };
  const run = async action => { if (busy) return; busy = true; context.$('visualSave').disabled = true; try { return await action(); } finally { busy = false; context.$('visualSave').disabled = false; } };
  const saveVisuals = () => run(async () => {
    status('正在保存图片草稿…');
    const data = await context.requestJson('/api/manager/site-visuals', { method: 'POST', body: JSON.stringify({ id: activeDraft?.id, updatedAt: activeDraft?.updatedAt, baseSha: model.baseSha, payload: visualPayload() }) });
    activeDraft = data.draft; model.drafts = [activeDraft, ...model.drafts.filter(row => row.id !== activeDraft.id)]; renderVisualDrafts(); context.markEditorClean?.('visual'); status('草稿已保存，审核通过后再发布网站更新。'); return data;
  });
  context.$('visualGroup').addEventListener('change', renderVisuals);
  context.$('visualShowHistory').addEventListener('change',renderVisualDrafts);
  context.$('visualRefresh').addEventListener('click', () => loadVisuals(true).catch(error => status(error.message, true)));
  context.$('visualSave').addEventListener('click', () => saveVisuals().catch(error => status(error.message, true)));
  context.$('visualForm').addEventListener('input', event => {
    if (event.target.dataset.visualCta) { if(event.target.dataset.visualCta==='href')model.primaryCta.href=event.target.value;else{const locale=event.target.dataset.visualCta;model.primaryCta.labels=model.primaryCta.labels.filter(item=>item.locale!==locale);model.primaryCta.labels.push({locale,text:event.target.value});}status('有未保存的修改。');return; }
    const element = event.target, slot = model.slots.find(slot => slot.key === element.closest('[data-visual-slot]')?.dataset.visualSlot); if (!slot) return;
    if (element.dataset.visualField) slot[element.dataset.visualField] = element.type === 'range' ? Number(element.value) : element.value;
    if (element.dataset.visualLocale) { slot.localizedAlts = slot.localizedAlts.filter(item => item.locale !== element.dataset.visualLocale); slot.localizedAlts.push({ locale: element.dataset.visualLocale, text: element.value }); }
    const image = element.closest('[data-visual-slot]').querySelector('.visual-crop img'); image.style.objectPosition = `${slot.focusX}% ${slot.focusY}%`; status('有未保存的修改。');
  });
  context.$('visualForm').addEventListener('click', event => {
    const element = event.target.closest('button'), card = element?.closest('[data-visual-slot]'), slot = model.slots.find(slot => slot.key === card?.dataset.visualSlot); if (!slot) return;
    if (element.hasAttribute('data-visual-reset')) { slot.image = ''; slot.mobileImage = ''; slot.focusX = slot.focusY = 50; renderVisuals(); status('已恢复默认图片，请保存草稿。'); }
    if (element.hasAttribute('data-visual-mobile-clear')) { slot.mobileImage = ''; renderVisuals(); status('手机图片将跟随桌面图片，请保存草稿。'); }
    if (element.hasAttribute('data-visual-mobile-preview')) { const stage=card.querySelector('.visual-crop'),mobile=stage.classList.toggle('is-mobile');stage.querySelector('img').src=context.normalizeThumbnailUrl(mobile?(slot.mobileImage||slot.image||slot.fallback):(slot.image||slot.fallback));element.textContent=mobile?'查看桌面裁切':'查看手机裁切'; }
    if (element.dataset.visualPick) context.openImagePicker({ title: `选择${slot.title}图片`, onSelect: url => { slot[element.dataset.visualPick] = url; renderVisuals(); status('图片已选择，请保存草稿。'); } }).catch(error => status(error.message, true));
  });
  context.$('visualDrafts').addEventListener('click', event => {
    const remove=event.target.closest('[data-visual-delete]');if(remove){run(async()=>{const draft=model.drafts.find(row=>row.id===remove.dataset.visualDelete);if(!draft||draft.status==='queued')return;if(!await confirmDialog('只移除这条工作记录，已审核的站点图片和网站保持。当前记录有未保存修改时，也会放弃这些修改。',{title:'移除站点图片草稿记录',confirmLabel:'移除记录',danger:true}))return;await context.requestJson('/api/manager/site-visuals',{method:'DELETE',body:JSON.stringify({id:draft.id,updatedAt:draft.updatedAt,confirmed:true})});model.drafts=model.drafts.filter(row=>row.id!==draft.id);if(activeDraft?.id===draft.id){activeDraft=null;context.markEditorClean?.('visual');}renderVisualDrafts();status('工作记录已移除，正式图片保持。');}).catch(error=>status(error.message,true));return;}
    const edit = event.target.closest('[data-visual-edit]'), approve = event.target.closest('[data-visual-approve]');
    if (edit) (async () => { if (!await context.allowDiscard?.('visual')) return; const draft = model.drafts.find(row => row.id === edit.dataset.visualEdit);if(draft.status!=='draft'||draft.baseSha!==model.baseSha)return status('正式图片已更新，请从当前图片建立新的草稿。',true);activeDraft=draft; for (const entry of activeDraft.payload.slots) { const slot = model.slots.find(slot => slot.key === entry.key); if (slot) Object.assign(slot, entry); }if(activeDraft.payload.primaryCta)model.primaryCta=structuredClone(activeDraft.payload.primaryCta); renderVisuals(); context.markEditorClean?.('visual'); status('继续编辑已保存的图片草稿。'); })().catch(error => status(error.message, true));
    if (approve) run(async () => { const draft = model.drafts.find(row => row.id === approve.dataset.visualApprove); await context.requestJson('/api/manager/site-visuals', { method: 'PATCH', body: JSON.stringify({ id: draft.id, updatedAt: draft.updatedAt }) }); loaded = false; await loadVisuals(); context.refreshWorkspace?.(); status('审核通过，请到“网站发布”统一更新。'); }).catch(error => status(error.message, true));
  });
  context.$('visualPreview').addEventListener('click', () => {
    if (!activeDraft || context.editorIsDirty?.('visual')) return status('请先保存当前修改，再预览草稿。', true);
    context.openAuthenticatedPreview(`/api/manager/content-preview?kind=visual&id=${encodeURIComponent(activeDraft.id)}&version=${encodeURIComponent(activeDraft.updatedAt)}`, 'visualStatus');
  });
  Object.assign(context, { loadVisuals, visualPayload, saveVisuals });
}
