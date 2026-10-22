import { confirmDialog } from '../../lib/admin-dialog.mjs';
export function installTranslations(context) {
  const translationDraftTabForType = type => (type === 'blog' ? 'blog-drafts' : 'product-drafts');

  const setTranslationFormData = data => {
    context.state.translationFormData = {
      applications: context.cloneArray(data.applications),
      specs: context.cloneArray(data.specs),
      specTables: context.cloneArray(data.specTables),
      highlights: context.cloneArray(data.highlights),
      faqs: context.cloneArray(data.faqs),
    };
  };

  const renderTranslationSingleTextList = (id, key, placeholder) => {
    const list = context.state.translationFormData[key] || [];
    context.$(id).innerHTML = list.length
      ? list
          .map(
            (value, index) => `
              <div class="form-row is-single">
                <input data-list="${key}" data-index="${index}" value="${context.escapeHtml(value)}" placeholder="${context.escapeHtml(placeholder)}" />
                <span></span>
                <button class="mini-button danger" data-action="${key}:remove" data-index="${index}" type="button">删除</button>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无内容</strong><small>点击添加按钮新增。</small></span></div>';
  };

  const renderTranslationSpecs = () => {
    const specs = context.state.translationFormData.specs || [];
    context.$('translationSpecsList').innerHTML = specs.length
      ? specs
          .map(
            (item, index) => `
              <div class="form-row">
                <input data-spec-index="${index}" data-field="label" value="${context.escapeHtml(item.label || '')}" placeholder="参数名，例如 Flow Rate" />
                <input data-spec-index="${index}" data-field="value" value="${context.escapeHtml(item.value || '')}" placeholder="参数值，例如 35 m3/h" />
                <button class="mini-button danger" data-action="specs:remove" data-index="${index}" type="button">删除</button>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无参数</strong><small>点击添加参数新增。</small></span></div>';
  };

  const renderTranslationFaqs = () => {
    const faqs = context.state.translationFormData.faqs || [];
    context.$('translationFaqsList').innerHTML = faqs.length
      ? faqs
          .map(
            (item, index) => `
              <div class="builder">
                <div class="form-row">
                  <input data-faq-index="${index}" data-field="question" value="${context.escapeHtml(item.question || '')}" placeholder="问题" />
                  <span></span>
                  <button class="mini-button danger" data-action="faqs:remove" data-index="${index}" type="button">删除</button>
                </div>
                <textarea data-faq-index="${index}" data-field="answer" placeholder="答案">${context.escapeHtml(item.answer || '')}</textarea>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无 FAQ</strong><small>点击添加 FAQ 新增。</small></span></div>';
  };

  const renderTranslationSpecTables = () => {
    const tables = context.state.translationFormData.specTables || [];
    context.$('translationSpecTablesList').innerHTML = tables.length
      ? tables.map((table, tableIndex) => context.renderSpecTable(table, tableIndex)).join('')
      : '<div class="notice"><span><strong>暂无参数表</strong><small>点击添加参数表新增。</small></span></div>';
  };

  const renderTranslationProductBuilders = () => {
    renderTranslationSingleTextList('translationApplicationsList', 'applications', '应用场景');
    renderTranslationSpecs();
    renderTranslationSingleTextList('translationHighlightsList', 'highlights', '产品亮点');
    renderTranslationFaqs();
    renderTranslationSpecTables();
  };

  const syncTranslationFormInput = target => {
    if (target.dataset.list) {
      context.state.translationFormData[target.dataset.list][Number(target.dataset.index)] = target.value;
      return;
    }
    if (target.dataset.specIndex !== undefined) {
      const item = context.state.translationFormData.specs[Number(target.dataset.specIndex)];
      if (item) item[target.dataset.field] = target.value;
      return;
    }
    if (target.dataset.faqIndex !== undefined) {
      const item = context.state.translationFormData.faqs[Number(target.dataset.faqIndex)];
      if (item) item[target.dataset.field] = target.value;
      return;
    }
    if (target.dataset.table !== undefined) {
      const table = context.state.translationFormData.specTables[Number(target.dataset.table)];
      if (!table) return;
      if (target.dataset.field === 'title') {
        table.title = target.value;
        return;
      }
      if (target.dataset.column !== undefined) {
        table.columns[Number(target.dataset.column)] = target.value;
        return;
      }
      if (target.dataset.row !== undefined && target.dataset.cell !== undefined) {
        const row = table.rows[Number(target.dataset.row)];
        if (row) row[Number(target.dataset.cell)] = target.value;
        return;
      }
      if (target.dataset.headerRow !== undefined && target.dataset.headerCell !== undefined) {
        const cell = table.headerRows?.[Number(target.dataset.headerRow)]?.cells?.[Number(target.dataset.headerCell)];
        if (!cell) return;
        if (target.dataset.field === 'text') cell.text = target.value;
        if (target.dataset.field === 'colspan') cell.colspan = Math.max(1, Number(target.value || 1));
        if (target.dataset.field === 'rowspan') cell.rowspan = Math.max(1, Number(target.value || 1));
      }
    }
  };

  const handleTranslationAction = actionButton => {
    const action = actionButton.dataset.action;
    const index = Number(actionButton.dataset.index);
    if (!action) return;

    if (action === 'applications:add') context.state.translationFormData.applications.push('');
    if (action === 'applications:remove') context.state.translationFormData.applications.splice(index, 1);
    if (action === 'specs:add') context.state.translationFormData.specs.push({ label: '', value: '' });
    if (action === 'specs:remove') context.state.translationFormData.specs.splice(index, 1);
    if (action === 'highlights:add') context.state.translationFormData.highlights.push('');
    if (action === 'highlights:remove') context.state.translationFormData.highlights.splice(index, 1);
    if (action === 'faqs:add') context.state.translationFormData.faqs.push({ question: '', answer: '' });
    if (action === 'faqs:remove') context.state.translationFormData.faqs.splice(index, 1);
    if (action === 'tables:add') {
      context.state.translationFormData.specTables.push({
        title: 'Product Specifications',
        columns: ['Model', 'Specification'],
        headerRows: [],
        rows: [['', '']],
      });
    }
    if (action === 'tables:remove') context.state.translationFormData.specTables.splice(index, 1);

    const tableIndex = Number(actionButton.dataset.table);
    const table = context.state.translationFormData.specTables[tableIndex];
    if (table) {
      if (action === 'table:column:add') {
        table.columns.push('');
        table.rows.forEach(row => row.push(''));
      }
      if (action === 'table:column:remove') {
        const column = Number(actionButton.dataset.column);
        table.columns.splice(column, 1);
        table.rows.forEach(row => row.splice(column, 1));
        if (!table.columns.length) table.columns.push('Specification');
        context.ensureRowWidth(table, table.columns.length);
      }
      if (action === 'table:row:add') table.rows.push(table.columns.map(() => ''));
      if (action === 'table:row:remove') {
        table.rows.splice(Number(actionButton.dataset.row), 1);
        if (!table.rows.length) table.rows.push(table.columns.map(() => ''));
      }
      if (action === 'table:header-row:add') table.headerRows.push({ cells: [{ text: '', colspan: 1, rowspan: 1 }] });
      if (action === 'table:header-row:remove') table.headerRows.splice(Number(actionButton.dataset.row), 1);
      if (action === 'table:header-cell:add') {
        const row = table.headerRows[Number(actionButton.dataset.row)];
        row.cells.push({ text: '', colspan: 1, rowspan: 1 });
      }
      if (action === 'table:header-cell:remove') {
        const row = table.headerRows[Number(actionButton.dataset.row)];
        row.cells.splice(Number(actionButton.dataset.cell), 1);
      }
    }

    renderTranslationProductBuilders();
  };

  const renderLocaleOptions = () => {
    if (!context.locales.length) {
      context.$('localeGrid').innerHTML = '<p class="muted">当前尚未启用可翻译的目标语言。</p>';
      syncLocaleBulkControls();
      return;
    }
    context.$('localeGrid').innerHTML = context.locales
      .map(
        ([code, label]) => `
          <label>
            <input type="checkbox" value="${code}" checked />
            <span>${context.escapeHtml(label)}</span>
          </label>
        `
      )
      .join('');
    syncLocaleBulkControls();
  };

  const loadTranslationLocales = async () => {
    const payload = await context.requestJson('/api/manager/ai/translation-locales', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const configured = Array.isArray(payload.locales) ? payload.locales : [];
    context.locales.splice(0, context.locales.length, ...configured
      .filter(item => item && typeof item.value === 'string' && typeof item.label === 'string')
      .map(item => [item.value, item.label]));
    renderLocaleOptions();
  };

  const localeInputs = () => [...context.$('localeGrid').querySelectorAll('input[type="checkbox"]')];

  const syncLocaleBulkControls = () => {
    const inputs = localeInputs();
    const checkedCount = inputs.filter(input => input.checked).length;
    const selectAll = context.$('translationLocaleSelectAll');
    selectAll.checked = inputs.length > 0 && checkedCount === inputs.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
    context.$('translationLocaleInvert').checked = false;
  };

  const setAllLocales = checked => {
    localeInputs().forEach(input => {
      input.checked = checked;
    });
    syncLocaleBulkControls();
  };

  const invertLocales = () => {
    localeInputs().forEach(input => {
      input.checked = !input.checked;
    });
    syncLocaleBulkControls();
  };

  const selectedLocales = () =>
    [...context.$('localeGrid').querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);

  const translationOutcomeLabel = result => {
    if (!result) return '';
    if (result.resultStatusLabel) return result.resultStatusLabel;
    const generated = result.generated?.length || 0;
    const skipped = result.skipped?.length || 0;
    const errors = result.errors?.length || 0;
    if (errors && (generated || skipped)) return '部分成功';
    if (errors) return '全部失败';
    return '全部成功';
  };

  const translationOutcomeMessage = result => {
    const generated = result?.generated?.length || 0;
    const skipped = result?.skipped?.length || 0;
    const errors = result?.errors?.length || 0;
    if (errors && generated) return '已生成的草稿可以继续审核；失败的语言已列在下面，可稍后只重试失败项。';
    if (errors && skipped) return '已有草稿被跳过；失败的语言已列在下面，可稍后只重试失败项。';
    if (errors) return '本次没有生成可用草稿。请查看失败明细，更换可用 AI Key 后重试。';
    if (generated) return '翻译任务已完成。请到产品翻译草稿或文章翻译草稿里审核。';
    if (skipped) return '任务已完成，没有新增草稿；本次目标草稿已经存在。';
    return '任务已结束，但没有产生新草稿、跳过项或错误。请打开任务记录确认输入范围。';
  };

  const renderTranslationItems = (items, emptyText, renderItem) => {
    if (!items?.length) return `<p class="translation-result-empty">${emptyText}</p>`;
    const visible = items.slice(0, 20);
    const more = items.length > visible.length ? `<li>还有 ${items.length - visible.length} 条未显示，请打开任务记录查看完整列表。</li>` : '';
    return `<ul>${visible.map(renderItem).join('')}${more}</ul>`;
  };

  const renderTranslationResult = data => {
    const result = data.result;
    const generated = result?.generated?.length || 0;
    const skipped = result?.skipped?.length || 0;
    const errors = result?.errors?.length || 0;
    const toneClass = result
      ? errors
        ? generated || skipped
          ? 'is-warning'
          : 'is-error'
        : 'is-success'
      : '';
    context.$('translationResult').innerHTML = `
      <div class="notice ${toneClass}">
        <span>
          <strong>${context.escapeHtml(translationOutcomeLabel(result) || data.label || data.status || '任务状态')}</strong>
          <small>${context.escapeHtml(data.message || data.run?.title || '')}</small>
          ${
            result
              ? `<small>生成 ${generated} 条，跳过 ${skipped} 条，错误 ${errors} 条。</small>`
              : '<small>任务结果文件生成后会在这里显示摘要。</small>'
          }
          ${result ? `<small>${context.escapeHtml(translationOutcomeMessage(result))}</small>` : ''}
        </span>
      </div>
      ${
        result
          ? `
            <div class="translation-result-columns">
              <section class="is-success">
                <strong>成功生成</strong>
                ${renderTranslationItems(
                  result.generated || [],
                  '本次没有新增草稿。',
                  item => {
                    const previewType = item.type === 'blog' ? 'blog' : 'product';
                    const previewHref = `/api/manager/ai/draft-preview?type=${previewType}&draft=${encodeURIComponent(`${item.locale}--${item.slug}`)}`;
                    const retryText = item.attempts && item.attempts > 1 ? `，重试 ${item.attempts - 1} 次` : '';
                    return `<li>${context.escapeHtml(item.type)} / ${context.escapeHtml(item.locale)} / ${context.escapeHtml(item.slug)}${context.escapeHtml(retryText)} <a href="${context.escapeHtml(previewHref)}" data-auth-preview="${context.escapeHtml(previewHref)}" data-preview-status="translationStatus" target="_blank" rel="noreferrer">预览</a></li>`;
                  }
                )}
              </section>
              <section class="is-skipped">
                <strong>跳过</strong>
                ${renderTranslationItems(
                  result.skipped || [],
                  '本次没有跳过项。',
                  item => `<li>${context.escapeHtml(item.type)} / ${context.escapeHtml(item.locale)} / ${context.escapeHtml(item.slug)}：${context.escapeHtml(item.reason || '已存在')}</li>`
                )}
              </section>
              <section class="is-failure">
                <strong>失败</strong>
                ${renderTranslationItems(
                  result.errors || [],
                  '本次没有失败项。',
                  item => {
                    const retryText = item.attempts && item.attempts > 1 ? `，已重试 ${item.attempts - 1} 次` : '';
                    return `<li>${context.escapeHtml(item.type)} / ${context.escapeHtml(item.locale)} / ${context.escapeHtml(item.slug)}：${context.escapeHtml(item.friendlyMessage || item.message || '翻译失败')}${context.escapeHtml(retryText)}</li>`;
                  }
                )}
              </section>
            </div>
          `
          : ''
      }
    `;
  };

  const generatedTranslationDraftTypes = result => [
    ...new Set(
      (result?.generated || [])
        .map(item => (item.type === 'blog' ? 'blog' : item.type === 'product' ? 'product' : ''))
        .filter(Boolean)
    ),
  ];

  const requestedTranslationDraftTypes = sourceType =>
    sourceType === 'blog' ? ['blog'] : sourceType === 'products' ? ['product'] : ['product', 'blog'];

  const refreshCompletedTranslationDrafts = async data => {
    const types = generatedTranslationDraftTypes(data.result);
    if (!types.length && data.status === 'completed' && data.conclusion === 'success') {
      types.push(...requestedTranslationDraftTypes(context.state.translationLastSourceType));
    }
    if (!types.length) return;

    const syncKey = `${data.requestId || context.state.translationRequestId}:${types.sort().join(',')}:${data.result?.generated?.length || 0}`;
    if (context.state.translationDraftSyncKey === syncKey) return;
    context.state.translationDraftSyncKey = syncKey;

    if (types.length === 1 && context.activePanel() === 'translation') {
      context.activateTab(translationDraftTabForType(types[0]));
      return;
    }

    await Promise.all(
      types.map(type =>
        loadTranslationDrafts(type).catch(error => context.setStatus(draftUi(type).status, error.message, true))
      )
    );
  };

  const draftUi = type =>
    type === 'blog'
      ? {
          list: 'blogDraftList',
          status: 'blogDraftStatus',
          include: 'blogDraftIncludePublished',
          empty: '当前没有需要显示的文章翻译草稿',
        }
      : {
          list: 'productDraftList',
          status: 'productDraftStatus',
          include: 'productDraftIncludePublished',
          empty: '当前没有需要显示的产品翻译草稿',
        };

  const draftCache = { blog: [], product: [] };
  const draftBusy = new Set();
  const loadSerial = { blog: 0, product: 0 };
  const visibleTranslationDrafts = type => {
    const term = context.$(`${type}DraftSearch`).value.trim().toLowerCase();
    const locale = context.$(`${type}DraftLocale`).value;
    return draftCache[type].filter(draft => (!locale || draft.locale === locale) && `${draft.title} ${draft.sourceTitle} ${draft.sourceSlug} ${draft.locale}`.toLowerCase().includes(term));
  };
  const selectedTranslationDrafts = type => {
    const ids = new Set([...context.$(draftUi(type).list).querySelectorAll('input[data-translation-draft]:checked')].map(input => input.dataset.translationDraft.slice(type.length + 1)));
    return visibleTranslationDrafts(type).filter(draft => ids.has(draft.draftSlug));
  };
  const syncTranslationSelection = type => {
    const visible = visibleTranslationDrafts(type), chosen = selectedTranslationDrafts(type), busy = draftBusy.has(type);
    const all = context.$(`${type}DraftSelectAll`);
    all.checked = !!visible.length && chosen.length === visible.length;
    all.indeterminate = chosen.length > 0 && chosen.length < visible.length;
    all.disabled = busy || !visible.length;
    context.$(`${type}DraftApproveButton`).disabled = busy || !chosen.some(draft => !draft.published);
    context.$(`${type}DraftDeleteButton`).disabled = busy || !chosen.length || chosen.some(draft => !draft.deleteAction);
    for (const suffix of ['IncludePublished','RefreshButton','Locale','Search']) context.$(`${type}Draft${suffix}`).disabled = busy;
    context.$(draftUi(type).list).querySelectorAll('button,input').forEach(node => { node.disabled = busy || node.hasAttribute('data-delete-unavailable'); });
  };
  const renderTranslationDrafts = (type, drafts = draftCache[type]) => {
    draftCache[type] = drafts;
    const ui = draftUi(type);
    const visible = visibleTranslationDrafts(type);
    context.$(ui.list).innerHTML = visible.length ? visible.map(draft => `
      <div class="record translation-record" data-translation-type="${context.escapeHtml(type)}" data-translation-slug="${context.escapeHtml(draft.draftSlug)}">
        <label><input type="checkbox" data-translation-draft="${type}:${context.escapeHtml(draft.draftSlug)}" aria-label="选择 ${context.escapeHtml(draft.title)}" /><span><strong>${context.escapeHtml(draft.locale)} · ${context.escapeHtml(draft.title)}</strong><small>${draft.published ? '已审核 · 待发布' : '待审核'} · ${context.formatDate(draft.generatedAt)}</small><small>原文：${context.escapeHtml(draft.sourceTitle || draft.sourceSlug)}</small></span></label>
        <span class="record-actions"><a class="button secondary" href="${context.escapeHtml(draft.previewUrl)}" data-auth-preview="${context.escapeHtml(draft.previewUrl)}" data-preview-status="${ui.status}" target="_blank" rel="noreferrer">预览</a><button class="button secondary" data-translation-edit="${type}:${context.escapeHtml(draft.draftSlug)}" type="button">审核编辑</button><button class="button danger" data-translation-delete="${type}:${context.escapeHtml(draft.draftSlug)}" ${!draft.deleteAction ? 'disabled data-delete-unavailable' : ''} type="button">${draft.deleteAction === 'restore' ? '撤销改稿' : '删除'}</button></span>
      </div>`).join('') : `<div class="notice"><span><strong>${ui.empty}</strong><small>已上线内容请到${type === 'blog' ? '所有文章' : '产品管理'}中按语言编辑。</small></span></div>`;
    syncTranslationSelection(type);
  };
  const loadTranslationDrafts = async type => {
    const serial = ++loadSerial[type], ui = draftUi(type);
    context.setStatus(ui.status, '正在加载翻译草稿...');
    const data = await context.requestJson(`/api/manager/ai/drafts?type=${type}&includePublished=${context.$(ui.include).checked}`);
    if (serial !== loadSerial[type]) return;
    draftCache[type] = data.drafts || [];
    const localeSelect = context.$(`${type}DraftLocale`), oldLocale = localeSelect.value;
    localeSelect.innerHTML = '<option value="">全部语言</option>' + [...new Set(draftCache[type].map(draft => draft.locale))].map(code => `<option value="${context.escapeHtml(code)}">${context.escapeHtml(code)}</option>`).join('');
    localeSelect.value = [...localeSelect.options].some(item => item.value === oldLocale) ? oldLocale : '';
    renderTranslationDrafts(type);
    context.setStatus(ui.status, `待审核 ${data.counts?.pending || 0} 条，已审待发布 ${data.counts?.published || 0} 条，已上线 ${data.counts?.live || 0} 条；当前显示 ${visibleTranslationDrafts(type).length} 条。 ${data.warning || ''}`);
  };
  const mutateTranslationDrafts = async (type, action, rows = selectedTranslationDrafts(type)) => {
    if (draftBusy.has(type)) return;
    const targets = action === 'approve' ? rows.filter(draft => !draft.published) : rows;
    if (!targets.length) return;
    if (action === 'delete' && !await confirmDialog(`请确认以下 ${targets.length} 项：\n${targets.map(draft => `${draft.locale} · ${draft.title} (${draft.draftSlug})：${draft.deleteAction === 'restore' ? '撤销未上线修改，恢复线上版本' : '删除未上线新稿'}`).join('\n')}\n正式线上内容和共享媒体保持。`)) return;
    draftBusy.add(type); syncTranslationSelection(type);
    try {
      await context.requestJson('/api/manager/ai/drafts', { method: action === 'delete' ? 'DELETE' : 'PATCH', body: JSON.stringify({type, confirmed:action === 'delete', drafts:targets.map(({draftSlug,sourceSha}) => ({draftSlug,sourceSha}))}) });
      await loadTranslationDrafts(type);
    } finally { draftBusy.delete(type); syncTranslationSelection(type); }
  };
  const approveTranslationDrafts = type => mutateTranslationDrafts(type, 'approve');
  const deleteTranslationDrafts = type => mutateTranslationDrafts(type, 'delete');
  const toggleAllTranslationDrafts = (type, checked) => {
    context.$(draftUi(type).list).querySelectorAll('input[data-translation-draft]').forEach(input => { input.checked = checked; });
    syncTranslationSelection(type);
  };

  const setTranslationEditorOpen = open => {
    if (open) context.activateTab('translation-editor');
    else context.activateTab(context.state.translationEditor.returnTab || translationDraftTabForType(context.state.translationEditor.type));
  };

  const closeTranslationEditor = () => {
    const returnTab = context.state.translationEditor.returnTab || translationDraftTabForType(context.state.translationEditor.type);
    context.state.translationEditor = { type: '', draftSlug: '', draft: null, returnTab };
    setTranslationFormData({});
    context.setStatus('translationEditorStatus', '请选择一条翻译草稿。');
    setTranslationEditorOpen(false);
  };

  const fillTranslationEditor = (draft, warning = '') => {
    const data = draft.data || {};
    const isProduct = draft.type === 'product';
    const editable = draft.editable !== false;
    context.$('translationEditorTitle').textContent = `${draft.typeLabel}${context.state.translationEditor.returnTab === 'products' || context.state.translationEditor.returnTab === 'blog' ? '译文 · 保存后等待网站发布' : '翻译草稿'}`;
    context.$('translationEditorPreviewLink').href = draft.previewUrl || '#';
    context.$('translationEditorPreviewLink').dataset.authPreview = draft.previewUrl || '';
    context.$('translationEditorPreviewLink').dataset.previewStatus = 'translationEditorStatus';
    context.$('translationEditTitle').value = data.title || '';
    context.$('translationEditDescription').value = data.description || '';
    context.$('translationEditCategoryName').value = data.categoryName || '';
    context.$('translationEditSeries').value = data.series || '';
    context.$('translationEditCategory').value = data.category || '';
    setTranslationFormData(data);
    renderTranslationProductBuilders();
    context.setRichTextValue('translationEditBody', draft.body || '');
    context.$('translationEditPublished').checked = data.published === true;
    document.querySelectorAll('.translation-edit-product').forEach(node => {
      node.hidden = !isProduct;
    });
    document.querySelectorAll('.translation-edit-blog').forEach(node => {
      node.hidden = isProduct;
    });
    context.$('translationEditorSaveButton').disabled = !editable;
    context.$('translationEditorApproveButton').disabled = !editable;
    context.setStatus(
      'translationEditorStatus',
      warning
        ? editable
          ? `${warning} 当前仍可编辑，保存后会更新待审核内容。`
          : warning
        : editable
          ? '草稿已加载。'
          : '当前为本地只读草稿，无法直接保存。'
    );
  };

  const openTranslationDraftEditor = async (type, draftSlug, formalReturnTab = '') => {
    const ui = draftUi(type);
    const returnTab = formalReturnTab || translationDraftTabForType(type);
    context.state.translationEditor = { type, draftSlug, draft: null, returnTab };
    context.setStatus(ui.status, '正在读取翻译草稿...');
    context.setStatus('translationEditorStatus', '正在读取翻译草稿...');
    setTranslationEditorOpen(true);
    const data = await context.requestJson(`/api/manager/ai/drafts?type=${encodeURIComponent(type)}&draft=${encodeURIComponent(draftSlug)}`);
    context.state.translationEditor = { type, draftSlug, draft: data.draft, returnTab };
    fillTranslationEditor(data.draft, data.warning || '');
    if (data.warning) context.setStatus(ui.status, data.warning, true);
    else context.setStatus(ui.status, '草稿已打开。');
  };

  const cleanTranslationStrings = value => (Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : []);

  const cleanTranslationSpecs = value =>
    Array.isArray(value)
      ? value
          .map(item => ({
            label: String(item?.label || '').trim(),
            value: String(item?.value || '').trim(),
          }))
          .filter(item => item.label || item.value)
      : [];

  const cleanTranslationFaqs = value =>
    Array.isArray(value)
      ? value
          .map(item => ({
            question: String(item?.question || '').trim(),
            answer: String(item?.answer || '').trim(),
          }))
          .filter(item => item.question || item.answer)
      : [];

  const cleanTranslationSpecTables = value =>
    Array.isArray(value)
      ? value
          .map(table => {
            const columns = cleanTranslationStrings(table?.columns);
            const rows = Array.isArray(table?.rows)
              ? table.rows
                  .map(row => (Array.isArray(row) ? row.map(cell => String(cell || '').trim()) : []))
                  .filter(row => row.some(Boolean))
              : [];
            const headerRows = Array.isArray(table?.headerRows)
              ? table.headerRows
                  .map(row => ({
                    cells: Array.isArray(row?.cells)
                      ? row.cells
                          .map(cell => ({
                            text: String(cell?.text || '').trim(),
                            colspan: Math.max(1, Number(cell?.colspan || 1)),
                            rowspan: Math.max(1, Number(cell?.rowspan || 1)),
                          }))
                          .filter(cell => cell.text)
                      : [],
                  }))
                  .filter(row => row.cells.length)
              : [];
            return {
              title: String(table?.title || '').trim(),
              columns,
              headerRows,
              rows,
            };
          })
          .filter(table => table.title || table.columns.length || table.rows.length || table.headerRows.length)
      : [];

  const saveTranslationDraftEditor = async ({ publish = false } = {}) => {
    const { type, draftSlug, draft } = context.state.translationEditor;
    if (!type || !draftSlug || !draft) return;
    const data = { ...(draft.data || {}) };
    data.title = context.$('translationEditTitle').value.trim();
    data.description = context.$('translationEditDescription').value.trim();
    data.published = publish ? true : context.$('translationEditPublished').checked;
    if (type === 'product') {
      data.categoryName = context.$('translationEditCategoryName').value.trim();
      data.series = context.$('translationEditSeries').value.trim();
      data.applications = cleanTranslationStrings(context.state.translationFormData.applications);
      data.specs = cleanTranslationSpecs(context.state.translationFormData.specs);
      data.specTables = cleanTranslationSpecTables(context.state.translationFormData.specTables);
      data.highlights = cleanTranslationStrings(context.state.translationFormData.highlights);
      data.faqs = cleanTranslationFaqs(context.state.translationFormData.faqs);
    } else {
      data.category = context.$('translationEditCategory').value.trim();
    }
    context.setStatus('translationEditorStatus', '正在保存草稿...');
    const response = await context.requestJson('/api/manager/ai/drafts', {
      method: 'PUT',
      body: JSON.stringify({
        type,
        draftSlug,
        sourceSha: draft.sourceSha,
        data,
        body: context.getRichTextValue('translationEditBody'),
      }),
    });
    context.state.translationEditor.draft = response.draft;
    fillTranslationEditor(response.draft);
    await loadTranslationDrafts(type);
    context.setStatus('translationEditorStatus', publish ? '草稿已审核并保存。' : '草稿已保存。');
  };

  const handleTranslationDraftListClick = event => {
    const deleteButton = event.target.closest('[data-translation-delete]');
    if (deleteButton) {
      const [type, id] = deleteButton.dataset.translationDelete.split(':');
      const draft = draftCache[type]?.find(item => item.draftSlug === id);
      if(draft) mutateTranslationDrafts(type,'delete',[draft]).catch(error => context.setStatus(draftUi(type).status,error.message,true));
      return;
    }
    const editButton = event.target.closest('[data-translation-edit]');
    if (editButton) {
      const [type, draftSlug] = editButton.dataset.translationEdit.split(':');
      if (type && draftSlug) openTranslationDraftEditor(type, draftSlug).catch(error => context.setStatus(draftUi(type).status, error.message, true));
      return;
    }
    if (event.target.closest('input, a, button')) return;
    const row = event.target.closest('.record');
    const type = row?.dataset.translationType;
    const draftSlug = row?.dataset.translationSlug;
    if (type && draftSlug) openTranslationDraftEditor(type, draftSlug).catch(error => context.setStatus(draftUi(type).status, error.message, true));
  };

  const pollTranslationStatus = async () => {
    if (!context.state.translationRequestId) {
      context.setStatus('translationStatus', '还没有提交任务。', true);
      return;
    }
    const data = await context.requestJson(`/api/manager/ai/translation-status?requestId=${encodeURIComponent(context.state.translationRequestId)}`);
    context.setStatus('translationStatus', data.label || data.status || '状态已刷新。', data.conclusion && data.conclusion !== 'success');
    renderTranslationResult(data);
    if (data.status === 'completed') {
      clearInterval(context.state.translationTimer);
      context.state.translationTimer = null;
      await refreshCompletedTranslationDrafts(data);
    }
  };

  const submitTranslation = async () => {
    const locales = selectedLocales();
    if (!locales.length) {
      context.setStatus('translationStatus', '请至少选择一个目标语言。', true);
      return;
    }
    context.setStatus('translationStatus', '正在提交翻译任务...');
    const data = await context.requestJson('/api/manager/ai/translations', {
      method: 'POST',
      body: JSON.stringify({
        sourceType: context.$('translationSourceType').value,
        sourceSlug: context.$('translationSlug').value.trim(),
        locales,
        overwrite: context.$('translationOverwrite').checked,
        apiKeyOffset: Date.now(),
      }),
    });
    context.state.translationRequestId = data.requestId;
    context.state.translationDraftSyncKey = '';
    context.state.translationLastSourceType = data.sourceType || context.$('translationSourceType').value || 'all';
    context.setStatus('translationStatus', '翻译任务已提交，请稍后刷新任务状态。');
    clearInterval(context.state.translationTimer);
    context.state.translationTimer = setInterval(() => pollTranslationStatus().catch(error => context.setStatus('translationStatus', error.message, true)), 8000);
  };
  Object.assign(context, { translationDraftTabForType, setTranslationFormData, renderTranslationSingleTextList, renderTranslationSpecs, renderTranslationFaqs, renderTranslationSpecTables, renderTranslationProductBuilders, syncTranslationFormInput, handleTranslationAction, renderLocaleOptions, loadTranslationLocales, localeInputs, syncLocaleBulkControls, setAllLocales, invertLocales, selectedLocales, translationOutcomeLabel, translationOutcomeMessage, renderTranslationItems, renderTranslationResult, generatedTranslationDraftTypes, requestedTranslationDraftTypes, refreshCompletedTranslationDrafts, draftUi, visibleTranslationDrafts, syncTranslationSelection, toggleAllTranslationDrafts, deleteTranslationDrafts, renderTranslationDrafts, loadTranslationDrafts, approveTranslationDrafts, setTranslationEditorOpen, closeTranslationEditor, fillTranslationEditor, openTranslationDraftEditor, cleanTranslationStrings, cleanTranslationSpecs, cleanTranslationFaqs, cleanTranslationSpecTables, saveTranslationDraftEditor, handleTranslationDraftListClick, pollTranslationStatus, submitTranslation });
}
