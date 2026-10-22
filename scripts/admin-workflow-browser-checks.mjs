import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function checkAdminWorkflow({page,backend,check,output}) {
  await page.reload();await page.waitForSelector('.manager-product-title');
  await page.evaluate(()=>{window.__manualDialogs=true;});
  const tab=async name=>{await page.locator(`[data-tab="${name}"]`).click();};
  const dialog=()=>page.locator('dialog.bw-dialog[open]');
  const closeDialog=()=>page.keyboard.press('Escape');
  await check('formal product selection covers all filtered pages and clears on filter changes without a dialog',async()=>{
    await tab('products');await page.locator('#searchInput').fill('Service');
    await page.locator('#productContentSelectAll').check();
    const selected=await page.locator('#productContentSelection').innerText();assert.match(selected,/全部分页/);
    const count=backend.products.filter(product=>`${product.title} ${product.series} ${product.category}`.toLowerCase().includes('service')).length;
    assert.match(selected,new RegExp(`已选 ${count} 项`));
    await page.locator('[data-formal-select="product"]').first().uncheck();
    assert.equal(await page.locator('#productContentSelectAll').evaluate(input=>input.indeterminate),true);
    await page.locator('#searchInput').fill('');assert.match(await page.locator('#productContentSelection').innerText(),/已选 0 项/);
    assert.equal(await dialog().count(),0);
  });
  await check('formal article list provides fixed categories, selection and one cancellable themed deletion dialog',async()=>{
    await tab('blog');await page.waitForSelector('[data-blog-slug]');
    assert.deepEqual(await page.locator('#blogCategoryFilter option').allTextContents(),['全部分类','公司新闻动态','技术文章','其它文章']);
    await page.locator('#blogContentSelectAll').check();assert.ok((await page.locator('#blogContentSelection').innerText()).includes('已选'));
    const before=backend.requests.filter(request=>request.path.endsWith('/blog-deletion')&&request.method==='DELETE').length;
    await page.locator('#blogContentDelete').click();await dialog().waitFor();
    assert.match(await dialog().innerText(),/下.*发布|下一次/);assert.doesNotMatch(await dialog().innerText(),/sourceSha|src\/content|Git|SHA/);
    assert.equal(await dialog().getAttribute('data-theme'),await page.locator('html').getAttribute('data-theme'));
    await page.screenshot({path:resolve(output,'article-delete-dialog.png')});await closeDialog();
    assert.equal(backend.requests.filter(request=>request.path.endsWith('/blog-deletion')&&request.method==='DELETE').length,before);
    await page.waitForFunction(()=>document.activeElement===document.getElementById('blogContentDelete'));
    await page.locator('#blogCategoryFilter').selectOption('company-news');assert.match(await page.locator('#blogContentSelection').innerText(),/已选 0 项/);
    assert.equal(await page.locator('[data-blog-slug]').count(),0,'empty search must still respect category');
    await page.locator('#blogCategoryFilter').selectOption('');
  });
  await check('translation select-all distinguishes pending and reviewed candidates and resets on locale/search filters',async()=>{
    const base=structuredClone(backend.translationDrafts[0]);
    backend.translationDrafts.push({...base,draftSlug:'ar--service-1',locale:'ar',sourceSlug:'service-1',title:'Pending Arabic',published:false,sourceSha:'2'.repeat(40),deleteAction:'delete',lifecycle:'pending',data:{...base.data,locale:'ar',sourceSlug:'service-1',published:false}},
      {...base,draftSlug:'es--service-1',locale:'es',sourceSlug:'service-1',title:'Reviewed Spanish',published:true,sourceSha:'3'.repeat(40),deleteAction:'restore',lifecycle:'reviewed',data:{...base.data,locale:'es',sourceSlug:'service-1',published:true}});
    await tab('product-drafts');await page.locator('#productDraftIncludePublished').uncheck();await page.locator('#productDraftRefreshButton').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-translation-draft]').length===1);
    await page.locator('#productDraftSelectAll').check();assert.equal(await page.locator('[data-translation-draft]:checked').count(),1);
    await page.locator('#productDraftIncludePublished').check();await page.waitForFunction(()=>document.querySelectorAll('[data-translation-draft]').length===3);
    assert.equal(await page.locator('[data-translation-draft]:checked').count(),0);
    await page.locator('#productDraftSelectAll').check();assert.equal(await page.locator('[data-translation-draft]:checked').count(),3);
    await page.locator('[data-translation-draft]').first().uncheck();assert.equal(await page.locator('#productDraftSelectAll').evaluate(input=>input.indeterminate),true);
    await page.locator('#productDraftLocale').selectOption('ar');assert.equal(await page.locator('[data-translation-draft]:checked').count(),0);assert.equal(await page.locator('[data-translation-draft]').count(),1);
    await page.locator('#productDraftSelectAll').check();await page.locator('#productDraftSearch').fill('not-present');assert.equal(await page.locator('[data-translation-draft]').count(),0);assert.equal(await page.locator('#productDraftSelectAll').isDisabled(),true);
    await page.locator('#productDraftSearch').fill('');await page.locator('#productDraftLocale').selectOption('');
  });
  await check('rich text retains real anchors and R2 syntax when unchanged and rejects unsafe href rendering',async()=>{
    await page.locator('[data-translation-edit="product:ar--service-1"]').click();
    await page.waitForFunction(()=>document.getElementById('translationEditorStatus').textContent.includes('已加载'));
    const editor=page.locator('[data-rich-editor="translationEditBody"]');
    const body='## Buyer guide\n\n[**Part**](https://fixture.test/a_(b)?x=1&y=2)\n\n[Email](mailto:buyer@example.test) · [Phone](tel:+12025550100)\n\n| Part | Link |\n| --- | --- |\n| A | [Product](/products/part.html) |\n\n{% r2Image src="/fixture-image.svg" alt="Part" caption="Figure" /%}\n\n{% r2Document src="/fixture.pdf" title="Specification" /%}\n\n[unsafe](javascript:alert(1))\n';
    await editor.locator('[data-rich-command="source"]').click();await page.locator('#translationEditBody').fill(body);await editor.locator('[data-rich-command="source"]').click();
    const surface=editor.locator('.rich-editor__surface');
    assert.equal(await surface.locator('a[href="https://fixture.test/a_(b)?x=1&y=2"] strong').count(),1);
    assert.equal(await surface.locator('a[href^="javascript:"]').count(),0);
    assert.equal(await surface.locator('a[href^="mailto:"]').count(),1);assert.equal(await surface.locator('a[href^="tel:"]').count(),1);
    await page.locator('#translationEditorSaveButton').click();
    await page.waitForFunction(()=>document.getElementById('translationEditorStatus').textContent.includes('已保存'));
    assert.equal(backend.translationDrafts.find(item=>item.draftSlug==='ar--service-1').body,body);
    assert.equal(await dialog().count(),0);
    await page.locator('#translationEditorCloseButton').click();
  });
  await check('candidate deletion uses one built-in dialog and cancels without a write',async()=>{
    const before=backend.requests.filter(request=>request.path.endsWith('/ai/drafts')&&request.method==='DELETE').length;
    await page.locator('[data-translation-delete="product:ar--service-1"]').click();await dialog().waitFor();await closeDialog();
    assert.equal(backend.requests.filter(request=>request.path.endsWith('/ai/drafts')&&request.method==='DELETE').length,before);
    await page.locator('[data-translation-delete="product:ar--service-1"]').click();await dialog().waitFor();await dialog().locator('button[type="submit"]').click();
    await page.locator('[data-translation-delete="product:ar--service-1"]').waitFor({state:'hidden'});
    assert.equal(backend.requests.filter(request=>request.path.endsWith('/ai/drafts')&&request.method==='DELETE').length,before+1);
  });
  await check('publish confirmation is a themed in-app dialog and cancellation never dispatches',async()=>{
    await tab('publish');const before=backend.requests.filter(request=>request.path.endsWith('/deploy/site')&&request.method==='POST').length;
    await page.locator('#publishButton').click();await dialog().waitFor();assert.match(await dialog().innerText(),/发布网站更新/);await closeDialog();assert.equal(backend.requests.filter(request=>request.path.endsWith('/deploy/site')&&request.method==='POST').length,before);
  });
  await check('long PDF names and centered icons fit light/dark desktop/mobile and RTL media grids',async()=>{
    const names=['Corner-Hardware-Commercial-Project-Full-Technical-Catalogue-2026-Revised-Edition.pdf','超长文件名称产品目录项目选型技术资料安装说明规格参数完整版本下载文件.pdf','دليل-المواصفات-الفنية-الكامل-للمنتجات-والمشاريع-التجارية-نسخة-مطولة.pdf'];
    for(const name of names)backend.assets.set(name,{name,key:name,url:'/fixture.pdf',size:2048,isDocument:true});
    for(const theme of ['light','dark'])for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});await page.locator('#themeMenuButton').click();await page.locator(`[data-theme-option="${theme}"]`).click();await tab('images');await page.locator('#assetRefreshButton').click();await page.waitForFunction(()=>document.getElementById('assetStatus').textContent.includes('已加载'));await page.waitForFunction(name=>!!document.querySelector(`.asset-name[title="${name}"]`),names[0]);
      for(const name of names){const measurements=await page.locator('.asset-card').filter({has:page.locator('.asset-name').filter({hasText:name})}).evaluate(card=>{const label=card.querySelector('.asset-name'),icon=card.querySelector('.asset-document'),box=card.getBoundingClientRect(),text=label.getBoundingClientRect(),figure=icon.getBoundingClientRect();return {width:box.width,textOverflow:getComputedStyle(label).textOverflow,contained:text.left>=box.left&&text.right<=box.right+1,center:Math.abs((figure.left+figure.right)-(box.left+box.right))<2,ellipsis:getComputedStyle(label).textOverflow==='ellipsis',full:label.title};});assert.equal(measurements.contained,true,JSON.stringify({name,theme,width,...measurements}));assert.equal(measurements.center,true,JSON.stringify({name,theme,width,...measurements}));assert.equal(measurements.ellipsis,true,JSON.stringify({name,theme,width,...measurements}));assert.equal(measurements.full,name);}
      await page.locator('#assetGrid').evaluate(node=>node.dir='rtl');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(output,`pdf-${theme}-${width}.png`)});await page.locator('#assetGrid').evaluate(node=>node.dir='ltr');
    }
  });
  await page.evaluate(()=>{window.__manualDialogs=false;});
}
