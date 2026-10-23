export function installReviews(context) {
  const reviewPayloadFromForm = (operation = 'upsert') => ({
    ...context.state.activeReviewData,
    operation,
    id: context.$('reviewId').value.trim().toLowerCase(),
    published: context.$('reviewPublished').checked,
    rating: context.$('reviewRating').value,
    quote: context.$('reviewQuote').value.trim(),
    buyerLabel: context.$('reviewBuyerLabel').value.trim(),
    date: context.$('reviewDate').value,
  });

  const fillReviewForm = review => {
    const item = review || {};
    const { draftId, ...previous } = item;
    context.state.activeReviewData = previous;
    context.state.activeReviewDraftId = item.draftId || '';
    context.$('reviewId').value = item.id || `review-${crypto.randomUUID()}`;
    context.$('reviewBuyerLabel').value = item.buyerLabel || '';
    context.$('reviewRating').value = item.rating === undefined ? '5' : String(item.rating);
    context.$('reviewQuote').value = item.quote || '';
    context.$('reviewDate').value = item.date || '';
    context.$('reviewPublished').checked = item.published !== false;
    context.setStatus('reviewStatus', item.id ? `正在编辑：${item.buyerLabel || '评价'}` : '正在新建评价草稿。');
  };

  const renderReviews = () => {
    context.$('reviewList').innerHTML = context.state.reviews.length
      ? context.state.reviews.map(review => `
          <button class="blog-row" data-review-id="${context.escapeHtml(review.id)}" type="button">
            <span><strong>${context.escapeHtml(review.buyerLabel || review.id)}</strong><small>${context.escapeHtml(review.projectType || review.source || '')}</small></span>
            <span class="status">${review.published === false ? '隐藏' : `${review.rating} 星`}</span>
          </button>`).join('')
      : '<div class="draft"><span><strong>暂无正式评价</strong><small>可以新建评价草稿。</small></span></div>';
    context.$('reviewListStatus').textContent = `共 ${context.state.reviews.length} 条正式评价`;
    context.$('reviewDraftList').innerHTML = context.state.reviewDrafts.filter(draft=>context.workDraftVisible('review',draft)).length
      ? context.state.reviewDrafts.filter(draft=>context.workDraftVisible('review',draft)).map(draft => `
          <div class="draft work-draft-record">${context.workDraftCheckbox('review',draft)}
            <span><strong>${context.escapeHtml(draft.buyerLabel || draft.reviewId)}</strong><small>${context.escapeHtml(context.workDraftStatus(draft.status))} · ${context.formatDate(draft.updatedAt)}</small></span>
<span class="record-actions">            <button class="button secondary" ${context.workDraftBusy(draft.status) ? 'disabled' : ''} data-review-draft-edit="${context.escapeHtml(draft.id)}" type="button">编辑</button>
            <button class="button secondary" ${context.workDraftBusy(draft.status) || draft.status === 'applied' ? 'disabled' : ''} data-review-draft-apply="${context.escapeHtml(draft.id)}" type="button">审核通过</button>
            ${context.workDraftActions('review',draft)}</span>
          </div>`).join('')
      : '<div class="draft"><span><strong>暂无评价草稿</strong><small>保存后会显示在这里。</small></span></div>';
    context.syncWorkDraftControls('review');
  };

  const loadReviews = async () => {
    const data = await context.requestJson('/api/manager/review-drafts');
    context.state.reviews = data.reviews || [];
    context.state.reviewDrafts = data.drafts || [];
    context.$('reviewSystemStatus').textContent = `评价展示：${data.settings?.enabled ? '已启用' : '已关闭'}；店铺评价 ${context.state.reviews.length} 条。`;
    renderReviews();
  };

  const saveReviewDraft = async (operation = 'upsert') => {
    const payload = reviewPayloadFromForm(operation);
    context.setStatus('reviewStatus', operation === 'delete' ? '正在生成删除草稿...' : '正在保存评价草稿...');
    const data = await context.requestJson('/api/manager/review-drafts', {
      method: 'POST',
      body: JSON.stringify({ id: context.state.activeReviewDraftId, updatedAt: context.state.reviewDrafts.find(item=>item.id===context.state.activeReviewDraftId)?.updatedAt, payload }),
    });
    context.state.activeReviewDraftId = data.draft?.id || '';
    await loadReviews();
    context.setStatus('reviewStatus', operation === 'delete' ? '删除草稿已保存，尚未删除正式数据。' : '评价草稿已保存。');
    return data;
  };

  const applyReviewDraft = async id => {
    context.setStatus('reviewStatus', '正在提交评价内容更新...');
    const data = await context.requestJson(`/api/manager/review-drafts/${encodeURIComponent(id)}/apply`, { method: 'POST' });
    await loadReviews();
    context.setStatus('reviewStatus', data.requestId ? '评价审核已提交，网站更新进度请查看发布记录。' : '评价更新已提交。');
  };
  Object.assign(context, { reviewPayloadFromForm, fillReviewForm, renderReviews, loadReviews, saveReviewDraft, applyReviewDraft });
}
