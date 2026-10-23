import { confirmDialog, promptDialog } from '../../lib/admin-dialog.mjs';
import { adminMediaUrl } from '../../lib/admin-media-url.mjs';
export function installMedia(context) {
  const normalizeThumbnailUrl = value => {
    return adminMediaUrl(value, context.publicR2AssetBaseUrl, context.publicSiteOrigin, { temporary: true, objectKey: true });
  };

  const thumbnailMarkup = (value, alt = '') => {
    const src = normalizeThumbnailUrl(value);
    if (!src) return '<span class="thumb-frame thumb-frame--empty" aria-hidden="true"></span>';
    return `<span class="thumb-frame"><img src="${context.escapeHtml(src)}" alt="${context.escapeHtml(alt)}" loading="lazy" decoding="async" /></span>`;
  };

  const syncModalLock = () => {
    const hasOpen = ['imagePicker', 'imagePreview'].some(id => context.$(id)?.classList.contains('is-open'));
    document.body.classList.toggle('has-modal', hasOpen);
  };

  const updateImageFieldPreview = fieldId => {
    const input = context.$(fieldId);
    const button = context.$(`${fieldId}PreviewButton`);
    if (!input || !button) return;
    const value = input.value.trim();
    button.innerHTML = thumbnailMarkup(value, input.getAttribute('aria-label') || fieldId);
    button.disabled = !value;
    button.title = value ? value : '当前没有图片';
    button.dataset.previewUrl = value;
  };

  const ensureImageFieldPreview = (fieldId, statusId = 'assetStatus') => {
    const input = context.$(fieldId);
    if (!input) return;
    const wrapper = input.closest('.input-action');
    if (!wrapper) return;
    wrapper.classList.add('image-field-control');
    let button = context.$(`${fieldId}PreviewButton`);
    if (!button) {
      button = document.createElement('button');
      button.id = `${fieldId}PreviewButton`;
      button.className = 'field-image-preview';
      button.type = 'button';
      button.dataset.imageFieldPreview = fieldId;
      button.dataset.previewStatus = statusId;
      button.setAttribute('aria-label', '预览当前图片');
      input.insertAdjacentElement('afterend', button);
    }
    updateImageFieldPreview(fieldId);
  };

  const openImagePreview = ({ url, name = '', key = '', canSelect = false, statusId = 'assetStatus' }) => {
    const sourceUrl = String(url || '').trim();
    const previewUrl = normalizeThumbnailUrl(sourceUrl);
    if (!previewUrl) {
      context.setStatus(statusId, '当前没有可预览的图片。', true);
      return;
    }
    context.state.previewImage = {
      url: sourceUrl,
      name: name || key || sourceUrl,
      key,
      canSelect,
      statusId,
    };
    context.$('imagePreviewImage').src = previewUrl;
    context.$('imagePreviewImage').alt = context.state.previewImage.name;
    context.$('imagePreviewName').textContent = context.state.previewImage.name;
    context.$('imagePreviewUrl').textContent = sourceUrl;
    context.$('imagePreviewOpenLink').href = previewUrl;
    context.$('imagePreviewUseButton').hidden = !canSelect;
    context.$('imagePreview').classList.add('is-open');
    context.$('imagePreview').setAttribute('aria-hidden', 'false');
    syncModalLock();
  };

  const closeImagePreview = () => {
    context.$('imagePreview').classList.remove('is-open');
    context.$('imagePreview').setAttribute('aria-hidden', 'true');
    context.$('imagePreviewImage').removeAttribute('src');
    syncModalLock();
  };

  const parentPrefix = prefix => {
    const parts = prefix.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `${parts.join('/')}/` : '';
  };

  const renderAssets = () => {
    context.$('assetPath').textContent = context.state.assetPrefix || '根目录';
    const term = (context.$('assetSearch')?.value || '').trim().toLowerCase(), kind = context.$('assetType')?.value || '';
    const folders = context.state.assetFolders.filter(item => !term || item.name.toLowerCase().includes(term))
      .map(
        folder => `
          <button class="asset-card is-folder" data-folder="${context.escapeHtml(folder.prefix)}" type="button">
            <span class="folder-icon" aria-hidden="true"></span>
            <div dir="auto" class="asset-name" title="${context.escapeHtml(folder.prefix)}">${context.escapeHtml(folder.name)}</div>
            <div class="asset-meta">文件夹</div>
          </button>
        `
      )
      .join('');
    const files = context.state.assetFiles.filter(file => (!term || file.name.toLowerCase().includes(term)) && (!kind || (kind === 'image' ? file.isImage : file.isDocument)))
      .map(
        file => `
          <div class="asset-card">
            <input class="asset-check" data-asset-check="${context.escapeHtml(file.key)}" type="checkbox" ${context.state.selectedAssetKeys.has(file.key) ? 'checked' : ''} />
            ${
              file.isImage
                ? `<button class="asset-card__preview" data-asset-preview="${context.escapeHtml(file.url)}" data-asset-name="${context.escapeHtml(file.name)}" data-asset-key="${context.escapeHtml(file.key)}" type="button" aria-label="预览 ${context.escapeHtml(file.name)}">${thumbnailMarkup(file.url, file.name)}</button>`
                : file.isDocument
                  ? `<a class="asset-document" href="${context.escapeHtml(file.url)}" target="_blank" rel="noopener" aria-label="Open ${context.escapeHtml(file.name)} PDF">PDF</a>`
                  : `<div class="asset-placeholder">文件</div>`
            }
            <div dir="auto" class="asset-name" title="${context.escapeHtml(file.key)}">${context.escapeHtml(file.name)}</div>
            <div class="asset-meta">${context.escapeHtml(context.formatBytes(file.size))}</div>
            <div class="asset-tools">
              <button data-copy="${context.escapeHtml(file.url)}" type="button" title="复制文件链接">复制</button>
              ${file.isDocument ? `<button data-asset-insert-document="${context.escapeHtml(file.url)}" data-asset-document-name="${context.escapeHtml(file.name)}" type="button" title="把文件链接插入当前编辑内容">插入</button>` : ''}
              <button data-delete="${context.escapeHtml(file.key)}" type="button">删除</button>
            </div>
          </div>
        `
      )
      .join('');
    const uploadTile = `
      <button class="asset-card asset-card--upload" data-asset-upload type="button">
        <span class="upload-icon" aria-hidden="true"></span>
        <div dir="auto" class="asset-name">上传媒体</div>
        <div class="asset-meta">当前文件夹</div>
      </button>
    `;
    context.$('assetGrid').innerHTML = uploadTile + folders + files || '<div class="notice"><span><strong>当前文件夹为空</strong><small>可以上传图片、PDF 或新建文件夹。</small></span></div>';
  };

  let assetLoadSerial = 0;
  const loadAssets = async (prefix = context.state.assetPrefix, append = false) => {
    const serial = ++assetLoadSerial;
    const cursor = append ? context.state.assetCursor || '' : '';
    context.setStatus('assetStatus', '正在加载媒体资源...');
    const data = await context.requestJson(`/api/manager/r2/assets?prefix=${encodeURIComponent(prefix)}&limit=300${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (serial !== assetLoadSerial) return;
    if (data.truncated && (!data.cursor || data.cursor === cursor)) throw new Error('文件列表未完整返回，请稍后重新加载。');
    context.state.assetPrefix = data.prefix || '';
    context.state.assetCursor = data.truncated ? data.cursor : '';
    context.state.assetFolders = [...new Map([...(append ? context.state.assetFolders : []), ...(data.folders || [])].map(item => [item.prefix, item])).values()];
    context.state.assetFiles = [...new Map([...(append ? context.state.assetFiles : []), ...(data.files || [])].map(item => [item.key, item])).values()];
    if (!append) context.state.selectedAssetKeys.clear();
    context.$('assetLoadMore').hidden = !context.state.assetCursor;
    renderAssets();
    context.setStatus('assetStatus', `已加载 ${context.state.assetFolders.length} 个文件夹、${context.state.assetFiles.length} 个文件。${context.state.assetCursor ? '搜索当前已加载内容，可继续加载更多。' : '已加载当前目录全部内容。'}`);
  };

  const renderImagePicker = () => {
    context.$('imagePickerPath').textContent = context.state.imagePicker.prefix || '根目录';
    const term = (context.$('imagePickerSearch')?.value || '').trim().toLowerCase();
    const folders = context.state.imagePicker.folders.filter(item => !term || item.name.toLowerCase().includes(term))
      .map(
        folder => `
          <button class="image-picker-card is-folder" data-picker-folder="${context.escapeHtml(folder.prefix)}" type="button">
            <span class="folder-icon" aria-hidden="true"></span>
            <strong title="${context.escapeHtml(folder.prefix)}">${context.escapeHtml(folder.name)}</strong>
            <small>文件夹</small>
          </button>
        `
      )
      .join('');
    const files = context.state.imagePicker.files
      .filter(file => file.isImage && (!term || file.name.toLowerCase().includes(term)))
      .map(
        file => `
          <article class="image-picker-card">
            <button class="image-card-preview" data-picker-preview="${context.escapeHtml(file.url)}" data-picker-name="${context.escapeHtml(file.name)}" data-picker-key="${context.escapeHtml(file.key)}" type="button" aria-label="预览 ${context.escapeHtml(file.name)}">
              ${thumbnailMarkup(file.url, file.name)}
            </button>
            <strong title="${context.escapeHtml(file.key)}">${context.escapeHtml(file.name)}</strong>
            <small>${context.escapeHtml(context.formatBytes(file.size))}</small>
            <div class="image-picker-actions">
              <button class="mini-button" data-picker-select="${context.escapeHtml(file.url)}" type="button">选择</button>
              <button class="mini-button" data-picker-copy="${context.escapeHtml(file.url)}" type="button" title="复制文件链接">复制</button>
            </div>
          </article>
        `
      )
      .join('');
    context.$('imagePickerGrid').innerHTML =
      folders + files || '<div class="notice"><span><strong>当前文件夹没有图片</strong><small>请进入其它文件夹或先在图片池上传。</small></span></div>';
  };

  let pickerLoadSerial = 0;
  const loadImagePickerAssets = async (prefix = context.state.imagePicker.prefix, append = false) => {
    const serial = ++pickerLoadSerial, cursor = append ? context.state.imagePicker.cursor || '' : '';
    context.setStatus('imagePickerStatus', '正在加载图片...');
    const data = await context.requestJson(`/api/manager/r2/assets?prefix=${encodeURIComponent(prefix)}&limit=300${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (serial !== pickerLoadSerial) return;
    if (data.truncated && (!data.cursor || data.cursor === cursor)) throw new Error('图片列表未完整返回，请稍后重新加载。');
    context.state.imagePicker.prefix = data.prefix || '';
    context.state.imagePicker.cursor = data.truncated ? data.cursor : '';
    context.state.imagePicker.folders = [...new Map([...(append ? context.state.imagePicker.folders : []), ...(data.folders || [])].map(item => [item.prefix, item])).values()];
    context.state.imagePicker.files = [...new Map([...(append ? context.state.imagePicker.files : []), ...(data.files || [])].map(item => [item.key, item])).values()];
    context.$('imagePickerLoadMore').hidden = !context.state.imagePicker.cursor;
    renderImagePicker();
    context.setStatus('imagePickerStatus', `已加载 ${context.state.imagePicker.folders.length} 个文件夹、${context.state.imagePicker.files.filter(file => file.isImage).length} 张图片。${context.state.imagePicker.cursor ? '搜索当前已加载内容，可继续加载更多。' : '已加载当前目录全部图片。'}`);
  };

  const openImagePicker = async options => {
    const prefix = context.state.imagePicker.prefix || '';
    context.state.imagePicker = {
      onSelect: options.onSelect,
      fieldId: options.fieldId || '',
      listKey: options.listKey || '',
      richEditorId: options.richEditorId || '',
      detailIndex: options.detailIndex ?? null,
      prefix,
      files: [],
      folders: [],
    };
    context.$('imagePickerTitle').textContent = options.title || '选择图片';
    context.$('imagePicker').classList.add('is-open');
    context.$('imagePicker').setAttribute('aria-hidden', 'false');
    syncModalLock();
    await loadImagePickerAssets(prefix);
  };

  const closeImagePicker = () => {
    context.$('imagePicker').classList.remove('is-open');
    context.$('imagePicker').setAttribute('aria-hidden', 'true');
    syncModalLock();
  };

  const pickImage = url => {
    if (context.state.imagePicker.onSelect) { context.state.imagePicker.onSelect(url); closeImagePicker(); return; }
    if (context.state.imagePicker.fieldId) {
      context.$(context.state.imagePicker.fieldId).value = url;
      if (context.state.imagePicker.fieldId === 'image') context.setProductMainImage(url);
      else updateImageFieldPreview(context.state.imagePicker.fieldId);
      context.$(context.state.imagePicker.fieldId).dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (context.state.imagePicker.listKey) {
      context.state.formData[context.state.imagePicker.listKey][Number(context.state.imagePicker.detailIndex)] = url;
      if (context.state.imagePicker.listKey === 'galleryImages') context.syncProductMainImage();
      context.renderProductBuilders();
    }
    if (context.state.imagePicker.richEditorId) {
      context.insertRichEditorImage(context.state.imagePicker.richEditorId, url);
    }
    if (context.state.imagePicker.detailIndex !== null && !context.state.imagePicker.listKey) {
      const item = context.state.formData.detailImages[Number(context.state.imagePicker.detailIndex)];
      if (item) {
        item.image = url;
        context.renderProductBuilders();
      }
    }
    closeImagePicker();
  };

  const createFolder = async () => {
    const name = await promptDialog('请输入新文件夹名称');
    if (!name) return;
    const cleanName = name.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanName) return;
    await context.requestJson('/api/manager/r2/assets', {
      method: 'PUT',
      body: JSON.stringify({ prefix: `${context.state.assetPrefix}${cleanName}/` }),
    });
    await loadAssets();
  };

  const uploadAssets = async files => {
    if (!files?.length) return;
    const formData = new FormData();
    formData.append('prefix', context.state.assetPrefix);
    [...files].forEach(file => formData.append('files', file));
    context.setStatus('assetStatus', '正在上传媒体...');
    await context.requestForm('/api/manager/r2/assets', formData);
    await loadAssets();
    context.setStatus('assetStatus', '图片已上传。');
  };

  const uploadPickerAssets = async files => {
    if (!files?.length) return;
    const formData = new FormData();
    formData.append('prefix', context.state.imagePicker.prefix);
    [...files].forEach(file => formData.append('files', file));
    context.setStatus('imagePickerStatus', '正在上传图片...');
    await context.requestForm('/api/manager/r2/assets', formData);
    await loadImagePickerAssets(context.state.imagePicker.prefix);
    context.setStatus('imagePickerStatus', '图片已上传，可直接选择。');
  };

  const copyText = async (value, statusId = 'assetStatus', trigger = null) => {
    const originalText = trigger?.textContent || '';
    try {
      await navigator.clipboard.writeText(value);
      context.setStatus(statusId, '链接已复制。');
    } catch {
      await promptDialog('复制这个链接', value, {readOnly:true});
    }
    if (trigger) {
      trigger.textContent = '已复制';
      trigger.disabled = true;
      window.setTimeout(() => {
        trigger.textContent = originalText || '复制链接';
        trigger.disabled = false;
      }, 1600);
    }
  };

  const deleteAsset = async key => {
    if (!await confirmDialog(`确认删除这个文件？\n${key}`)) return;
    await context.requestJson('/api/manager/r2/assets', { method: 'DELETE', body: JSON.stringify({ key }) });
    await loadAssets();
  };

  const cutSelectedAssets = () => {
    context.state.cutAssetKeys = [...context.state.selectedAssetKeys];
    context.setStatus('assetStatus', context.state.cutAssetKeys.length ? `已剪切 ${context.state.cutAssetKeys.length} 个文件。` : '请先勾选需要移动的文件。', !context.state.cutAssetKeys.length);
  };

  const pasteAssets = async () => {
    if (!context.state.cutAssetKeys.length) {
      context.setStatus('assetStatus', '没有已剪切的文件。', true);
      return;
    }
    await context.requestJson('/api/manager/r2/assets', {
      method: 'PATCH',
      body: JSON.stringify({ keys: context.state.cutAssetKeys, targetPrefix: context.state.assetPrefix }),
    });
    context.state.cutAssetKeys = [];
    await loadAssets();
  };
  Object.assign(context, { normalizeThumbnailUrl, thumbnailMarkup, syncModalLock, updateImageFieldPreview, ensureImageFieldPreview, openImagePreview, closeImagePreview, parentPrefix, renderAssets, loadAssets, renderImagePicker, loadImagePickerAssets, openImagePicker, closeImagePicker, pickImage, createFolder, uploadAssets, uploadPickerAssets, copyText, deleteAsset, cutSelectedAssets, pasteAssets });
}
