import { confirmDialog } from '../../lib/admin-dialog.mjs';
export function installPublishing(context) {
  const renderPublishHistory = records => {
    context.$('publishHistory').innerHTML = records.length
      ? records
          .map(
            record => `
              <div class="record">
                <label>
                  <input type="checkbox" data-publish-record="${context.escapeHtml(record.id)}" />
                  <span>
                    <strong>${context.escapeHtml(record.label)} · 第 ${context.escapeHtml(record.runNumber || record.id)} 次发布</strong>
                    <small>${context.escapeHtml(record.message || '')}</small>
                    <small>提交：${context.formatDate(record.submittedAt)} · 更新：${context.formatDate(record.updatedAt)}</small>
                  </span>
                </label>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无发布记录</strong><small>点击发布网站更新后会显示最近记录。</small></span></div>';
  };

  const loadPublishHistory = async () => {
    context.setStatus('publishStatus', '正在读取最近发布记录...');
    const data = await context.requestJson('/api/manager/deploy/site');
    context.state.publishRecords = data.records || [];
    renderPublishHistory(context.state.publishRecords);
    context.setStatus('publishStatus', `已读取最近 ${context.state.publishRecords.length} 条记录。`);
  };

  const pollPublishStatus = async () => {
    if (!context.state.publishRequestId) {
      context.setStatus('publishStatus', '还没有提交发布。', true);
      return;
    }
    const data = await context.requestJson(`/api/manager/deploy/site?requestId=${encodeURIComponent(context.state.publishRequestId)}`);
    context.setStatus('publishStatus', data.message || data.label || data.status, data.stage === 'failed');
    if (data.stage === 'success' || data.stage === 'failed') {
      clearInterval(context.state.publishTimer);
      context.state.publishTimer = null;
      await loadPublishHistory();
      if (data.stage === 'success') {
        await Promise.allSettled(['product','blog'].map(type => context.loadTranslationDrafts(type)));
        await Promise.allSettled([context.loadProducts(),context.loadBlogPosts()]);
        window.dispatchEvent(new CustomEvent('businessweb:published'));
      }
    }
  };

  const submitPublish = async () => {
    if (!await confirmDialog('确认发布网站更新？请确保产品、文章和翻译草稿已经检查完成。')) return;
    context.setStatus('publishStatus', '正在提交发布任务...');
    const data = await context.requestJson('/api/manager/deploy/site', { method: 'POST', body: JSON.stringify({}) });
    context.state.publishRequestId = data.requestId;
    context.setStatus('publishStatus', data.message || '发布任务已提交。');
    clearInterval(context.state.publishTimer);
    context.state.publishTimer = setInterval(() => pollPublishStatus().catch(error => context.setStatus('publishStatus', error.message, true)), 8000);
    await pollPublishStatus();
  };

  const deletePublishRecords = async () => {
    const runIds = [...document.querySelectorAll('[data-publish-record]:checked')].map(input => Number(input.dataset.publishRecord));
    if (!runIds.length) {
      context.setStatus('publishStatus', '请先勾选需要删除的发布记录。', true);
      return;
    }
    if (!await confirmDialog(`确认删除 ${runIds.length} 条发布记录？`)) return;
    const result=await context.requestJson('/api/manager/deploy/site', { method: 'DELETE', body: JSON.stringify({ runIds }) });
    await loadPublishHistory();
    context.setStatus('publishStatus', `已清理 ${result.deleted?.length || 0} 条记录。${result.skipped?.length ? '最近成功发布及正在进行的任务会保留。' : ''}${result.errors?.length ? '部分记录未能清理，请稍后重试。' : ''}`,Boolean(result.errors?.length));
  };
  Object.assign(context, { renderPublishHistory, loadPublishHistory, pollPublishStatus, submitPublish, deletePublishRecords });
}
