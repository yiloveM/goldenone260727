import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function checkManagerImages({ page, backend, check, output }) {
  const paths = Object.fromEntries(['portrait', 'wide', 'square'].map(name => [name, `/manager-image-fixture/${name}.svg`]));
  const sizes = { portrait: [800, 2400], wide: [2400, 300], square: [1600, 1600] };
  const pattern = '**/manager-image-fixture/*.svg';
  await page.context().route(pattern, route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1).slice(0, -4);
    const [width, height] = sizes[name];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d8efed"/><rect width="100%" height="${height / 8}" fill="#ed4c67"/><rect y="${height * 7 / 8}" width="100%" height="${height / 8}" fill="#197fbc"/></svg>` });
  });
  const product = backend.products.find(item => item.slug === 'service-1');
  const original = structuredClone(product);
  const before = backend.requests.length;
  for (const [name, url] of Object.entries(paths)) backend.assets.set('manager-image-' + name, { name: name + '.svg', key: 'manager-image-' + name, url, size: 200, isImage: true });
  const rows = () => page.locator('#galleryList [data-list="galleryImages"]');
  const values = () => rows().evaluateAll(nodes => nodes.map(node => node.value));
  const openProduct = async () => {
    await page.reload(); await page.waitForSelector('#searchInput');
    await page.locator('#searchInput').fill(product.title);
    await page.locator(`.manager-product-title[data-slug="${product.slug}"]`).click();
  };
  const save = async () => {
    await page.locator('#saveDraftButton').click();
    await page.waitForFunction(() => document.getElementById('statusText').textContent.includes('草稿已保存'));
    return backend.productDrafts().find(item => item.productSlug === product.slug);
  };
  const fit = async () => {
    await page.waitForFunction(() => { const image = document.getElementById('imagePreviewImage'); return image.complete && image.naturalWidth > 0; });
    const geometry = await page.locator('#imagePreviewImage').evaluate(image => {
      const box = image.getBoundingClientRect(); const stage = image.parentElement.getBoundingClientRect();
      const modal = image.closest('[role="dialog"]').getBoundingClientRect();
      return { width: box.width, height: box.height, stage: [stage.width, stage.height],
        fits: box.left >= stage.left && box.right <= stage.right && box.top >= stage.top && box.bottom <= stage.bottom,
        modalFits: modal.left >= 0 && modal.right <= innerWidth && modal.top >= 0 && modal.bottom <= innerHeight,
        objectFit: getComputedStyle(image).objectFit, ratio: image.naturalWidth / image.naturalHeight };
    });
    assert.ok(geometry.fits && geometry.modalFits && geometry.width > 0 && geometry.height > 0, JSON.stringify(geometry));
    assert.equal(geometry.objectFit, 'contain');
    return geometry;
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    Object.assign(product, { image: paths.portrait, galleryImages: [paths.wide, paths.square, paths.portrait] });
    await check('legacy cover is merged into the editable gallery without changing public ordering', async () => {
      await openProduct();
      assert.deepEqual(await values(), [paths.portrait, paths.wide, paths.square]);
      assert.equal(await page.locator('#image').inputValue(), paths.portrait);
      const draft = await save();
      assert.equal(draft.payload.image, paths.portrait);
      assert.deepEqual(draft.payload.galleryImages, [paths.portrait, paths.wide, paths.square]);
    });
    await check('gallery paste, cover paste and picker selection keep the first image synchronized', async () => {
      await rows().first().fill(paths.square);
      assert.equal(await page.locator('#image').inputValue(), paths.square);
      await page.locator('#image').fill(paths.wide); await page.locator('#image').press('Tab');
      assert.equal(await rows().first().inputValue(), paths.wide);
      await page.locator('[data-image-field="image"]').click();
      await page.locator(`[data-picker-select="${paths.portrait}"]`).click();
      assert.equal(await page.locator('#image').inputValue(), paths.portrait);
      assert.equal(await rows().first().inputValue(), paths.portrait);
      await page.locator('[data-image-list="galleryImages"]').first().click();
      await page.locator(`[data-picker-preview="${paths.square}"]`).click(); await fit();
      await page.locator('#imagePreviewUseButton').click();
      assert.equal(await page.locator('#image').inputValue(), paths.square);
      assert.equal(await rows().first().inputValue(), paths.square);
    });
    await check('removing the first or final gallery image updates the cover and survives draft restart', async () => {
      await page.locator('[data-action="galleryImages:remove"]').first().click();
      assert.equal(await page.locator('#image').inputValue(), paths.wide);
      while (await rows().count()) await page.locator('[data-action="galleryImages:remove"]').first().click();
      assert.equal(await page.locator('#image').inputValue(), '');
      let draft = await save(); assert.equal(draft.payload.image, ''); assert.deepEqual(draft.payload.galleryImages, []);
      await openProduct(); await page.locator(`[data-product-draft-edit="${draft.id}"]`).click();
      assert.equal(await page.locator('#image').inputValue(), ''); assert.equal(await rows().count(), 0);
      await page.locator('[data-action="gallery:add"]').click();
      await rows().first().fill(paths.portrait);
      backend.failNextSave(); await page.locator('#saveDraftButton').click();
      await page.waitForFunction(() => document.getElementById('statusText').textContent.includes('重试'));
      assert.equal(await page.locator('#image').inputValue(), paths.portrait);
      draft = await save();
      await openProduct(); await page.locator(`[data-product-draft-edit="${draft.id}"]`).click();
      assert.equal(await page.locator('#image').inputValue(), paths.portrait);
      assert.deepEqual(await values(), [paths.portrait]);
      await page.locator(`[data-apply="${draft.id}"]`).click();
      await page.waitForFunction(() => document.getElementById('statusText').textContent.includes('已提交'));
    });
    const results = [];
    await check('full portrait, square and wide previews fit desktop/mobile/landscape in both themes', async () => {
      for (const theme of ['light', 'dark']) {
        await page.locator('#themeMenuButton').click(); await page.locator(`[data-theme-option="${theme}"]`).click();
        for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          for (const [name, url] of Object.entries(paths)) {
            await rows().first().fill(url);
            await page.locator('#galleryList [data-inline-image-preview]').first().click();
            results.push({ theme, ...viewport, name, ...await fit() });
            if (name === 'portrait' && [1440, 390, 844].includes(viewport.width)) await page.screenshot({ path: resolve(output, `image-preview-${theme}-${viewport.width}.png`) });
            await page.keyboard.press('Escape');
          }
        }
      }
      await writeFile(resolve(output, 'image-preview-geometry.json'), JSON.stringify(results, null, 2));
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await check('cover, media library, article and picker previews use the same complete original image', async () => {
      await rows().first().fill(paths.portrait);
      await page.locator('#imagePreviewButton').click(); await fit();
      assert.ok((await page.locator('#imagePreviewOpenLink').getAttribute('href')).endsWith(paths.portrait));
      await page.locator('#imagePreviewCloseButton').click();
      await page.locator('[data-image-field="image"]').click();
      await page.locator(`[data-picker-preview="${paths.portrait}"]`).click(); await fit();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#imagePicker').getAttribute('aria-hidden'), 'false');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('body').evaluate(node => node.classList.contains('has-modal')), false);
      await page.locator('[data-tab="images"]').click();
      await page.locator(`[data-asset-preview="${paths.wide}"]`).click(); await fit(); await page.keyboard.press('Escape');
      await page.locator('[data-tab="blog"]').click(); await page.locator('[data-blog-slug="sample-article"]').click();
      await page.locator('#blogImage').fill(paths.portrait); await page.locator('#blogImagePreviewButton').click(); await fit(); await page.keyboard.press('Escape');
    });
    assert.ok(backend.requests.slice(before).every(item => item.path.startsWith('/api/manager/')));
  } finally {
    Object.assign(product, original);
    for (const name of Object.keys(paths)) backend.assets.delete('manager-image-' + name);
    await page.context().unroute(pattern);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
}
