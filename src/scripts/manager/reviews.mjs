import { confirmDialog } from '../../lib/admin-dialog.mjs';
export function installReviews(context) {
  const $ = context.$;
  let busy = false;
  const lockReviewWorkspace = active => {
    busy = active;
    document.querySelector('.review-workspace-grid').inert = active;
    $('reviewDraftWorkspace').inert = active;
  };
  const reviewPayloadFromForm = (operation = 'upsert') => ({
    ...context.state.activeReviewData, operation, id: $('reviewId').value.trim().toLowerCase(),
    published: $('reviewPublished').checked, rating: $('reviewRating').value,
    quote: $('reviewQuote').value.trim(), buyerLabel: $('reviewBuyerLabel').value.trim(), date: $('reviewDate').value,
  });
  const syncReviewPreview = () => {
    if (!$('reviewPreviewBuyer')) return;
    $('reviewPreviewBuyer').textContent = $('reviewBuyerLabel').value.trim() || '评价人';
    const rating = Math.max(1, Math.min(5, Number($('reviewRating').value) || 5));
    $('reviewPreviewRating').textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    $('reviewPreviewRating').setAttribute('aria-label', `${rating} 星`);
    $('reviewPreviewQuote').textContent = $('reviewQuote').value.trim() || '评价内容将显示在这里。';
    $('reviewPreviewDate').textContent = $('reviewDate').value;
  };
  const renderReviewList = () => {
    const query = $('reviewSearch').value.trim().toLowerCase(), visibility = $('reviewVisibilityFilter').value;
    const rows = context.state.reviews.filter(row => (!query || `${row.buyerLabel || ''} ${row.quote || ''}`.toLowerCase().includes(query)) && (!visibility || (visibility === 'hidden' ? row.published === false : row.published !== false)));
    $('reviewList').innerHTML = rows.map(review => {
      const active = review.id === $('reviewId').value;
      return `<button class="review-list-card ${active ? 'is-active' : ''}" data-review-id="${context.escapeHtml(review.id)}" aria-pressed="${active}" type="button"><span class="review-card-top"><strong>${context.escapeHtml(review.buyerLabel || '客户评价')}</strong><span>${context.escapeHtml(review.rating || '—')} 星</span></span><span class="review-card-quote">${context.escapeHtml(review.quote || '')}</span><span class="review-card-bottom"><small>${review.published === false ? '设为隐藏' : '设为显示'}${review.date ? ` · ${context.escapeHtml(review.date)}` : ''}</small><span>编辑 →</span></span></button>`;
    }).join('') || `<div class="review-list-empty"><strong>${query || visibility ? '没有匹配的评价' : '暂无客户评价'}</strong><p>${query || visibility ? '换一个关键词或显示状态试试。' : '点击“新增评价”开始填写。'}</p></div>`;
    $('reviewListStatus').textContent = `当前 ${rows.length} 条 / 共 ${context.state.reviews.length} 条`;
  };
  const fillReviewForm = review => {
    const item = review || {}, { draftId, ...previous } = item;
    context.state.activeReviewData = previous; context.state.activeReviewDraftId = draftId || '';
    $('reviewId').value = item.id || `review-${crypto.randomUUID()}`;
    $('reviewBuyerLabel').value = item.buyerLabel || ''; $('reviewRating').value = item.rating === undefined ? '5' : String(item.rating);
    $('reviewQuote').value = item.quote || ''; $('reviewDate').value = item.date || ''; $('reviewPublished').checked = item.published !== false;
    $('reviewEditorTitle').textContent = draftId ? '继续编辑评价草稿' : item.id ? '编辑客户评价' : '新增客户评价';
    $('reviewEditorEmpty').hidden = true; $('reviewEditorView').hidden = false;
    document.querySelector('[data-panel=reviews]').classList.add('review-is-editing');
    $('deleteReviewDraftButton').disabled = !context.state.reviews.some(row => row.id === item.id);
    syncReviewPreview(); renderReviewList();
    context.setStatus('reviewStatus', draftId ? '正在编辑已保存的草稿。' : item.id ? `正在编辑：${item.buyerLabel || '客户评价'}` : '填写后保存草稿，再到草稿列表审核。');
  };
  const showReviewList = async () => {
    if (busy || !await context.allowDiscard?.('review')) return;
    $('reviewEditorView').hidden = true; $('reviewEditorEmpty').hidden = false; $('reviewId').value = '';
    context.state.activeReviewDraftId = ''; context.state.activeReviewData = {};
    document.querySelector('[data-panel=reviews]').classList.remove('review-is-editing');
    context.markEditorClean?.('review'); renderReviewList(); context.setStatus('reviewStatus', '');
  };
  const renderReviews = () => {
    renderReviewList();
    const visible = context.state.reviewDrafts.filter(draft => context.workDraftVisible('review', draft));
    $('reviewDraftCount').textContent = String(context.state.reviewDrafts.filter(row => row.status !== 'applied').length);
    $('reviewDraftList').innerHTML = visible.map(draft => {
      const deleting = draft.payload?.operation === 'delete';
      return `<div class="draft work-draft-record">${context.workDraftCheckbox('review', draft)}<span><strong>${context.escapeHtml(draft.buyerLabel || '客户评价')}</strong><small>${deleting ? '删除评价' : '评价修改'} · ${context.escapeHtml(context.workDraftStatus(draft.status))} · ${context.formatDate(draft.updatedAt)}</small></span><span class="record-actions">${deleting ? '' : `<button class="button secondary" ${context.workDraftBusy(draft.status) ? 'disabled' : ''} data-review-draft-edit="${context.escapeHtml(draft.id)}" type="button">继续编辑</button>`}<button class="button secondary" ${context.workDraftBusy(draft.status) || draft.status === 'applied' ? 'disabled' : ''} data-review-draft-apply="${context.escapeHtml(draft.id)}" type="button">审核通过</button>${context.workDraftActions('review', draft)}</span></div>`;
    }).join('') || '<div class="review-list-empty"><strong>暂无待处理草稿</strong><p>保存后的评价修改会出现在这里。</p></div>';
    context.syncWorkDraftControls('review');
  };
  const loadReviews = async () => {
    const data = await context.requestJson('/api/manager/review-drafts');
    context.state.reviews = data.reviews || []; context.state.reviewDrafts = data.drafts || [];
    $('reviewSystemStatus').textContent = '管理客户反馈，修改后保存草稿并审核。'; renderReviews();
  };
  const saveReviewDraft = async (operation = 'upsert') => {
    if (busy) return;
    const payload = reviewPayloadFromForm(operation);
    if(operation==='upsert'&&(!payload.buyerLabel||!payload.quote)){context.setStatus('reviewStatus','请填写评价人和评价原文。',true);$(payload.buyerLabel?'reviewQuote':'reviewBuyerLabel').focus();return;}
    if (operation === 'delete' && !context.state.reviews.some(row => row.id === payload.id)) return context.setStatus('reviewStatus', '这条评价尚未进入正式内容，可在草稿列表移除记录。', true);
    busy = true;
    try {
      if (operation === 'delete' && !await confirmDialog(`将为“${context.state.activeReviewData.buyerLabel || payload.buyerLabel}”保存删除草稿，审核通过后才会移除正式评价。当前未保存的修改不会另行保留。`, { title: '删除这条评价？', confirmLabel: '保存删除草稿', danger: true })) return;
      lockReviewWorkspace(true);
      $('reviewForm').inert = true; $('saveReviewDraftButton').disabled = true; $('deleteReviewDraftButton').disabled = true;
      context.setStatus('reviewStatus', operation === 'delete' ? '正在保存删除草稿…' : '正在保存评价草稿…');
      const data = await context.requestJson('/api/manager/review-drafts', { method: 'POST', body: JSON.stringify({ id: context.state.activeReviewDraftId, updatedAt: context.state.reviewDrafts.find(item => item.id === context.state.activeReviewDraftId)?.updatedAt, payload }) });
      context.state.activeReviewDraftId = data.draft?.id || ''; context.state.activeReviewData = { ...payload };
      await loadReviews();
      if (operation === 'delete') { $('reviewEditorView').hidden = true; $('reviewEditorEmpty').hidden = false; document.querySelector('[data-panel=reviews]').classList.remove('review-is-editing'); $('reviewDraftWorkspace').scrollIntoView({ block: 'start' }); }
      context.setStatus('reviewStatus', operation === 'delete' ? '删除草稿已保存，尚未删除正式数据。' : '评价草稿已保存，请在评价草稿列表审核。');
      return data;
    } finally {
      lockReviewWorkspace(false); $('reviewForm').inert = false; $('saveReviewDraftButton').disabled = false;
      $('deleteReviewDraftButton').disabled = !context.state.reviews.some(row => row.id === $('reviewId').value);
    }
  };
  const applyReviewDraft = async id => {
    if (busy) return;
    lockReviewWorkspace(true);
    try {
    context.setStatus('reviewStatus', '正在提交评价内容更新…');
    const data = await context.requestJson(`/api/manager/review-drafts/${encodeURIComponent(id)}/apply`, { method: 'POST' });
    await loadReviews(); context.refreshWorkspace?.();
    context.setStatus('reviewStatus', data.requestId ? '评价审核已提交，网站更新进度请查看发布记录。' : '评价更新已提交。');
    } finally { lockReviewWorkspace(false); }
  };
  if ($('reviewForm')) {
    $('reviewForm').addEventListener('input', syncReviewPreview);
    $('reviewSearch').addEventListener('input', renderReviewList); $('reviewVisibilityFilter').addEventListener('change', renderReviewList);
    $('reviewBackButton').addEventListener('click', () => showReviewList().catch(error => context.setStatus('reviewStatus', error.message, true)));
    $('reviewDraftsButton').addEventListener('click', () => $('reviewDraftWorkspace').scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  Object.assign(context, { reviewPayloadFromForm, fillReviewForm, renderReviews, loadReviews, saveReviewDraft, applyReviewDraft });
}
