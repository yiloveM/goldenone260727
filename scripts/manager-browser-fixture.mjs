import { build } from 'astro';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import YAML from 'yaml';
import { createHash } from 'node:crypto';
import { productDraftReviewFields, retainUneditedProductReviews, enforceProductEditorPolicy } from '../src/lib/product-editor.mjs';

export const testUuid = '11111111-2222-4333-8444-555555555555';
const date = '2026-10-18T00:00:00.000Z';
export const testPolicy = { offeringType: 'service', modelStrategy: 'not-applicable' };
const write = async (path, content) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); };
async function copyTree(source, target) {
  if (!existsSync(source)) return;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyTree(resolve(source, entry.name), resolve(target, entry.name));
    else { await mkdir(target, { recursive: true }); await copyFile(resolve(source, entry.name), resolve(target, entry.name)); }
  }
}

export async function buildManagerFixture(root, output, reviews, policy = testPolicy, label = reviews ? 'on' : 'off', analytics = true, profile = {governance:{contentOwner:'Manager regression'}}) {
  const fixture = resolve(output, label);
  for (const file of ['src/pages/manager/index.astro', 'src/lib/product-editor.mjs', 'src/lib/product-reviews.mjs', 'src/lib/json-ld.mjs', 'src/lib/admin-dialog.mjs', 'src/lib/content-links.mjs', 'src/lib/public-media-url.mjs', 'src/lib/admin-media-url.mjs', 'src/lib/article-categories.mjs', 'src/data/customerReviews.ts', 'src/data/site-origin.json']) {
    const source = await readFile(resolve(root, file), 'utf8');
    await write(resolve(fixture, file), file.endsWith('index.astro') ? source.replace("if (config) initializeManager(JSON.parse(config.textContent || '{}'));", "if (config) { initializeManager(JSON.parse(config.textContent || '{}')); initializeManager(JSON.parse(config.textContent || '{}')); }") : source);
  }
  for (const directory of ['src/styles', 'src/scripts/manager', 'src/components/manager']) {
    if (directory === 'src/styles') {
      if (existsSync(resolve(root, 'src/styles/manager.css'))) await write(resolve(fixture, 'src/styles/manager.css'), await readFile(resolve(root, 'src/styles/manager.css')));
    } else await copyTree(resolve(root, directory), resolve(fixture, directory));
  }
  await write(resolve(fixture, 'src/data/product-editor-settings.json'), JSON.stringify(policy));
  await write(resolve(fixture, 'src/pages/index.astro'), '<!doctype html><html lang="en"><body><main><h1>Public isolation fixture</h1></main></body></html>');
  await write(resolve(fixture, 'src/data/customer-reviews.json'), JSON.stringify({ enabled: reviews, summary: {}, reviews: [] }));
  await write(resolve(fixture, 'src/keystatic/analytics-dashboard.json'), JSON.stringify({ managerVisible: analytics }));
  await write(resolve(fixture, 'src/data/industry-profile.json'), JSON.stringify(profile));
  await build({ root: fixture, configFile: false, output: 'static', logLevel: 'error',
    vite: { build: { minify: false } }, outDir: resolve(fixture, 'dist'), cacheDir: resolve(fixture, '.astro-cache') });
  return resolve(fixture, 'dist');
}

async function loadNormalizer(root) {
  const file = resolve(root, 'src/lib/manager/d1.ts');
  let source = await readFile(file, 'utf8');
  source = source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (_, quote, path) => `from ${quote}${pathToFileURL(resolve(dirname(file), path)).href}${quote}`);
  return import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`);
}

export async function managerBackend(root, output) {
  const normalizer = await loadNormalizer(root);
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(resolve(root, 'manager-portal/schema.sql'), 'utf8'));
  await normalizer.ensureManagerSchema({ prepare: query => ({ run: async () => { db.exec(query); } }) });
  const sample = index => ({ slug: index ? `service-${index}` : 'sample-service', title: index ? `Service ${index}` : 'Website design', description: 'Business website design.',
    category: index > 6 ? 'Support' : 'Websites', series: '', offeringType: 'service', modelStrategy: 'not-applicable', sortOrder: index + 1,
    published: true, featured: false, image: '/fixture-image.svg', galleryImages: [], detailImages: [], applications: [], specs: [], specTables: [], highlights: [], faqs: [],
    reviews: [{ buyerLabel: 'Existing buyer', rating: '4', quote: 'Preserved draft feedback.', published: true }], content: 'Original service body.' });
  const products = Array.from({ length: 14 }, (_, index) => sample(index));
  const blogs = [{ slug: 'sample-article', title: 'Planning a website', description: 'Planning description.', category: 'technical-articles', image: '/fixture-image.svg', published: true, publishDate: date, body: 'Article body.' }];
  const assets = new Map([['product.png', { name: 'product.png', key: 'product.png', url: '/fixture-image.svg', size: 400, isImage: true }],
    ['catalog.pdf', { name: 'catalog.pdf', key: 'catalog.pdf', url: '/fixture.pdf', size: 200, isDocument: true }]]);
  const folders = new Set(['images/']);
  const translationDrafts = [{ type: 'product', draftSlug: 'es--sample-service', locale: 'es', sourceSlug: 'sample-service', sourceTitle: 'Website design', title: 'Diseño web',
    typeLabel: '产品', sourceSha:'1'.repeat(40), deleteAction:'delete', lifecycle:'pending', published: false, editable: true, generatedAt: date, previewUrl: `/api/manager/ai/draft-preview?type=product&draft=es--sample-service`,
    data: { title: 'Diseño web', description: 'Descripción', categoryName: 'Sitios web', series: '', published: false, specs: [], highlights: [], faqs: [] }, body: 'Contenido traducido.' }];
  const requests = [];
  const records = [];
  const content = resolve(output, 'write-back');
  await write(resolve(content, 'src/data/product-editor-settings.json'), JSON.stringify(testPolicy));
  await write(resolve(content, 'src/content/products/sample-service.mdoc'), `---\n${YAML.stringify({ ...products[0], customerField: 'preserve' })}---\nOriginal service body.\n`);
  await write(resolve(content, 'src/content/blog/sample-article.mdoc'), `---\n${YAML.stringify({ ...blogs[0], customerField: 'preserve' })}---\nOriginal article body.\n`);
  await write(resolve(content, 'src/data/customer-reviews.json'), '{"enabled":true,"summary":{},"reviews":[]}');
  const contentSha = async file => { const text=(await readFile(resolve(content,file),'utf8')).replace(/\r\n/g,'\n');return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex'); };
  for(const product of products)Object.assign(product,{locale:'en',sourcePath:`src/content/products/${product.slug}.mdoc`,sourceSha:createHash('sha1').update(product.slug).digest('hex')});
  products[0].sourceSha=await contentSha(products[0].sourcePath);
  Object.assign(blogs[0],{locale:'en',sourcePath:'src/content/blog/sample-article.mdoc',sourceSha:await contentSha('src/content/blog/sample-article.mdoc')});
  const applyScript = (script, variables) => {
    const applied = spawnSync(process.execPath, [resolve(root, 'scripts', script)], { cwd: content, encoding: 'utf8', env: { ...process.env, ...variables } });
    if (applied.status !== 0) throw new Error('Fixture write-back failed: ' + applied.stderr);
  };
  let sequence = 0;
  let writes = 0;
  let reviewsEnabled = true;
  let failPublish = true;
  let failSave = false;
  let policy = testPolicy;
  let authenticated = true;
  let enabledLocales = [{ value: 'es', label: 'Español' }, { value: 'ar', label: 'العربية' }];
  const failedApis = new Set();
  const draftRows = (type = 'product') => db.prepare(`SELECT * FROM manager_${type}_drafts ORDER BY updated_at DESC, id`).all().map(row =>
    type === 'product' ? normalizer.productDraftToResponse(row) : type === 'blog' ? normalizer.blogDraftToResponse(row) : normalizer.reviewDraftToResponse(row));
  const productDrafts = () => draftRows();
  const delayedApis = new Map();
  const visualDrafts = [], orderGroups = []; let workspace = { known: true, pending: 1, unpublished: 1, message: '审核通过的变更将在下一次网站发布后上线。' }, translationStatus = null;
  const visualSlots = [{ key:'home.primary',group:'home',title:'首页首屏',path:'/',fallback:'/fixture-image.svg',image:'',mobileImage:'',alt:'',localizedAlts:[],focusX:50,focusY:50 },{ key:'pages.about',group:'pages',title:'关于我们',path:'/about/',fallback:'/fixture-image.svg',image:'',mobileImage:'',alt:'',localizedAlts:[],focusX:50,focusY:50 }];
  const api = async (pathname, method, body, search) => {
    if(delayedApis.has(pathname)){const delay=delayedApis.get(pathname);delayedApis.delete(pathname);await new Promise(done=>setTimeout(done,delay));}
    requests.push({ path: pathname, method, ...(method === 'GET' ? {} : { body }) });
    if (!authenticated) throw Object.assign(new Error('登录已过期，请重新登录。'), { status: 403 });
    if (failedApis.delete(pathname)) throw new Error('连接暂时失败，请重试。');
    if (pathname.endsWith('/status')) return { ok: true, manager: { email: 'editor@example.test' }, checks: [] };
    if (pathname.endsWith('/workspace')) return workspace;
    if (pathname.endsWith('/site-visuals')) {
      if(method==='GET')return{baseSha:'a'.repeat(40),slots:visualSlots,locales:enabledLocales.map(item=>item.value).concat('en'),drafts:visualDrafts};
      if(method==='POST'){const old=visualDrafts.find(row=>row.id===body.id),row={id:old?.id||`visual-${crypto.randomUUID()}`,baseSha:body.baseSha,updatedAt:new Date().toISOString(),status:'draft',payload:body.payload};if(old)Object.assign(old,row);else visualDrafts.unshift(row);return{draft:row};}
      if(method==='DELETE'){const index=visualDrafts.findIndex(row=>row.id===body.id);if(index<0||visualDrafts[index].status==='queued')throw new Error('记录仍在处理');visualDrafts.splice(index,1);return{removed:1};}
      const row=visualDrafts.find(row=>row.id===body.id);row.status='applied';for(const item of row.payload.slots)Object.assign(visualSlots.find(slot=>slot.key===item.key),item);return{applied:true};
    }
    if(pathname.endsWith('/product-order')){
      if(method==='GET')return{groups:orderGroups};
      if(method==='POST'){const group={id:crypto.randomUUID(),category:body.category,status:'draft',records:body.records.map(item=>({id:item.slug,updatedAt:date,title:item.slug})),values:body.records};orderGroups.push(group);return{...group,message:'排序草稿已保存，请整批审核。'};}
      const group=orderGroups.find(group=>group.id===body.id);group.status='applied';for(const row of group.values){const product=products.find(item=>item.slug===row.slug);product.sortOrder=row.sortOrder;}return{applied:true};
    }
    if (/\/(product|blog)-deletion$/.test(pathname)) {
      const product=pathname.endsWith('/product-deletion'),list=product?products:blogs;
      if(method==='POST')return {head:'a'.repeat(40),kind:product?'product':'article',records:list.filter(row=>body.selection.some(item=>item.sourcePath===row.sourcePath)).map(row=>({...row,publicUrl:row.publicUrl||`https://fixture.test/${product?'products':'news'}/${row.slug}.html`}))};
      const paths=new Set(body.records.map(item=>item.sourcePath));for(let index=list.length-1;index>=0;index--)if(paths.has(list[index].sourcePath))list.splice(index,1);return {removed:paths.size,message:'删除已保存，下次发布后生效。'};
    }
    if (pathname.endsWith('/products')) return { products, categories: [...new Set(products.map(product => product.category))], editorPolicy: policy };
    if (pathname.endsWith('/blog')) return search.has('slug') ? {post:blogs.find(post=>post.slug===search.get('slug'))} : { posts: blogs };
    if (/\/(product|blog)-drafts$/.test(pathname)) {
      const type = pathname.includes('/blog-') ? 'blog' : 'product';
      if (method === 'GET') return { drafts: draftRows(type) };
      if (method === 'DELETE') { for (const row of body.records) db.prepare(`DELETE FROM manager_${type}_drafts WHERE id=? AND updated_at=?`).run(row.id,row.updatedAt); return {removed:body.records.length}; }
      if (failSave) { failSave = false; throw new Error('保存暂时失败，请重试。'); }
      const old = body.id ? draftRows(type).find(item => item.id === body.id)?.payload : undefined;
      const normalized = type === 'product' ? normalizer.normalizeProductDraftPayload(productDraftReviewFields(body.payload, reviewsEnabled)) : normalizer.normalizeBlogDraftPayload(body.payload);
      const payload = type === 'product' ? retainUneditedProductReviews(enforceProductEditorPolicy(normalized, policy, products.find(item => item.slug === normalized.productSlug)), old) : normalized;
      const id = body.id || `${type}-fixture-${++sequence}`;
      const slug = type === 'product' ? payload.productSlug : payload.blogSlug;
      const updatedAt = new Date(Date.parse(date) + ++writes).toISOString();
      db.prepare(`INSERT INTO manager_${type}_drafts (id,${type}_slug,${type}_title,payload_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='draft', payload_json=excluded.payload_json, ${type}_title=excluded.${type}_title, updated_at=excluded.updated_at`).run(id, slug, payload.title, JSON.stringify(payload), 'editor', 'editor', updatedAt, updatedAt);
      return { draft: draftRows(type).find(item => item.id === id) };
    }
    if (/\/(product|blog)-drafts\/[^/]+\/apply$/.test(pathname)) {
      const type = pathname.includes('/blog-') ? 'blog' : 'product';
      const draft = draftRows(type).find(item => item.id === decodeURIComponent(pathname.split('/').at(-2)));
      if (type === 'product') {
        applyScript('apply-manager-product-draft.mjs', { MANAGER_PRODUCT_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(draft.payload)).toString('base64'), MANAGER_PRODUCT_DRAFT_ID: draft.id });
        const document = await readFile(resolve(content, `src/content/products/${draft.payload.productSlug}.mdoc`), 'utf8');
        const metadata = YAML.parse(document.split(/^---\s*$/m)[1]);
        const product=products.find(item => item.slug === draft.payload.productSlug); if(product) Object.assign(product,metadata,{sourceSha:await contentSha(`src/content/products/${draft.payload.productSlug}.mdoc`)});
      } else applyScript('apply-manager-blog-draft.mjs', { MANAGER_BLOG_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(draft.payload)).toString('base64'), MANAGER_BLOG_DRAFT_ID: draft.id });
      db.prepare(`UPDATE manager_${type}_drafts SET status='applied' WHERE id=?`).run(draft.id);
      return { requestId: 'fixture-write-back' };
    }
    if (pathname.endsWith('/review-drafts')) {
      if (method === 'DELETE') {for(const row of body.records)db.prepare('DELETE FROM manager_review_drafts WHERE id=? AND updated_at=?').run(row.id,row.updatedAt);return {removed:body.records.length};}
      if (method === 'GET') return { settings: { enabled: reviewsEnabled }, reviews: JSON.parse(await readFile(resolve(content, 'src/data/customer-reviews.json'), 'utf8')).reviews, drafts: draftRows('review') };
      const payload = normalizer.normalizeReviewDraftPayload(body.payload);
      const id = body.id || `review-fixture-${++sequence}`;
      db.prepare('INSERT INTO manager_review_drafts (id,review_id,buyer_label,payload_json,created_by,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET review_id=excluded.review_id,buyer_label=excluded.buyer_label,payload_json=excluded.payload_json').run(id, payload.id, payload.buyerLabel, JSON.stringify(payload), 'editor', 'editor');
      return { draft: draftRows('review').find(item => item.id === id) };
    }
    if (/\/review-drafts\/[^/]+\/apply$/.test(pathname)) {
      const draft = draftRows('review').find(item => item.id === decodeURIComponent(pathname.split('/').at(-2)));
      applyScript('apply-manager-review-draft.mjs', { MANAGER_REVIEW_DRAFT_PAYLOAD: Buffer.from(JSON.stringify(draft.payload)).toString('base64'), MANAGER_REVIEW_ID: draft.reviewId });
      return { requestId: 'fixture-review-write-back' };
    }
    if (pathname.endsWith('/r2/assets')) {
      const prefix = search.get('prefix') || '';
      if (method === 'PUT') folders.add(body.prefix);
      if (method === 'DELETE') assets.delete(body.key);
      if (method === 'PATCH') for (const key of body.keys) { const file = assets.get(key); assets.delete(key); assets.set(body.targetPrefix + file.name, { ...file, key: body.targetPrefix + file.name }); }
      if (method === 'POST') for (const file of body.files) assets.set(body.prefix + file.name, { name: file.name, key: body.prefix + file.name, url: '/fixture-image.svg', size: file.size, isImage: true });
      const list=[...assets.values()].filter(file=>file.key.startsWith(prefix)&&!file.key.slice(prefix.length).includes('/')),offset=Number(search.get('cursor')||0),limit=Number(search.get('limit')||300),truncated=offset+limit<list.length;
      return { prefix, folders: [...folders].filter(key => key.startsWith(prefix) && key !== prefix).map(key => ({ prefix: key, name: key.slice(prefix.length).replace(/\/$/, '') })), files:list.slice(offset,offset+limit),truncated,cursor:truncated?String(offset+limit):undefined };
    }
    if (pathname.endsWith('/ai/translation-locales')) return { locales: enabledLocales };
    if (pathname.endsWith('/ai/translations')) return { requestId: 'fixture-translation', message: '已提交。' };
    if (pathname.endsWith('/ai/translation-status')) return translationStatus || { requestId: 'fixture-translation', status: 'completed', conclusion: 'success', message: '翻译完成。', result: { generated: [{ type: 'product', locale: 'es', slug: 'sample-service' }], skipped: [], errors: [] } };
    if (pathname.endsWith('/ai/drafts')) {
      if (method === 'DELETE') {const ids=new Set(body.drafts.map(item=>item.draftSlug));for(let index=translationDrafts.length-1;index>=0;index--)if(ids.has(translationDrafts[index].draftSlug))translationDrafts.splice(index,1);return {removed:body.drafts};}

      const type = search.get('type') || body?.type;
      if (method === 'PUT') { const item = translationDrafts.find(item => item.draftSlug === body.draftSlug); Object.assign(item, { data: body.data, title: body.data.title, body: body.body }); return { draft: item }; }
      if (method === 'PATCH') { for (const item of translationDrafts) if (body.drafts.some(selected=>selected.draftSlug===item.draftSlug)) item.published = true; return { approved: body.drafts, errors: [] }; }
      const draft = translationDrafts.find(item => item.draftSlug === search.get('draft'));
      if (draft) return { draft };
      const drafts = translationDrafts.filter(item => item.type === type && (search.get('includePublished') === 'true' || !item.published));
      return { drafts, counts: { pending: drafts.filter(item => !item.published).length, visible: drafts.length } };
    }
    if (pathname.endsWith('/deploy/site')) {
      if (method === 'DELETE') { records.splice(0); return { ok: true }; }
      if (method === 'POST') {
        if (failPublish) { failPublish = false; throw new Error('发布暂时失败，请重试。'); }
        records.push({ runId: 1, requestId: 'site-fixture', title: '网站更新', label: '已完成', stage: 'success', submittedAt: date, updatedAt: date });
        return { requestId: 'site-fixture', message: '发布请求已提交。' };
      }
      if (search.has('requestId')) return { stage: 'success', status: 'completed', message: '网站更新已发布。' };
      return { records };
    }
    throw new Error('Unexpected fixture API: ' + method + ' ' + pathname);
  };
  return { requests, db, productDrafts, products, assets, translationDrafts, records,
    visualDrafts, visualSlots, orderGroups, setWorkspace:value=>{workspace=value;}, setTranslationStatus:value=>{translationStatus=value;},
    setReviews: value => { reviewsEnabled = value; }, delayNextApi: (path,ms) => delayedApis.set(path,ms), failNextSave: () => { failSave = true; },
    failNextApi: path => failedApis.add(path), setPolicy: value => { policy = value; },
    setLocales: value => { enabledLocales = value; }, normalizeProduct: normalizer.normalizeProductDraftPayload,
    setAuthenticated: value => { authenticated = value; },
    start: async dist => {
      const server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = url.pathname.replace(`/${testUuid}`, '');
        try {
          if (pathname.startsWith('/api/manager/')) {
            if (!url.pathname.startsWith(`/${testUuid}/api/manager/`)) { res.writeHead(404); res.end(); return; }
            if (pathname.endsWith('/ai/draft-preview')) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><h1>Translated draft</h1>'); return; }
            if (pathname.endsWith('/content-preview')) { res.setHeader('content-type', 'text/html; charset=utf-8');res.end('<!doctype html><h1>Saved working draft</h1>');return; }
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            let body = buffer.length ? req.headers['content-type']?.includes('multipart/form-data') ? null : JSON.parse(buffer) : null;
            if (buffer.length && body === null) {
              const form = await new Request(url, { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: buffer }).formData();
              body = { prefix: form.get('prefix') || '', files: form.getAll('files').map(file => ({ name: file.name, size: file.size })) };
            }
            const result = await api(pathname, req.method, body, url.searchParams);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(result)); return;
          }
          if (pathname === '/fixture-image.svg' || pathname === '/r2/cdn-test.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="20" y="20" width="120" height="120" fill="#138477"/></svg>'); return; }
          const path = pathname === '/' || pathname === '' || pathname === '/manager/' ? resolve(dist, 'manager/index.html') : resolve(dist, '.' + pathname);
          if (!path.startsWith(dist + sep)) { res.writeHead(404); res.end(); return; }
          res.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
          let file=await readFile(path);
          if(path.endsWith('index.html')&&file.includes('manager-config')){const origin=`http://127.0.0.1:${server.address().port}`;file=Buffer.from(file.toString().replace(/(<script id="manager-config"[^>]*>)([\s\S]*?)(<\/script>)/,(_,open,text,close)=>open+JSON.stringify({...JSON.parse(text),publicR2AssetBaseUrl:origin+'/r2',publicSiteOrigin:origin})+close));}
          res.end(file);
        } catch (error) { if (!res.headersSent) res.writeHead(error.status || 503, { 'content-type': 'text/plain; charset=utf-8' }); res.end(error.message); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      return { url: `http://127.0.0.1:${server.address().port}/${testUuid}`, stop: () => new Promise(resolve => server.close(resolve)) };
    } };
}
