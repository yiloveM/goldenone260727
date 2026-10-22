export function installCore(context) {
  const state = {
    products: [],
    blogPosts: [],
    categories: [],
    drafts: [],
    blogDrafts: [],
    reviews: [],
    reviewDrafts: [],
    activeReviewDraftId: '',
    activeReviewData: {},
    orderChanges: new Map(),
    productPage: 1,
    activeSlug: '',
    activeDraftId: '',
    isNewProduct: false,
    activeBlogSlug: '',
    activeBlogDraftId: '',
    isNewBlog: false,
    assetPrefix: '',
    assetFiles: [],
    assetFolders: [],
    selectedAssetKeys: new Set(),
    cutAssetKeys: [],
    translationRequestId: '',
    translationTimer: null,
    translationDraftSyncKey: '',
    translationLastSourceType: 'all',
    publishRequestId: '',
    publishTimer: null,
    publishRecords: [],
    translationDrafts: [],
    imagePicker: {
      fieldId: '',
      listKey: '',
      richEditorId: '',
      detailIndex: null,
      prefix: '',
      files: [],
      folders: [],
    },
    previewImage: {
      url: '',
      name: '',
      key: '',
      canSelect: false,
      statusId: 'assetStatus',
    },
    translationEditor: {
      type: '',
      draftSlug: '',
      draft: null,
      returnTab: 'product-drafts',
    },
    translationFormData: {
      applications: [],
      specs: [],
      specTables: [],
      highlights: [],
      faqs: [],
    },
    richEditorSelection: null,
    themeChoice: localStorage.getItem('businessweb-manager-theme') || 'system',
    formData: {
      reviews: [],
      galleryImages: [],
      detailImages: [],
      applications: [],
      specs: [],
      specTables: [],
      highlights: [],
      faqs: [],
    },
  };

  const locales = [];

  const productPageSize = 12;

  const $ = id => document.getElementById(id);

  const publicContentUrl = (kind, item) => {
    const origin = new URL(String(context.publicSiteOrigin || '').trim() || location.origin);
    if (item?.publicUrl) {
      try {
        const supplied = new URL(item.publicUrl, origin);
        if (supplied.origin === origin.origin && supplied.protocol === origin.protocol) return supplied.href;
      } catch { /* Older or invalid API metadata uses the canonical route below. */ }
    }
    const slug = String(item?.slug || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return '#';
    return new URL(kind === 'blog' ? `/blog/${slug}/` : `/products/${slug}/`, origin).href;
  };

  const analyticsLink = $('managerAnalyticsLink');
  Object.assign(context, { publicContentUrl });

  const escapeHtml = value =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const setStatus = (id, message, isError = false) => {
    const node = $(id);
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  };

  const formatDate = value => (value ? new Date(value).toLocaleString() : '暂无时间');

  const formatBytes = bytes => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '-';
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const toDateTimeLocal = value => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.valueOf())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  };

  const fromDateTimeLocal = value => {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
  };

  const authHeaders = () => ({});

  const portalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const portalApiUrl = value => {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return value;
    const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
    if (portalUuidPattern.test(firstSegment)) url.pathname = `/${firstSegment}${url.pathname}`;
    return `${url.pathname}${url.search}${url.hash}`;
  };

  const apiResponseMessage = text => {
    const value = String(text || '').trim();
    if (value.startsWith('Admin portal configuration is unavailable')) {
      return '后台暂时无法连接，请稍后重试；如仍无法使用，请联系系统维护人员。';
    }
    if (value === 'Not found.') {
      return '登录已过期。请关闭此页面，并从完整入口重新登录。';
    }
    if (/站长|Cloudflare|\bD1\b|\bR2\b|GitHub|Keystatic|Token|Secret|Worker|workflow|repository|branch|Actions|\bAPI\b|JSON|UUID|slug|database|publishing|permission|configuration|deployment/i.test(value)) {
      return '操作暂时无法完成，请稍后重试；如持续出现，请联系系统维护人员。';
    }
    if (/^[\x00-\x7F\s]+$/.test(value)) return '操作暂时无法完成，请稍后重试。';
    return value;
  };

  const parseJsonResponse = (text, fallback) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(apiResponseMessage(text) || fallback);
    }
  };

  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

  const resolveTheme = choice => (choice === 'system' ? (themeMedia.matches ? 'dark' : 'light') : choice);

  const themeLabels = { light: '浅色', dark: '深色', system: '跟随系统' };

  const setThemeMenuOpen = open => {
    const menu = $('themeMenu');
    const trigger = $('themeMenuButton');
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.closest('.theme-switch')?.classList.toggle('is-open', open);
  };

  const applyTheme = choice => {
    const safeChoice = ['light', 'dark', 'system'].includes(choice) ? choice : 'system';
    state.themeChoice = safeChoice;
    localStorage.setItem('businessweb-manager-theme', safeChoice);
    document.documentElement.dataset.theme = resolveTheme(safeChoice);
    $('themeMenuLabel').textContent = themeLabels[safeChoice] || themeLabels.system;
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.themeOption === safeChoice);
    });
    setThemeMenuOpen(false);
  };

  const requestJson = async (url, options = {}) => {
    const response = await fetch(portalApiUrl(url), {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(apiResponseMessage(text) || '请求未完成，请稍后重试。');
    return parseJsonResponse(text, '后台返回内容无法识别，请刷新页面后重试。');
  };

  const requestForm = async (url, formData) => {
    const response = await fetch(portalApiUrl(url), { method: 'POST', body: formData, headers: authHeaders() });
    const text = await response.text();
    if (!response.ok) throw new Error(apiResponseMessage(text) || '请求未完成，请稍后重试。');
    return parseJsonResponse(text, '后台返回内容无法识别，请刷新页面后重试。');
  };

  const addPreviewBase = html => {
    if (/<base\s/i.test(html)) return html;
    const base = `<base href="${escapeHtml(window.location.origin)}/">`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
  };

  const openAuthenticatedPreview = async (url, statusId = 'translationEditorStatus') => {
    if (!url || url === '#') {
      setStatus(statusId, '当前没有可预览的草稿。', true);
      return;
    }
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = '正在加载预览';
      previewWindow.document.body.innerHTML =
        '<p style="font-family: system-ui, sans-serif; padding: 24px; color: #344054;">正在加载翻译草稿预览...</p>';
    }
    setStatus(statusId, '正在打开预览...');
    try {
      const response = await fetch(portalApiUrl(url), { headers: authHeaders() });
      const html = await response.text();
      if (!response.ok) throw new Error(html || `Request failed: ${response.status}`);
      const objectUrl = URL.createObjectURL(new Blob([addPreviewBase(html)], { type: 'text/html;charset=utf-8' }));
      let openedWindow = previewWindow && !previewWindow.closed ? previewWindow : null;
      if (openedWindow) openedWindow.location.href = objectUrl;
      else {
        openedWindow = window.open(objectUrl, '_blank');
        if (openedWindow) openedWindow.opener = null;
      }
      if (!openedWindow) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('浏览器拦截了预览窗口，请允许弹窗后重试。');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setStatus(statusId, '预览已打开。');
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.document.body.innerHTML = `<p style="font-family: system-ui, sans-serif; padding: 24px; color: #b42318;">${escapeHtml(
          error.message || '预览打开失败。'
        )}</p>`;
      }
      setStatus(statusId, error.message || '预览打开失败。', true);
    }
  };

  const renderHealth = checks => {
    void checks;
  };

  const setConnectedUi = (connected, detail = '') => {
    $('connectionPanel').hidden = false;
    $('managerEmail').hidden = false;
    $('connectionPanel').classList.toggle('is-connected', connected);
    $('connectionTitle').textContent = connected ? '内容后台已连接' : '连接内容后台';
    $('connectionDetail').textContent = connected
      ? detail || '当前登录状态正常。'
      : detail || '登录已过期，请关闭此页面并从负责人提供的完整入口重新登录。';
  };

  const checkManagerStatus = async () => {
    try {
      const data = await requestJson('/api/manager/status');
      $('managerEmail').textContent = data.manager?.email || '已连接';
      setConnectedUi(true);
      return true;
    } catch (error) {
      $('managerEmail').textContent = '未连接';
      setConnectedUi(false, error.message);
      return false;
    }
  };

  const activePanel = () => document.querySelector('.section.is-active')?.dataset.panel || '';

  const activateTab = tab => {
    if (tab === 'reviews' && !context.managerReviewSystemEnabled) return;
    const activeNavTab = tab === 'translation-editor' ? state.translationEditor.returnTab || context.translationDraftTabForType(state.translationEditor.type) : tab;
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('is-active', button.dataset.tab === activeNavTab));
    document.querySelectorAll('.section').forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tab));
    if (tab === 'products') context.showProductBrowser();
    if (tab === 'blog') context.showBlogBrowser();
    if (tab === 'images' && !state.assetFiles.length && !state.assetFolders.length) context.loadAssets().catch(error => setStatus('assetStatus', error.message, true));
    if (tab === 'publish' && !state.publishRecords.length) context.loadPublishHistory().catch(error => setStatus('publishStatus', error.message, true));
    if (tab === 'blog' && !state.blogPosts.length) {
      Promise.all([context.loadBlogPosts(), context.loadBlogDrafts()]).catch(error => setStatus('blogStatus', error.message, true));
    }
    if (tab === 'reviews' && !state.reviews.length && !state.reviewDrafts.length) {
      context.loadReviews().catch(error => setStatus('reviewStatus', error.message, true));
    }
    if (tab === 'product-drafts') context.loadTranslationDrafts('product').catch(error => setStatus('productDraftStatus', error.message, true));
    if (tab === 'blog-drafts') context.loadTranslationDrafts('blog').catch(error => setStatus('blogDraftStatus', error.message, true));
  };

  const cloneArray = value => JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
  Object.assign(context, { state, locales, productPageSize, $, analyticsLink, escapeHtml, setStatus, formatDate, formatBytes, toDateTimeLocal, fromDateTimeLocal, authHeaders, portalUuidPattern, portalApiUrl, apiResponseMessage, parseJsonResponse, themeMedia, resolveTheme, themeLabels, setThemeMenuOpen, applyTheme, requestJson, requestForm, addPreviewBase, openAuthenticatedPreview, renderHealth, setConnectedUi, checkManagerStatus, activePanel, activateTab, cloneArray });
}
