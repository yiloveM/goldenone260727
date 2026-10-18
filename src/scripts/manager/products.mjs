export function installProducts(context) {
  // Legacy galleries render the separate cover first on public product pages.
  const editableGalleryImages = product => [...new Set([product.image, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])]
    .map(value => String(value ?? '').trim()).filter(Boolean))];

  const syncProductMainImage = () => {
    const first = context.state.formData.galleryImages.find(value => String(value ?? '').trim());
    context.$('image').value = String(first ?? '').trim();
    context.updateImageFieldPreview('image');
  };

  const setProductMainImage = value => {
    const images = context.state.formData.galleryImages;
    if (images.length) images[0] = value;
    else if (String(value ?? '').trim()) images.push(value);
    syncProductMainImage();
    renderSingleTextList('galleryList', 'galleryImages', '产品主图链接');
  };

  const fillCategoryOptions = () => {
    const categoryFilter = context.$('categoryFilter');
    const orderCategoryFilter = context.$('orderCategoryFilter');
    const category = context.$('category');
    categoryFilter.innerHTML = '<option value="">所有分类</option>';
    orderCategoryFilter.innerHTML = '<option value="">所有分类</option>';
    category.innerHTML = '';
    for (const item of context.state.categories) {
      const value = context.escapeHtml(item);
      categoryFilter.insertAdjacentHTML('beforeend', `<option value="${value}">${value}</option>`);
      orderCategoryFilter.insertAdjacentHTML('beforeend', `<option value="${value}">${value}</option>`);
      category.insertAdjacentHTML('beforeend', `<option value="${value}">${value}</option>`);
    }
  };

  const filteredProducts = () => {
    const term = context.$('searchInput').value.trim().toLowerCase();
    const category = context.$('categoryFilter').value;
    return context.state.products
      .filter(product => {
        const matchesTerm = !term || `${product.title} ${product.series} ${product.category}`.toLowerCase().includes(term);
        const matchesCategory = !category || product.category === category;
        return matchesTerm && matchesCategory;
      })
      .sort((a, b) => Number(a.sortOrder || 9999) - Number(b.sortOrder || 9999) || String(a.title || '').localeCompare(String(b.title || '')));
  };

  const filteredOrderProducts = () => {
    const term = context.$('orderSearchInput').value.trim().toLowerCase();
    const category = context.$('orderCategoryFilter').value;
    return context.state.products.filter(product => {
      const matchesTerm = !term || `${product.title} ${product.series}`.toLowerCase().includes(term);
      const matchesCategory = !category || product.category === category;
      return matchesTerm && matchesCategory;
    });
  };

  const renderProducts = () => {
    const products = filteredProducts();
    const totalProducts = context.state.products.length;
    const onlineCount = context.state.products.filter(product => product.published !== false).length;
    const offlineCount = Math.max(0, totalProducts - onlineCount);
    const totalPages = Math.max(1, Math.ceil(products.length / context.productPageSize));
    const currentPage = Math.min(Math.max(1, context.state.productPage), totalPages);
    context.state.productPage = currentPage;
    const pageProducts = products.slice((currentPage - 1) * context.productPageSize, currentPage * context.productPageSize);
    const categoryLabel = context.$('categoryFilter').value || '全部分类';

    context.$('productTotalCount').textContent = totalProducts;
    context.$('productOnlineCount').textContent = onlineCount;
    context.$('productOfflineCount').textContent = offlineCount;
    context.$('productCategoryMeta').textContent = categoryLabel;
    context.$('productBrowserStatus').textContent = `当前筛选 ${products.length} 个产品 / 第 ${currentPage} 页，共 ${totalPages} 页`;
    context.$('productList').innerHTML = pageProducts.length
      ? `
        <div class="manager-product-head">
          <span>产品图</span>
          <span>产品名称</span>
          <span>产品分类</span>
          <span>操作</span>
        </div>
        ${pageProducts
          .map(
            product => `
              <article class="manager-product-row ${product.slug === context.state.activeSlug ? 'is-active' : ''} ${product.published === false ? 'is-unpublished' : ''}">
                <button class="manager-product-thumb" data-slug="${context.escapeHtml(product.slug)}" type="button" aria-label="编辑 ${context.escapeHtml(product.title)}">
                  ${context.thumbnailMarkup(product.image, product.title)}
                </button>
                <div class="manager-product-main">
                  <button class="manager-product-title" data-slug="${context.escapeHtml(product.slug)}" title="${context.escapeHtml(product.title)}" type="button">${context.escapeHtml(product.title)}</button>
                  <span class="manager-product-series">${context.escapeHtml(product.series || '未填写系列')}</span>
                </div>
                <span class="manager-product-category">${context.escapeHtml(product.category || '未分类')}</span>
                <span class="manager-product-actions">
                  <label class="manager-product-publish ${product.published ? 'is-on' : ''}">
                    <input data-product-published="${context.escapeHtml(product.slug)}" type="checkbox" ${product.published ? 'checked' : ''} />
                    <span>${product.published ? '已上线' : '已下线'}</span>
                  </label>
                  <button class="manager-product-edit" data-slug="${context.escapeHtml(product.slug)}" type="button">编辑</button>
                  <a class="manager-product-view" data-product-view href="/products/${context.escapeHtml(product.slug)}/" target="_blank" rel="noreferrer">前端查看</a>
                </span>
              </article>
            `
          )
          .join('')}
      `
      : '<div class="manager-product-empty notice"><span><strong>没有匹配产品</strong><small>请换一个关键词或分类。</small></span></div>';
    context.$('productPagination').innerHTML = `
      <button data-product-page="first" type="button" ${currentPage <= 1 ? 'disabled' : ''}>首页</button>
      <button data-product-page="prev" type="button" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>${currentPage} / ${totalPages}</span>
      <button data-product-page="next" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
      <button data-product-page="last" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>末页</button>
    `;
  };

  const setProductPage = action => {
    const products = filteredProducts();
    const totalPages = Math.max(1, Math.ceil(products.length / context.productPageSize));
    if (action === 'first') context.state.productPage = 1;
    if (action === 'prev') context.state.productPage = Math.max(1, context.state.productPage - 1);
    if (action === 'next') context.state.productPage = Math.min(totalPages, context.state.productPage + 1);
    if (action === 'last') context.state.productPage = totalPages;
    renderProducts();
  };

  const renderProductOrder = () => {
    const products = filteredOrderProducts();
    context.$('orderGrid').innerHTML = products.length
      ? products
          .map(product => {
            const value = context.state.orderChanges.has(product.slug) ? context.state.orderChanges.get(product.slug) : product.sortOrder;
            return `
              <article class="order-card">
                ${context.thumbnailMarkup(product.image, product.title)}
                <strong>${context.escapeHtml(product.title)}</strong>
                <small>${context.escapeHtml(product.category)} · ${context.escapeHtml(product.series)}</small>
                <label>
                  <small>权重</small>
                  <input data-order-slug="${context.escapeHtml(product.slug)}" type="number" min="1" step="1" value="${context.escapeHtml(value)}" />
                </label>
              </article>
            `;
          })
          .join('')
      : '<div class="notice"><span><strong>没有匹配产品</strong><small>请换一个关键词或分类。</small></span></div>';
    context.setStatus('orderStatus', `当前显示 ${products.length} 个产品，已修改 ${context.state.orderChanges.size} 个权重。`);
  };

  const setFormData = product => {
    const current = context.state.products.find(item => item.slug === (product.slug || product.productSlug));
    context.$('offeringType').value = current?.offeringType || context.productEditorPolicy.offeringType;
    context.$('modelStrategy').value = current?.modelStrategy || context.productEditorPolicy.modelStrategy;
    if (context.$('aggregateRatingValue')) context.$('aggregateRatingValue').value = product.aggregateRatingValue ?? current?.aggregateRatingValue ?? '';
    if (context.$('aggregateRatingCount')) context.$('aggregateRatingCount').value = product.aggregateRatingCount ?? current?.aggregateRatingCount ?? 0;
    context.state.formData = {
      reviews: context.cloneArray(product.reviews ?? current?.reviews),
      galleryImages: editableGalleryImages(product),
      detailImages: context.cloneArray(product.detailImages),
      applications: context.cloneArray(product.applications),
      specs: context.cloneArray(product.specs),
      specTables: context.cloneArray(product.specTables),
      highlights: context.cloneArray(product.highlights),
      faqs: context.cloneArray(product.faqs),
    };
    syncProductMainImage();
  };

  const renderSingleTextList = (id, key, placeholder) => {
    const list = context.state.formData[key] || [];
    const isImageList = key === 'galleryImages';
    context.$(id).innerHTML = list.length
      ? list
          .map(
            (value, index) => `
              <div class="form-row ${isImageList ? 'has-picker is-single' : ''}">
                <input data-list="${key}" data-index="${index}" value="${context.escapeHtml(value)}" placeholder="${context.escapeHtml(placeholder)}" />
                ${
                  isImageList
                    ? `<button class="field-image-preview" data-inline-image-preview="${context.escapeHtml(value)}" type="button" title="${context.escapeHtml(value || '当前没有图片')}" ${value ? '' : 'disabled'}>${context.thumbnailMarkup(value, '产品主图')}</button><button class="mini-button" data-image-list="${key}" data-index="${index}" type="button">选择</button>`
                    : '<span></span>'
                }
                <button class="mini-button danger" data-action="${key}:remove" data-index="${index}" type="button">删除</button>
              </div>
            `
          )
          .join('')
      : `<div class="notice"><span><strong>暂无内容</strong><small>点击添加按钮新增。</small></span></div>`;
  };

  const renderSpecs = () => {
    const specs = context.state.formData.specs || [];
    context.$('specsList').innerHTML = specs.length
      ? specs
          .map(
            (item, index) => `
              <div class="form-row">
                <input data-spec-index="${index}" data-field="label" value="${context.escapeHtml(item.label || '')}" placeholder="参数名，例如 Flow Rate" />
                <input data-spec-index="${index}" data-field="value" value="${context.escapeHtml(item.value || '')}" placeholder="参数值，例如 35 m³/h" />
                <button class="mini-button danger" data-action="specs:remove" data-index="${index}" type="button">删除</button>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无参数</strong><small>点击添加参数新增。</small></span></div>';
  };

  const renderDetailImages = () => {
    const images = context.state.formData.detailImages || [];
    context.$('detailImageList').innerHTML = images.length
      ? images
          .map(
            (item, index) => `
              <div class="builder">
                <div class="form-row has-picker">
                  <input data-detail-index="${index}" data-field="image" value="${context.escapeHtml(item.image || '')}" placeholder="图片链接" />
                  <button class="mini-button" data-image-detail="${index}" type="button">选择</button>
                  <input data-detail-index="${index}" data-field="title" value="${context.escapeHtml(item.title || '')}" placeholder="图片标题" />
                  <button class="mini-button danger" data-action="detail:remove" data-index="${index}" type="button">删除</button>
                </div>
                <textarea data-detail-index="${index}" data-field="caption" placeholder="图片说明">${context.escapeHtml(item.caption || '')}</textarea>
              </div>
            `
          )
          .join('')
      : '<div class="notice"><span><strong>暂无详情图</strong><small>点击添加详情图新增。</small></span></div>';
  };

  const renderFaqs = () => {
    const faqs = context.state.formData.faqs || [];
    context.$('faqsList').innerHTML = faqs.length
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

  const renderSpecTables = () => {
    const tables = context.state.formData.specTables || [];
    context.$('specTablesList').innerHTML = tables.length
      ? tables.map((table, tableIndex) => renderSpecTable(table, tableIndex)).join('')
      : '<div class="notice"><span><strong>暂无参数表</strong><small>点击添加参数表新增。</small></span></div>';
  };

  const renderSpecTable = (table, tableIndex) => {
    const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['Model', 'Specification'];
    const rows = Array.isArray(table.rows) && table.rows.length ? table.rows : [['', '']];
    const headerRows = Array.isArray(table.headerRows) ? table.headerRows : [];
    table.columns = columns;
    table.rows = rows;
    table.headerRows = headerRows;

    const headerEditor = headerRows
      .map(
        (row, rowIndex) => `
          <div class="builder">
            <div class="builder-head">
              <strong>复杂表头行 ${rowIndex + 1}</strong>
              <div class="table-toolbar">
                <button class="mini-button" data-action="table:header-cell:add" data-table="${tableIndex}" data-row="${rowIndex}" type="button">添加表头单元格</button>
                <button class="mini-button danger" data-action="table:header-row:remove" data-table="${tableIndex}" data-row="${rowIndex}" type="button">删除表头行</button>
              </div>
            </div>
            ${(row.cells || [])
              .map(
                (cell, cellIndex) => `
                  <div class="header-cell-editor">
                    <input data-table="${tableIndex}" data-header-row="${rowIndex}" data-header-cell="${cellIndex}" data-field="text" value="${context.escapeHtml(cell.text || '')}" placeholder="表头文字" />
                    <input data-table="${tableIndex}" data-header-row="${rowIndex}" data-header-cell="${cellIndex}" data-field="colspan" type="number" min="1" value="${context.escapeHtml(cell.colspan || 1)}" title="跨列" />
                    <input data-table="${tableIndex}" data-header-row="${rowIndex}" data-header-cell="${cellIndex}" data-field="rowspan" type="number" min="1" value="${context.escapeHtml(cell.rowspan || 1)}" title="跨行" />
                    <button class="mini-button danger" data-action="table:header-cell:remove" data-table="${tableIndex}" data-row="${rowIndex}" data-cell="${cellIndex}" type="button">删除</button>
                  </div>
                `
              )
              .join('')}
          </div>
        `
      )
      .join('');

    return `
      <div class="table-card">
        <div class="builder-head">
          <input data-table="${tableIndex}" data-field="title" value="${context.escapeHtml(table.title || '')}" placeholder="表格标题，例如 Product Specifications" />
          <button class="mini-button danger" data-action="tables:remove" data-index="${tableIndex}" type="button">删除参数表</button>
        </div>
        <div class="table-toolbar">
          <button class="mini-button" data-action="table:column:add" data-table="${tableIndex}" type="button">添加列</button>
          <button class="mini-button" data-action="table:row:add" data-table="${tableIndex}" type="button">添加行</button>
          <button class="mini-button" data-action="table:header-row:add" data-table="${tableIndex}" type="button">添加复杂表头</button>
        </div>
        ${headerEditor}
        <div class="table-scroll">
          <table class="edit-table">
            <thead>
              <tr>
                ${columns
                  .map(
                    (column, columnIndex) => `
                      <th>
                        <input data-table="${tableIndex}" data-column="${columnIndex}" value="${context.escapeHtml(column)}" placeholder="列名" />
                        <button class="mini-button danger" data-action="table:column:remove" data-table="${tableIndex}" data-column="${columnIndex}" type="button">删列</button>
                      </th>
                    `
                  )
                  .join('')}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row, rowIndex) => `
                    <tr>
                      ${columns
                        .map(
                          (_, columnIndex) => `
                            <td><input data-table="${tableIndex}" data-row="${rowIndex}" data-cell="${columnIndex}" value="${context.escapeHtml(row[columnIndex] || '')}" placeholder="单元格" /></td>
                          `
                        )
                        .join('')}
                      <td><button class="mini-button danger" data-action="table:row:remove" data-table="${tableIndex}" data-row="${rowIndex}" type="button">删行</button></td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const renderProductReviews = () => {
    const list = context.$('productReviewList');
    if (!list) return;
    list.innerHTML = context.state.formData.reviews.map((review, index) => `
      <fieldset style="border:0;padding:12px 0;margin:0;">
        <div class="builder-head">
          <label class="toggle"><input type="checkbox" data-product-review="${index}" data-field="published" ${review.published !== false ? 'checked' : ''} /><span>显示该评价</span></label>
          <button class="mini-button danger" data-action="reviews:remove" data-index="${index}" type="button">删除评价</button>
        </div>
        <div class="form">
          <div class="field"><label>评价人<input data-product-review="${index}" data-field="buyerLabel" value="${context.escapeHtml(review.buyerLabel || '')}" required /></label></div>
          <div class="field"><label>星级<select data-product-review="${index}" data-field="rating">${![1, 2, 3, 4, 5].includes(Number(review.rating)) ? '<option value="" selected>选择星级</option>' : ''}${[5, 4, 3, 2, 1].map(rating => `<option value="${rating}" ${String(review.rating) === String(rating) ? 'selected' : ''}>${rating} 星</option>`).join('')}</select></label></div>
          <div class="field is-wide"><label>评价内容<textarea data-product-review="${index}" data-field="quote" required>${context.escapeHtml(review.quote || '')}</textarea></label></div>
          <div class="field"><label>评价日期（选填）<input type="date" data-product-review="${index}" data-field="date" value="${context.escapeHtml(review.date || '')}" /></label></div>
        </div>
      </fieldset>`).join('');
  };

  const renderProductBuilders = () => {
    renderProductReviews();
    renderSingleTextList('galleryList', 'galleryImages', '产品主图链接');
    renderDetailImages();
    renderSingleTextList('applicationsList', 'applications', '应用场景');
    renderSpecs();
    renderSingleTextList('highlightsList', 'highlights', '产品亮点');
    renderFaqs();
    renderSpecTables();
  };

  const showProductBrowser = () => {
    context.$('productBrowserView').classList.add('is-visible');
    context.$('productEditorView').classList.remove('is-visible');
  };

  const showProductEditor = () => {
    context.$('productBrowserView').classList.remove('is-visible');
    context.$('productEditorView').classList.add('is-visible');
  };

  const selectProduct = (slug, draft) => {
    const currentProduct = context.state.products.find(item => item.slug === slug);
    const product = draft ? { ...draft.payload, slug } : currentProduct;
    if (!product) return;
    context.state.activeSlug = slug;
    context.state.activeDraftId = draft?.id || '';
    context.state.isNewProduct = Boolean(draft) && !context.state.products.some(item => item.slug === slug);
    context.$('title').value = product.title || '';
    context.$('productSlug').value = product.slug || '';
    context.$('productSlug').readOnly = true;
    context.$('offeringType').value = currentProduct?.offeringType || context.productEditorPolicy.offeringType;
    context.$('modelStrategy').value = currentProduct?.modelStrategy || context.productEditorPolicy.modelStrategy;
    context.$('category').value = product.category || '';
    context.$('series').value = product.series || '';
    context.$('sortOrder').value = product.sortOrder || 9999;
    context.$('published').checked = product.published !== false;
    context.$('featured').checked = product.featured === true;
    context.$('image').value = product.image || '';
    context.updateImageFieldPreview('image');
    context.$('description').value = product.description || '';
    context.setRichTextValue('productContent', product.content || '');
    setFormData(product);
    renderProductBuilders();
    renderProducts();
    renderDrafts();
    showProductEditor();
    context.setStatus('statusText', `正在编辑${draft ? '草稿' : ''}：${product.title}`);
  };

  const startNewProduct = () => {
    context.state.activeSlug = '';
    context.state.activeDraftId = '';
    context.state.isNewProduct = true;
    context.$('title').value = '';
    context.$('productSlug').value = '';
    context.$('productSlug').readOnly = false;
    context.$('offeringType').value = context.productEditorPolicy.offeringType;
    context.$('modelStrategy').value = context.productEditorPolicy.modelStrategy;
    context.$('category').value = context.state.categories[0] || '';
    context.$('series').value = '';
    context.$('sortOrder').value = 9999;
    context.$('published').checked = false;
    context.$('featured').checked = false;
    context.$('image').value = '';
    context.updateImageFieldPreview('image');
    context.$('description').value = '';
    context.setRichTextValue('productContent', '');
    if (context.$('aggregateRatingValue')) context.$('aggregateRatingValue').value = '';
    if (context.$('aggregateRatingCount')) context.$('aggregateRatingCount').value = 0;
    context.state.formData = {
      reviews: [],
      galleryImages: [],
      detailImages: [],
      applications: [''],
      specs: [{ label: '', value: '' }],
      specTables: [
        {
          title: 'Product Specifications',
          columns: ['Model', 'Specification'],
          headerRows: [],
          rows: [['', '']],
        },
      ],
      highlights: [''],
      faqs: [],
    };
    renderProductBuilders();
    renderProducts();
    renderDrafts();
    showProductEditor();
    context.setStatus('statusText', '正在新建产品草稿。页面标识保存后将用于生成产品页面。');
  };

  const renderDrafts = () => {
    const drafts = context.state.activeSlug
      ? context.state.drafts.filter(draft => draft.productSlug === context.state.activeSlug)
      : context.state.drafts.slice(0, 10);
    context.$('draftList').innerHTML = drafts.length
      ? drafts
          .map(
            draft => `
              <div class="draft">
                <span>
                  <strong>${context.escapeHtml(draft.productTitle)}</strong>
                  <small>${context.escapeHtml(draft.status)} · ${context.formatDate(draft.updatedAt)}</small>
                </span>
                <button class="button secondary" data-product-draft-edit="${context.escapeHtml(draft.id)}" type="button">继续编辑</button>
                <button class="button secondary" data-apply="${context.escapeHtml(draft.id)}" type="button">应用到网站内容</button>
              </div>
            `
          )
          .join('')
      : '<div class="draft"><span><strong>暂无草稿</strong><small>保存草稿后会显示在这里。</small></span></div>';
  };

  const loadProducts = async () => {
    const data = await context.requestJson('/api/manager/products');
    context.state.products = data.products || [];
    context.state.categories = data.categories || [];
    context.$('managerEmail').textContent = data.manager?.email || '已连接';
    fillCategoryOptions();
    renderProducts();
    renderProductOrder();
  };

  const loadDrafts = async () => {
    const data = await context.requestJson('/api/manager/product-drafts');
    context.state.drafts = data.drafts || [];
    renderDrafts();
  };

  const loadDraftsSafely = async () => {
    try {
      await loadDrafts();
    } catch (error) {
      context.state.drafts = [];
      renderDrafts();
      context.setStatus('statusText', error.message || '草稿暂时无法加载，请联系网站负责人检查后台配置。', true);
    }
  };

  const productToPayload = (product, sortOrder = product.sortOrder) => ({
    ...(product.reviews === undefined ? {} : { reviews: product.reviews }),
    aggregateRatingValue: product.aggregateRatingValue ?? '',
    aggregateRatingCount: product.aggregateRatingCount ?? 0,
    productSlug: product.slug,
    title: product.title,
    description: product.description,
    category: product.category,
    series: product.series,
    sortOrder: Number(sortOrder || product.sortOrder || 9999),
    published: product.published !== false,
    image: product.image || '',
    featured: product.featured === true,
    galleryImages: product.galleryImages || [],
    detailImages: product.detailImages || [],
    applications: product.applications || [],
    specs: product.specs || [],
    specTables: product.specTables || [],
    highlights: product.highlights || [],
    faqs: product.faqs || [],
    content: product.content || '',
  });

  const saveOrderDrafts = async () => {
    const changes = [...context.state.orderChanges.entries()]
      .map(([slug, sortOrder]) => {
        const product = context.state.products.find(item => item.slug === slug);
        return product ? { product, sortOrder } : null;
      })
      .filter(Boolean);

    if (!changes.length) {
      context.setStatus('orderStatus', '还没有修改产品权重。', true);
      return;
    }

    context.setStatus('orderStatus', `正在保存 ${changes.length} 个排序草稿...`);
    for (const item of changes) {
      await context.requestJson('/api/manager/product-drafts', {
        method: 'POST',
        body: JSON.stringify({ payload: productToPayload(item.product, item.sortOrder) }),
      });
    }
    context.state.orderChanges.clear();
    await loadDrafts();
    renderProductOrder();
    context.setStatus('orderStatus', '排序草稿已保存，请在产品内容页检查后应用到网站内容。');
  };

  const getPayload = () => {
    syncProductMainImage();
    return {
      ...Object.fromEntries(context.productEditorFields.map(({ name, kind }) => {
        const field = context.$(name);
        return [name, kind === 'checkbox' ? field.checked : kind === 'number' ? Number(field.value || 9999) : kind === 'text' ? field.value.trim() : field.value];
      })),
      ...(context.managerReviewSystemEnabled ? {
        reviews: context.state.formData.reviews,
        aggregateRatingValue: context.$('aggregateRatingValue').value.trim(),
        aggregateRatingCount: Number(context.$('aggregateRatingCount').value || 0),
      } : {}),
      productSlug: context.$('productSlug').value.trim().toLowerCase(),
      content: context.getRichTextValue('productContent').trim(),
      offeringType: context.$('offeringType').value,
      modelStrategy: context.$('modelStrategy').value,
      galleryImages: editableGalleryImages({ galleryImages: context.state.formData.galleryImages }),
      detailImages: context.state.formData.detailImages,
      applications: context.state.formData.applications,
      specs: context.state.formData.specs,
      specTables: context.state.formData.specTables,
      highlights: context.state.formData.highlights,
      faqs: context.state.formData.faqs,
    };
  };

  const syncProductFormInput = target => {
    if (target.dataset.productReview !== undefined) {
      const review = context.state.formData.reviews[Number(target.dataset.productReview)];
      if (review) review[target.dataset.field] = target.type === 'checkbox' ? target.checked : target.value;
      return;
    }
    if (target.id === 'image') {
      context.updateImageFieldPreview('image');
      return;
    }
    if (target.dataset.list) {
      context.state.formData[target.dataset.list][Number(target.dataset.index)] = target.value;
      if (target.dataset.list === 'galleryImages') {
        syncProductMainImage();
        const preview = target.closest('.form-row')?.querySelector('[data-inline-image-preview]');
        if (preview) {
          const value = target.value.trim();
          preview.innerHTML = context.thumbnailMarkup(value, '产品主图');
          preview.dataset.inlineImagePreview = value;
          preview.title = value || '当前没有图片';
          preview.disabled = !value;
        }
      }
      return;
    }
    if (target.dataset.specIndex !== undefined) {
      const item = context.state.formData.specs[Number(target.dataset.specIndex)];
      if (item) item[target.dataset.field] = target.value;
      return;
    }
    if (target.dataset.detailIndex !== undefined) {
      const item = context.state.formData.detailImages[Number(target.dataset.detailIndex)];
      if (item) item[target.dataset.field] = target.value;
      return;
    }
    if (target.dataset.faqIndex !== undefined) {
      const item = context.state.formData.faqs[Number(target.dataset.faqIndex)];
      if (item) item[target.dataset.field] = target.value;
      return;
    }
    if (target.dataset.table !== undefined) {
      const table = context.state.formData.specTables[Number(target.dataset.table)];
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

  const ensureRowWidth = (table, width) => {
    table.rows = (table.rows || []).map(row => {
      const next = [...row];
      while (next.length < width) next.push('');
      return next.slice(0, width);
    });
  };

  const handleProductAction = actionButton => {
    const action = actionButton.dataset.action;
    const index = Number(actionButton.dataset.index);
    if (!action) return;

    if (action === 'gallery:add') context.state.formData.galleryImages.push('');
    if (action === 'reviews:add') context.state.formData.reviews.push({ buyerLabel: '', rating: '5', quote: '', date: '', published: true });
    if (action === 'reviews:remove') context.state.formData.reviews.splice(index, 1);
    if (action === 'galleryImages:remove') {
      context.state.formData.galleryImages.splice(index, 1);
      syncProductMainImage();
    }
    if (action === 'detail:add') context.state.formData.detailImages.push({ image: '', title: '', caption: '' });
    if (action === 'detail:remove') context.state.formData.detailImages.splice(index, 1);
    if (action === 'applications:add') context.state.formData.applications.push('');
    if (action === 'applications:remove') context.state.formData.applications.splice(index, 1);
    if (action === 'specs:add') context.state.formData.specs.push({ label: '', value: '' });
    if (action === 'specs:remove') context.state.formData.specs.splice(index, 1);
    if (action === 'highlights:add') context.state.formData.highlights.push('');
    if (action === 'highlights:remove') context.state.formData.highlights.splice(index, 1);
    if (action === 'faqs:add') context.state.formData.faqs.push({ question: '', answer: '' });
    if (action === 'faqs:remove') context.state.formData.faqs.splice(index, 1);
    if (action === 'tables:add') {
      context.state.formData.specTables.push({
        title: 'Product Specifications',
        columns: ['Model', 'Specification'],
        headerRows: [],
        rows: [['', '']],
      });
    }
    if (action === 'tables:remove') context.state.formData.specTables.splice(index, 1);

    const tableIndex = Number(actionButton.dataset.table);
    const table = context.state.formData.specTables[tableIndex];
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
        ensureRowWidth(table, table.columns.length);
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

    renderProductBuilders();
  };

  const saveDraft = async () => {
    const payload = getPayload();
    if (!payload.productSlug) {
      context.setStatus('statusText', '请先填写产品页面标识。', true);
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.productSlug)) {
      context.setStatus('statusText', '页面标识只能使用小写英文、数字和短横线，例如 modular-control-cabinet。', true);
      return;
    }
    context.setStatus('statusText', '正在保存草稿...');
    const data = await context.requestJson('/api/manager/product-drafts', {
      method: 'POST',
      body: JSON.stringify({ id: context.state.activeDraftId, payload }),
    });
    context.state.activeDraftId = data.draft?.id || '';
    context.state.activeSlug = payload.productSlug;
    await loadDrafts();
    context.setStatus('statusText', '草稿已保存。');
  };

  const applyDraft = async draftId => {
    context.setStatus('statusText', '正在提交内容更新...');
    const data = await context.requestJson(`/api/manager/product-drafts/${encodeURIComponent(draftId)}/apply`, { method: 'POST' });
    await loadDrafts();
    context.setStatus('statusText', data.requestId ? '内容更新已提交，请稍后刷新查看。' : '内容更新已提交。');
  };
  Object.assign(context, { editableGalleryImages, syncProductMainImage, setProductMainImage, fillCategoryOptions, filteredProducts, filteredOrderProducts, renderProducts, setProductPage, renderProductOrder, setFormData, renderSingleTextList, renderSpecs, renderDetailImages, renderFaqs, renderSpecTables, renderSpecTable, renderProductReviews, renderProductBuilders, showProductBrowser, showProductEditor, selectProduct, startNewProduct, renderDrafts, loadProducts, loadDrafts, loadDraftsSafely, productToPayload, saveOrderDrafts, getPayload, syncProductFormInput, ensureRowWidth, handleProductAction, saveDraft, applyDraft });
}
