import { installFormalContent } from './formal-content.mjs';
import { installWorkDrafts } from './work-drafts.mjs';
import { installCore } from './core.mjs';
import { installMedia } from './media.mjs';
import { installRichText } from './rich-text.mjs';
import { installTranslations } from './translations.mjs';
import { installProducts } from './products.mjs';
import { installArticles } from './articles.mjs';
import { installReviews } from './reviews.mjs';
import { installPublishing } from './publishing.mjs';
import { installVisuals } from './visuals.mjs';
import { installWorkspace } from './workspace.mjs';
import { installSorting } from './sorting.mjs';

const instances = new WeakMap();

export function initializeManager(config) {
  if (instances.has(document)) return instances.get(document);
  const context = { ...config };
  instances.set(document, context);
  // Cross-feature callbacks resolve through context after every installer runs.
  installCore(context);
  installMedia(context);
  installRichText(context);
  installTranslations(context);
  installProducts(context);
  installArticles(context);
  installReviews(context);
  installPublishing(context);
  installWorkDrafts(context);
  installFormalContent(context);
  installVisuals(context);
  installSorting(context);
  installWorkspace(context);
  const bootstrapManager = async () => {
    await context.loadProducts();
    await context.loadDraftsSafely();
    document.documentElement.dataset.managerReady = 'true';
    context.activateTab('dashboard');
    context.refreshWorkspace().catch(() => {});
    context.restoreTranslationTask().catch(error => { context.setStatus('translationStatus',error.message,true); context.updateTranslationOverview(); });
    if (context.managerReviewSystemEnabled && new URLSearchParams(window.location.search).get('section') === 'reviews') context.activateTab('reviews');
  };
  Object.assign(context, { bootstrapManager });
  const runButtonAction = async (button, action) => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { return await action(); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  };
  if (context.analyticsLink) context.analyticsLink.href = `${window.location.pathname.replace(/\/+$/, '')}/analytics`;

  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => context.activateTab(button.dataset.tab)));

  context.$('searchInput').addEventListener('input', () => {
    context.state.productPage = 1;
    context.renderProducts();
  });

  context.$('categoryFilter').addEventListener('change', () => {
    context.state.productPage = 1;
    context.renderProducts();
  });

  context.$('productPagination').addEventListener('click', event => {
    const button = event.target.closest('[data-product-page]');
    if (button && !button.disabled) context.setProductPage(button.dataset.productPage);
  });

  context.$('orderSearchInput').addEventListener('input', context.renderProductOrder);

  context.$('orderCategoryFilter').addEventListener('change', context.renderProductOrder);

  context.$('orderGrid').addEventListener('input', event => {
    const input = event.target.closest('[data-order-slug]');
    if (!input) return;
    const product = context.state.products.find(item => item.slug === input.dataset.orderSlug);
    const nextValue = Math.max(1, Math.round(Number(input.value || 1)));
    if (product && nextValue === Number(product.sortOrder)) context.state.orderChanges.delete(input.dataset.orderSlug);
    else context.state.orderChanges.set(input.dataset.orderSlug, nextValue);
    context.setStatus('orderStatus', `已修改 ${context.state.orderChanges.size} 个权重，保存后会生成排序草稿。`);
  });

  context.$('orderSaveButton').addEventListener('click', () => context.saveOrderDrafts().catch(error => context.setStatus('orderStatus', error.message, true)));

  context.$('blogLanguageFilter').addEventListener('change',context.renderBlogPosts);
  context.$('productLanguageFilter').addEventListener('change',()=>{context.state.productPage=1;context.renderProducts();});
  context.$('blogSearchInput').addEventListener('input', context.renderBlogPosts);

  context.$('blogForm').addEventListener('input', event => {
    if (event.target.id === 'blogImage') context.updateImageFieldPreview('blogImage');
  });

  context.$('blogRefreshButton').addEventListener('click', () => Promise.all([context.loadBlogPosts(), context.loadBlogDrafts()]).catch(error => context.setStatus('blogStatus', error.message, true)));

  context.$('newBlogButton').addEventListener('click', context.startNewBlog);
  context.$('blogList').addEventListener('click', event => {
    if (event.target.closest('[data-blog-view], input, [data-formal-delete]')) return;
    const row = event.target.closest('[data-blog-slug]');
    if (row) context.selectBlogPost(row.dataset.blogSlug,null,row.dataset.contentLocale || 'en').catch(error => context.setStatus('blogStatus', error.message, true));
  });

  context.$('saveBlogDraftButton').addEventListener('click', event => runButtonAction(event.currentTarget, context.saveBlogDraft).catch(error => context.setStatus('blogStatus', error.message, true)));

  context.$('reloadBlogDraftButton').addEventListener('click', () => context.loadBlogDrafts().catch(error => context.setStatus('blogStatus', error.message, true)));

  context.$('blogDraftWorkList').addEventListener('click', event => {
    const edit = event.target.closest('[data-blog-draft-edit]');
    const draft = edit && context.state.blogDrafts.find(item => item.id === edit.dataset.blogDraftEdit);
    if (draft) context.selectBlogPost(draft.blogSlug, draft).catch(error => context.setStatus('blogStatus', error.message, true));
    const button = event.target.closest('[data-blog-apply]');
    if (button) runButtonAction(button, () => context.applyBlogDraft(button.dataset.blogApply)).catch(error => context.setStatus('blogStatus', error.message, true));
  });

  context.$('productForm').addEventListener('input', event => context.syncProductFormInput(event.target));
  context.$('productForm').addEventListener('change', event => {
    if (event.target.id === 'image') context.setProductMainImage(event.target.value);
  });

  context.$('productForm').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button) context.handleProductAction(button);
  });

  context.$('productList').addEventListener('click', event => {
    if (event.target.closest('[data-product-view]') || event.target.closest('[data-product-published]')) return;
    const row = event.target.closest('[data-slug]');
    if (row) {
      const locale = row.dataset.contentLocale || 'en';
      if(locale === 'en') context.selectProduct(row.dataset.slug);
      else context.openTranslationDraftEditor('product',`${locale}--${row.dataset.slug}`,'products').catch(error=>context.setStatus('productBrowserStatus',error.message,true));
    }
  });

  context.$('productList').addEventListener('change', event => {
    const input = event.target.closest('[data-product-published]');
    if (!input) return;
    const product = context.state.products.find(item => item.slug === input.dataset.productPublished);
    if (!product) return;
    const desired = input.checked;
    input.disabled = true;
    context.requestJson('/api/manager/product-drafts', {
      method: 'POST',
      body: JSON.stringify({ payload: {...context.productToPayload(product), published:desired} }),
    })
      .then(async () => {
        context.state.productVisibilityDrafts.set(product.slug,desired);
        context.renderProducts();
        context.setStatus('productBrowserStatus', `${product.title} 已保存为${desired ? '上线' : '下线'}草稿，审核并发布网站更新后才会生效。`);
        await context.loadDrafts().catch(()=>context.setStatus('productBrowserStatus','显示设置草稿已保存；列表暂未同步，请稍后更新草稿列表。',true));
      })
      .catch(error => {
        context.renderProducts();
        context.setStatus('productBrowserStatus', error.message, true);
      });
  });

  context.$('draftList').addEventListener('click', event => {
    const edit = event.target.closest('[data-product-draft-edit]');
    const draft = edit && context.state.drafts.find(item => item.id === edit.dataset.productDraftEdit);
    if (draft) context.selectProduct(draft.productSlug, draft);
    const button = event.target.closest('[data-apply]');
    if (button) runButtonAction(button, () => context.applyDraft(button.dataset.apply)).catch(error => context.setStatus('statusText', error.message, true));
  });

  context.$('saveDraftButton').addEventListener('click', event => runButtonAction(event.currentTarget, context.saveDraft).catch(error => context.setStatus('statusText', error.message, true)));

  context.$('reloadButton').addEventListener('click', () => context.loadDrafts().catch(error => context.setStatus('statusText', error.message, true)));

  context.$('newProductButton').addEventListener('click', context.startNewProduct);

  context.$('productBackButton').addEventListener('click', context.showProductBrowser);

  context.$('blogBackButton').addEventListener('click', context.showBlogBrowser);

  context.$('reviewRefreshButton').addEventListener('click', () => context.loadReviews().catch(error => context.setStatus('reviewStatus', error.message, true)));

  context.$('newReviewButton').addEventListener('click', () => context.fillReviewForm({ rating: '5', published: true }));

  context.$('saveReviewDraftButton').addEventListener('click', event => runButtonAction(event.currentTarget, () => context.saveReviewDraft('upsert')).catch(error => context.setStatus('reviewStatus', error.message, true)));

  context.$('deleteReviewDraftButton').addEventListener('click', event => runButtonAction(event.currentTarget, () => context.saveReviewDraft('delete')).catch(error => context.setStatus('reviewStatus', error.message, true)));

  context.$('reviewList').addEventListener('click', event => {
    const button = event.target.closest('[data-review-id]');
    const review = button && context.state.reviews.find(item => item.id === button.dataset.reviewId);
    if (review) context.fillReviewForm(review);
  });

  context.$('reviewDraftList').addEventListener('click', event => {
    const edit = event.target.closest('[data-review-draft-edit]');
    if (edit) {
      const draft = context.state.reviewDrafts.find(item => item.id === edit.dataset.reviewDraftEdit);
      if (draft) context.fillReviewForm({ ...draft.payload, draftId: draft.id });
      return;
    }
    const apply = event.target.closest('[data-review-draft-apply]');
    if (apply) context.applyReviewDraft(apply.dataset.reviewDraftApply).catch(error => context.setStatus('reviewStatus', error.message, true));
  });

  context.$('assetRefreshButton').addEventListener('click', () => context.loadAssets().catch(error => context.setStatus('assetStatus', error.message, true)));
  const filterAssets=()=>{context.state.selectedAssetKeys.clear();context.renderAssets();};
  context.$('assetSearch').addEventListener('input', filterAssets);
  context.$('assetType').addEventListener('change', filterAssets);
  context.$('imagePickerSearch').addEventListener('input', context.renderImagePicker);
  context.$('assetLoadMore').addEventListener('click', event => runButtonAction(event.currentTarget, () => context.loadAssets(undefined, true)).catch(error => context.setStatus('assetStatus', error.message, true)));
  context.$('imagePickerLoadMore').addEventListener('click', event => runButtonAction(event.currentTarget, () => context.loadImagePickerAssets(undefined, true)).catch(error => context.setStatus('imagePickerStatus', error.message, true)));

  context.$('assetBackButton').addEventListener('click', () => context.loadAssets(context.parentPrefix(context.state.assetPrefix)).catch(error => context.setStatus('assetStatus', error.message, true)));

  context.$('assetNewFolderButton').addEventListener('click', () => context.createFolder().catch(error => context.setStatus('assetStatus', error.message, true)));

  context.$('assetUploadButton').addEventListener('click', () => context.$('assetUploadInput').click());

  context.$('assetUploadInput').addEventListener('change', event =>
    context.uploadAssets(event.target.files)
      .then(() => {
        event.target.value = '';
      })
      .catch(error => context.setStatus('assetStatus', error.message, true))
  );

  context.$('assetCutButton').addEventListener('click', context.cutSelectedAssets);

  context.$('assetPasteButton').addEventListener('click', () => context.pasteAssets().catch(error => context.setStatus('assetStatus', error.message, true)));

  context.$('assetGrid').addEventListener('click', event => {
    const upload = event.target.closest('[data-asset-upload]');
    if (upload) {
      context.$('assetUploadInput').click();
      return;
    }
    const folder = event.target.closest('[data-folder]');
    if (folder) {
      context.loadAssets(folder.dataset.folder).catch(error => context.setStatus('assetStatus', error.message, true));
      return;
    }
    const insertDocument = event.target.closest('[data-asset-insert-document]');
    if (insertDocument) {
      const editorId = context.state.richEditorSelection?.editorId;
      if (!editorId) {
        context.setStatus('assetStatus', 'Place the caret in a content editor before inserting a PDF reference.', true);
        return;
      }
      if (editorId === 'productContent') { context.activateTab('products'); context.showProductEditor(); }
      else if (editorId === 'blogBody') { context.activateTab('blog'); context.showBlogEditor(); }
      else context.activateTab('translation-editor');
      context.insertRichEditorDocument(editorId, insertDocument.dataset.assetInsertDocument, insertDocument.dataset.assetDocumentName);
      context.setStatus('assetStatus', 'PDF reference inserted into the current content editor.');
      return;
    }
    const preview = event.target.closest('[data-asset-preview]');
    if (preview) {
      context.openImagePreview({
        url: preview.dataset.assetPreview,
        name: preview.dataset.assetName,
        key: preview.dataset.assetKey,
        statusId: 'assetStatus',
      });
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      context.copyText(copy.dataset.copy, 'assetStatus', copy);
      return;
    }
    const del = event.target.closest('[data-delete]');
    if (del) {
      context.deleteAsset(del.dataset.delete).catch(error => context.setStatus('assetStatus', error.message, true));
    }
  });

  context.$('assetGrid').addEventListener('change', event => {
    const checkbox = event.target.closest('[data-asset-check]');
    if (!checkbox) return;
    if (checkbox.checked) context.state.selectedAssetKeys.add(checkbox.dataset.assetCheck);
    else context.state.selectedAssetKeys.delete(checkbox.dataset.assetCheck);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.theme-switch')) context.setThemeMenuOpen(false);

    const imageFieldPreview = event.target.closest('[data-image-field-preview]');
    if (imageFieldPreview) {
      context.openImagePreview({
        url: imageFieldPreview.dataset.previewUrl,
        name: imageFieldPreview.dataset.imageFieldPreview === 'blogImage' ? '文章封面' : '产品主图',
        statusId: imageFieldPreview.dataset.previewStatus || 'assetStatus',
      });
      return;
    }

    const inlineImagePreview = event.target.closest('[data-inline-image-preview]');
    if (inlineImagePreview && inlineImagePreview.dataset.inlineImagePreview) {
      context.openImagePreview({
        url: inlineImagePreview.dataset.inlineImagePreview,
        name: '产品主图',
        statusId: 'statusText',
      });
      return;
    }

    const fieldButton = event.target.closest('[data-image-field]');
    if (fieldButton) {
      context.openImagePicker({
        fieldId: fieldButton.dataset.imageField,
        title: fieldButton.dataset.imageTitle || '选择图片',
      }).catch(error => context.setStatus('imagePickerStatus', error.message, true));
      return;
    }

    const listButton = event.target.closest('[data-image-list]');
    if (listButton) {
      context.openImagePicker({
        listKey: listButton.dataset.imageList,
        detailIndex: Number(listButton.dataset.index),
        title: '选择产品相册图',
      }).catch(error => context.setStatus('imagePickerStatus', error.message, true));
      return;
    }

    const detailButton = event.target.closest('[data-image-detail]');
    if (detailButton) {
      context.openImagePicker({
        detailIndex: Number(detailButton.dataset.imageDetail),
        title: '选择详情页宣传图',
      }).catch(error => context.setStatus('imagePickerStatus', error.message, true));
      return;
    }
  });

  context.$('imagePickerCloseButton').addEventListener('click', context.closeImagePicker);

  context.$('imagePicker').addEventListener('click', event => {
    if (event.target === context.$('imagePicker')) context.closeImagePicker();
  });

  context.$('imagePickerBackButton').addEventListener('click', () => context.loadImagePickerAssets(context.parentPrefix(context.state.imagePicker.prefix)).catch(error => context.setStatus('imagePickerStatus', error.message, true)));

  context.$('imagePickerRefreshButton').addEventListener('click', () => context.loadImagePickerAssets(context.state.imagePicker.prefix).catch(error => context.setStatus('imagePickerStatus', error.message, true)));

  context.$('imagePickerUploadButton').addEventListener('click', () => context.$('imagePickerUploadInput').click());

  context.$('imagePickerUploadInput').addEventListener('change', event =>
    context.uploadPickerAssets(event.target.files)
      .then(() => {
        event.target.value = '';
      })
      .catch(error => context.setStatus('imagePickerStatus', error.message, true))
  );

  context.$('imagePickerGrid').addEventListener('click', event => {
    const folder = event.target.closest('[data-picker-folder]');
    if (folder) {
      context.loadImagePickerAssets(folder.dataset.pickerFolder).catch(error => context.setStatus('imagePickerStatus', error.message, true));
      return;
    }
    const preview = event.target.closest('[data-picker-preview]');
    if (preview) {
      context.openImagePreview({
        url: preview.dataset.pickerPreview,
        name: preview.dataset.pickerName,
        key: preview.dataset.pickerKey,
        canSelect: true,
        statusId: 'imagePickerStatus',
      });
      return;
    }
    const select = event.target.closest('[data-picker-select]');
    if (select) {
      context.pickImage(select.dataset.pickerSelect);
      return;
    }
    const copy = event.target.closest('[data-picker-copy]');
    if (copy) context.copyText(copy.dataset.pickerCopy, 'imagePickerStatus', copy);
  });

  context.$('imagePreviewCloseButton').addEventListener('click', context.closeImagePreview);

  context.$('imagePreview').addEventListener('click', event => {
    if (event.target === context.$('imagePreview')) context.closeImagePreview();
  });

  context.$('imagePreviewUseButton').addEventListener('click', () => {
    if (!context.state.previewImage.url) return;
    context.pickImage(context.state.previewImage.url);
    context.closeImagePreview();
  });

  context.$('imagePreviewCopyButton').addEventListener('click', () => {
    if (context.state.previewImage.url) context.copyText(context.state.previewImage.url, context.state.previewImage.statusId || 'assetStatus', context.$('imagePreviewCopyButton'));
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    context.setThemeMenuOpen(false);
    if (context.$('imagePreview').classList.contains('is-open')) {
      context.closeImagePreview();
      return;
    }
    if (context.$('translationEditor').classList.contains('is-active')) {
      context.closeTranslationEditor();
      return;
    }
    if (context.$('imagePicker').classList.contains('is-open')) context.closeImagePicker();
  });

  context.$('translationSubmitButton').addEventListener('click', () => context.submitTranslation().catch(error => context.setStatus('translationStatus', error.message, true)));

  context.$('translationStatusButton').addEventListener('click', () => context.pollTranslationStatus().catch(error => context.setStatus('translationStatus', error.message, true)));

  context.$('translationLocaleSelectAll').addEventListener('change', event => context.setAllLocales(event.target.checked));

  context.$('translationLocaleInvert').addEventListener('change', context.invertLocales);

  context.$('localeGrid').addEventListener('change', event => {
    if (event.target.matches('input[type="checkbox"]')) context.syncLocaleBulkControls();
  });

  document.addEventListener('click', event => {
    const previewLink = event.target instanceof Element ? event.target.closest('[data-auth-preview]') : null;
    if (!previewLink) return;
    event.preventDefault();
    context.openAuthenticatedPreview(
      previewLink.dataset.authPreview || previewLink.getAttribute('href') || '#',
      previewLink.dataset.previewStatus || 'translationEditorStatus'
    );
  });

  for (const type of ['product','blog']) {
    const fail = error => context.setStatus(`${type}DraftStatus`,error.message,true);
    context.$(`${type}DraftSelectAll`).addEventListener('change', event => context.toggleAllTranslationDrafts(type,event.target.checked));
    context.$(`${type}DraftDeleteButton`).addEventListener('click', () => context.deleteTranslationDrafts(type).catch(fail));
    context.$(`${type}DraftList`).addEventListener('change', () => context.syncTranslationSelection(type));
    for (const [suffix,event] of [['Search','input'],['Locale','change']]) context.$(`${type}Draft${suffix}`).addEventListener(event, () => context.renderTranslationDrafts(type));
  }
  context.$('productDraftRefreshButton').addEventListener('click', () => context.loadTranslationDrafts('product').catch(error => context.setStatus('productDraftStatus', error.message, true)));

  context.$('productDraftApproveButton').addEventListener('click', () => context.approveTranslationDrafts('product').catch(error => context.setStatus('productDraftStatus', error.message, true)));

  context.$('productDraftIncludePublished').addEventListener('change', () => context.loadTranslationDrafts('product').catch(error => context.setStatus('productDraftStatus', error.message, true)));

  context.$('productDraftList').addEventListener('click', context.handleTranslationDraftListClick);

  context.$('blogDraftRefreshButton').addEventListener('click', () => context.loadTranslationDrafts('blog').catch(error => context.setStatus('blogDraftStatus', error.message, true)));

  context.$('blogDraftApproveButton').addEventListener('click', () => context.approveTranslationDrafts('blog').catch(error => context.setStatus('blogDraftStatus', error.message, true)));

  context.$('blogDraftIncludePublished').addEventListener('change', () => context.loadTranslationDrafts('blog').catch(error => context.setStatus('blogDraftStatus', error.message, true)));

  context.$('blogDraftList').addEventListener('click', context.handleTranslationDraftListClick);

  context.$('translationEditorCloseButton').addEventListener('click', context.closeTranslationEditor);

  context.$('translationEditorCancelButton').addEventListener('click', context.closeTranslationEditor);

  context.$('translationEditorSaveButton').addEventListener('click', () => context.saveTranslationDraftEditor().catch(error => context.setStatus('translationEditorStatus', error.message, true)));

  context.$('translationEditorApproveButton').addEventListener('click', () => {
    context.$('translationEditPublished').checked = true;
    context.saveTranslationDraftEditor({ publish: true }).catch(error => context.setStatus('translationEditorStatus', error.message, true));
  });

  context.$('translationEditorForm').addEventListener('input', event => context.syncTranslationFormInput(event.target));

  context.$('translationEditorForm').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button) context.handleTranslationAction(button);
  });

  context.$('publishButton').addEventListener('click', () => context.submitPublish().catch(error => context.setStatus('publishStatus', error.message, true)));

  context.$('publishHistoryButton').addEventListener('click', () => context.loadPublishHistory().catch(error => context.setStatus('publishStatus', error.message, true)));

  context.$('publishDeleteButton').addEventListener('click', () => context.deletePublishRecords().catch(error => context.setStatus('publishStatus', error.message, true)));

  context.$('themeMenuButton').addEventListener('click', event => {
    event.stopPropagation();
    context.setThemeMenuOpen(context.$('themeMenu').hidden);
  });

  document.querySelectorAll('[data-theme-option]').forEach(button => {
    button.addEventListener('click', () => context.applyTheme(button.dataset.themeOption));
  });

  context.themeMedia.addEventListener('change', () => {
    if (context.state.themeChoice === 'system') context.applyTheme('system');
  });

  context.initializeRichEditors();

  context.ensureImageFieldPreview('image', 'statusText');

  context.ensureImageFieldPreview('blogImage', 'blogStatus');

  context.loadTranslationLocales().catch(error => {
    context.locales.splice(0, context.locales.length);
    context.renderLocaleOptions();
    context.setStatus('translationStatus', error.message, true);
  });

  context.applyTheme(context.state.themeChoice);

  context.checkManagerStatus()
    .then(connected => {
      if (connected) return bootstrapManager();
    })
    .catch(error => context.setConnectedUi(false, error.message));
  return context;
}
