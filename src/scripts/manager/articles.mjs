export function installArticles(context) {
  const filteredBlogPosts = () => {
    const term = context.$('blogSearchInput').value.trim().toLowerCase();
    return context.state.blogPosts.filter(post => !term || `${post.title} ${post.category}`.toLowerCase().includes(term));
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
                <article class="blog-list-row ${post.slug === context.state.activeBlogSlug ? 'is-active' : ''}" data-blog-slug="${context.escapeHtml(post.slug)}">
                  <button class="blog-list-title" title="${context.escapeHtml(post.title)}" type="button">${context.escapeHtml(post.title)}</button>
                  <span class="blog-list-date">${context.formatDate(post.publishDate)}</span>
                  <span class="blog-list-category">${context.escapeHtml(post.category || '未分类')}</span>
                  <a class="blog-list-view" data-blog-view href="/blog/${context.escapeHtml(post.slug)}/" target="_blank" rel="noreferrer">前端查看</a>
                </article>
              `
            )
            .join('')}
        `
      : '<div class="notice"><span><strong>没有匹配文章</strong><small>请换一个关键词。</small></span></div>';
    context.setStatus('blogStatus', `当前显示 ${posts.length} 篇文章。`);
  };

  const loadBlogPosts = async () => {
    context.setStatus('blogStatus', '正在加载文章...');
    const data = await context.requestJson('/api/manager/blog');
    context.state.blogPosts = data.posts || [];
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

  const selectBlogPost = (slug, draft) => {
    const post = draft ? { ...draft.payload, slug } : context.state.blogPosts.find(item => item.slug === slug);
    if (!post) return;
    context.state.activeBlogSlug = slug;
    context.state.activeBlogDraftId = draft?.id || '';
    context.state.isNewBlog = Boolean(draft) && !context.state.blogPosts.some(item => item.slug === slug);
    context.$('blogTitle').value = post.title || '';
    context.$('blogSlug').value = post.slug || '';
    context.$('blogSlug').readOnly = true;
    context.$('blogCategory').value = post.category || '';
    context.$('blogPublishDate').value = context.toDateTimeLocal(post.publishDate);
    context.$('blogAuthor').value = post.author || 'Golden One Editorial Team';
    context.$('blogFeatured').checked = post.featured === true;
    context.$('blogImage').value = post.image || '';
    context.updateImageFieldPreview('blogImage');
    context.$('blogDescription').value = post.description || '';
    context.setRichTextValue('blogBody', post.body || '');
    context.$('viewBlogButton').href = `/blog/${post.slug}/`;
    renderBlogPosts();
    renderBlogWorkDrafts();
    showBlogEditor();
    context.setStatus('blogStatus', `正在编辑${draft ? '草稿' : ''}：${post.title}`);
  };

  const startNewBlog = () => {
    context.state.activeBlogSlug = '';
    context.state.activeBlogDraftId = '';
    context.state.isNewBlog = true;
    context.$('blogTitle').value = '';
    context.$('blogSlug').value = '';
    context.$('blogSlug').readOnly = false;
    context.$('blogCategory').value = '';
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
      body: JSON.stringify({ id: context.state.activeBlogDraftId, payload }),
    });
    context.state.activeBlogDraftId = data.draft?.id || '';
    context.state.activeBlogSlug = payload.blogSlug;
    await loadBlogDrafts();
    context.setStatus('blogStatus', '文章草稿已保存。');
  };

  const renderBlogWorkDrafts = () => {
    const drafts = context.state.activeBlogSlug
      ? context.state.blogDrafts.filter(draft => draft.blogSlug === context.state.activeBlogSlug)
      : context.state.blogDrafts.slice(0, 10);
    context.$('blogDraftWorkList').innerHTML = drafts.length
      ? drafts
          .map(
            draft => `
              <div class="draft">
                <span>
                  <strong>${context.escapeHtml(draft.blogTitle)}</strong>
                  <small>${context.escapeHtml(draft.status)} · ${context.formatDate(draft.updatedAt)}</small>
                </span>
                <button class="button secondary" data-blog-draft-edit="${context.escapeHtml(draft.id)}" type="button">继续编辑</button>
                <button class="button secondary" data-blog-apply="${context.escapeHtml(draft.id)}" type="button">应用到网站内容</button>
              </div>
            `
          )
          .join('')
      : '<div class="draft"><span><strong>暂无文章草稿</strong><small>保存文章草稿后会显示在这里。</small></span></div>';
  };

  const applyBlogDraft = async draftId => {
    context.setStatus('blogStatus', '正在提交内容更新...');
    const data = await context.requestJson(`/api/manager/blog-drafts/${encodeURIComponent(draftId)}/apply`, { method: 'POST' });
    await loadBlogDrafts();
    context.setStatus('blogStatus', data.requestId ? '内容更新已提交，请稍后刷新查看。' : '内容更新已提交。');
  };
  Object.assign(context, { filteredBlogPosts, renderBlogPosts, loadBlogPosts, loadBlogDrafts, loadBlogDraftsSafely, showBlogBrowser, showBlogEditor, selectBlogPost, startNewBlog, getBlogPayload, saveBlogDraft, renderBlogWorkDrafts, applyBlogDraft });
}
