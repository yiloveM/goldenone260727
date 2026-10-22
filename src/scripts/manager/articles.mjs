import { articleCategoryLabel, canonicalArticleCategory } from '../../lib/article-categories.mjs';
export function installArticles(context) {
  const filteredBlogPosts = () => {
    const term = context.$('blogSearchInput').value.trim().toLowerCase();
    const language = context.$('blogLanguageFilter').value, category = context.$('blogCategoryFilter').value;
    return context.state.blogPosts.flatMap(post => [post, ...(post.translations || [])]).filter(post => (!language || (post.locale || 'en') === language) && (!category || post.category === category) && (!term || `${post.title} ${post.slug} ${post.category}`.toLowerCase().includes(term)));
  };

  const renderBlogPosts = () => {
    const posts = filteredBlogPosts();
    context.$('blogCount').textContent = `${posts.length} 篇文章`;
    context.$('blogList').innerHTML = posts.length
      ? `
          <div class="blog-list-head">
            <span>文章标题</span>
            <span>发表时间</span>
            <span>文章分类</span>
            <span>操作</span>
          </div>
          ${posts
            .map(
              post => `
                <article class="blog-list-row ${post.slug === context.state.activeBlogSlug ? 'is-active' : ''}" data-blog-slug="${context.escapeHtml(post.slug)}" data-content-locale="${context.escapeHtml(post.locale || 'en')}">
                  <span class="formal-title">${context.formalCheckbox('blog',post)}<button class="blog-list-title" title="${context.escapeHtml(post.title)}" type="button">${context.escapeHtml(post.title)}</button></span>
                  <span class="blog-list-date">${context.formatDate(post.publishDate)}</span>
                  <span class="blog-list-category">${context.escapeHtml(post.locale || 'en')} · ${context.escapeHtml(articleCategoryLabel(post.category,'zh'))}</span>
                  <span class="record-actions"><a class="blog-list-view" data-blog-view href="${context.escapeHtml(context.publicContentUrl('blog', post))}" target="_blank" rel="noreferrer">前端查看</a>${context.formalDeleteButton('blog',post)}</span>
                </article>
              `
            )
            .join('')}
        `
      : '<div class="notice"><span><strong>没有匹配文章</strong><small>请换一个关键词。</small></span></div>';
    context.setStatus('blogStatus', `当前显示 ${posts.length} 篇文章。`);
    context.syncFormalSelection('blog');
  };

  const loadBlogPosts = async () => {
    context.setStatus('blogStatus', '正在加载文章...');
    const data = await context.requestJson('/api/manager/blog');
    context.state.blogPosts = data.posts || [];
    const filter = context.$('blogLanguageFilter'), previous = filter.value;
    filter.innerHTML = '<option value="en">English</option><option value="">全部公开语言</option>' + [...new Set(context.state.blogPosts.flatMap(post => post.translations || []).map(item => item.locale))].map(code=>`<option value="${context.escapeHtml(code)}">${context.escapeHtml(code)}</option>`).join('');
    filter.value = [...filter.options].some(option=>option.value===previous) ? previous : 'en';
    context.$('blogCatalogStatus').textContent = data.warning || '已读取最新文章目录。';
    renderBlogPosts();
  };

  const loadBlogDrafts = async () => {
    const data = await context.requestJson('/api/manager/blog-drafts');
    context.state.blogDrafts = data.drafts || [];
    renderBlogWorkDrafts();
  };

  const loadBlogDraftsSafely = async () => {
    try {
      await loadBlogDrafts();
    } catch (error) {
      context.state.blogDrafts = [];
      renderBlogWorkDrafts();
      context.setStatus('blogStatus', error.message || '文章草稿暂时无法加载，请联系网站负责人检查后台配置。', true);
    }
  };

  const showBlogBrowser = () => {
    context.$('blogBrowserView').classList.add('is-visible');
    context.$('blogEditorView').classList.remove('is-visible');
  };

  const showBlogEditor = () => {
    context.$('blogBrowserView').classList.remove('is-visible');
    context.$('blogEditorView').classList.add('is-visible');
  };

  let selection = 0;
  const selectBlogPost = async (slug, draft, locale = 'en') => {
    const variant = context.state.blogPosts.flatMap(post => [post,...(post.translations || [])]).find(post => post.slug === slug && (post.locale || 'en') === locale);
    if (!draft && locale !== 'en' && variant?.collection === 'blogTranslations') return context.openTranslationDraftEditor('blog',variant.id,'blog');
    const pending = ++selection;
    context.setStatus('blogStatus', '正在读取最新文章...');
    const post = draft ? { ...draft.payload, slug } : (await context.requestJson(`/api/manager/blog?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`)).post;
    if (pending !== selection) return;
    if (!post) return;
    context.state.activeBlogSlug = slug;
    context.state.activeBlogDraftId = draft?.id || '';
    context.state.isNewBlog = Boolean(draft) && !context.state.blogPosts.some(item => item.slug === slug);
    context.state.activeBlogSourceSha = post.sourceSha || '';
    context.$('blogTitle').value = post.title || '';
    context.$('blogSlug').value = post.slug || '';
    context.$('blogSlug').readOnly = true;
    context.$('blogCategory').value = canonicalArticleCategory(post.category);
    context.$('blogCategory').disabled=false;
    context.$('blogPublishDate').value = context.toDateTimeLocal(post.publishDate);
    context.$('blogAuthor').value = post.author || 'Golden One Editorial Team';
    context.$('blogFeatured').checked = post.featured === true;
    context.$('blogImage').value = post.image || '';
    context.updateImageFieldPreview('blogImage');
    context.$('blogDescription').value = post.description || '';
    context.setRichTextValue('blogBody', post.body || '');
    context.$('viewBlogButton').href = post.publicUrl || context.publicContentUrl('blog', context.state.blogPosts.find(item => item.slug === slug) || post);
    renderBlogPosts();
    renderBlogWorkDrafts();
    showBlogEditor();
    context.setStatus('blogStatus', `正在编辑${draft ? '草稿' : ''}：${post.title}`);
  };

  const startNewBlog = () => {
    context.$('blogCategory').disabled=false;
    ++selection;
    context.state.activeBlogSourceSha = '';
    context.state.activeBlogSlug = '';
    context.state.activeBlogDraftId = '';
    context.state.isNewBlog = true;
    context.$('blogTitle').value = '';
    context.$('blogSlug').value = '';
    context.$('blogSlug').readOnly = false;
    context.$('blogCategory').value = 'other-articles';
    context.$('blogPublishDate').value = context.toDateTimeLocal(new Date().toISOString());
    context.$('blogAuthor').value = 'Golden One Editorial Team';
    context.$('blogFeatured').checked = false;
    context.$('blogImage').value = '';
    context.updateImageFieldPreview('blogImage');
    context.$('blogDescription').value = '';
    context.setRichTextValue('blogBody', '');
    context.$('viewBlogButton').href = '#';
    renderBlogPosts();
    renderBlogWorkDrafts();
    showBlogEditor();
    context.setStatus('blogStatus', '正在新建文章草稿。页面标识保存后将用于生成文章页面。');
  };

  const getBlogPayload = () => ({
    blogSlug: context.$('blogSlug').value.trim().toLowerCase(),
    title: context.$('blogTitle').value.trim(),
    description: context.$('blogDescription').value.trim(),
    category: context.$('blogCategory').value.trim(),
    image: context.$('blogImage').value.trim(),
    author: context.$('blogAuthor').value.trim() || 'Golden One Editorial Team',
    publishDate: context.fromDateTimeLocal(context.$('blogPublishDate').value),
    featured: context.$('blogFeatured').checked,
    body: context.getRichTextValue('blogBody').trim(),
    ...(context.state.activeBlogSourceSha ? {sourceSha:context.state.activeBlogSourceSha} : {}),
  });

  const saveBlogDraft = async () => {
    const payload = getBlogPayload();
    if (!payload.blogSlug) {
      context.setStatus('blogStatus', '请先填写文章页面标识。', true);
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.blogSlug)) {
      context.setStatus('blogStatus', '页面标识只能使用小写英文、数字和短横线。', true);
      return;
    }
    context.setStatus('blogStatus', '正在保存文章草稿...');
    const data = await context.requestJson('/api/manager/blog-drafts', {
      method: 'POST',
      body: JSON.stringify({ id: context.state.activeBlogDraftId, updatedAt: context.state.blogDrafts.find(item=>item.id===context.state.activeBlogDraftId)?.updatedAt, payload }),
    });
    context.state.activeBlogDraftId = data.draft?.id || '';
    context.state.activeBlogSlug = payload.blogSlug;
    await loadBlogDrafts();
    context.setStatus('blogStatus', '文章草稿已保存。');
  };

  const renderBlogWorkDrafts = () => {
    const drafts = context.state.activeBlogSlug
      ? context.state.blogDrafts.filter(draft => draft.blogSlug === context.state.activeBlogSlug)
      : context.state.blogDrafts;
    const visible = drafts.filter(draft=>context.workDraftVisible('blog',draft));
    context.$('blogDraftWorkList').innerHTML = visible.length
      ? visible
          .map(
            draft => `
              <div class="draft work-draft-record">${context.workDraftCheckbox('blog',draft)}
                <span>
                  <strong>${context.escapeHtml(draft.blogTitle)}</strong>
                  <small>en · ${context.escapeHtml(context.workDraftStatus(draft.status))} · ${context.formatDate(draft.updatedAt)}</small>
                </span>
<span class="record-actions">                <button class="button secondary" ${context.workDraftBusy(draft.status) ? 'disabled' : ''} data-blog-draft-edit="${context.escapeHtml(draft.id)}" type="button">继续编辑</button>
                <button class="button secondary" ${context.workDraftBusy(draft.status) || draft.status === 'applied' ? 'disabled' : ''} data-blog-apply="${context.escapeHtml(draft.id)}" type="button">应用到网站内容</button>
              ${context.workDraftActions('blog',draft)}</span>
              </div>
            `
          )
          .join('')
      : '<div class="draft"><span><strong>暂无文章草稿</strong><small>保存文章草稿后会显示在这里。</small></span></div>';
    context.syncWorkDraftControls('blog');
  };

  const applyBlogDraft = async draftId => {
    context.setStatus('blogStatus', '正在提交内容更新...');
    const data = await context.requestJson(`/api/manager/blog-drafts/${encodeURIComponent(draftId)}/apply`, { method: 'POST' });
    await loadBlogDrafts();
    context.setStatus('blogStatus', data.requestId ? '内容更新已提交，请稍后刷新查看。' : '内容更新已提交。');
  };
  Object.assign(context, { filteredBlogPosts, renderBlogPosts, loadBlogPosts, loadBlogDrafts, loadBlogDraftsSafely, showBlogBrowser, showBlogEditor, selectBlogPost, startNewBlog, getBlogPayload, saveBlogDraft, renderBlogWorkDrafts, applyBlogDraft });
}
