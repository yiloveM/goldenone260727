// Exercise the actual desktop/mobile navigation; no programmatic tab activation.
export async function expandManagerEditor(page) {
  const groups=page.locator('.section.is-active .manager-view.is-visible details.editor-group:not([open])>summary');
  while(await groups.count())await groups.first().click();
}
export async function setManagerTheme(page,theme) {
  if(await page.locator('#managerMenuButton').isVisible()&&await page.locator('#managerMenuButton').getAttribute('aria-expanded')==='false')await page.locator('#managerMenuButton').click();
  await page.locator('#themeMenuButton').click();await page.locator(`[data-theme-option="${theme}"]`).click();
  if(await page.locator('#managerMenuShade').isVisible())await page.locator('#managerMenuClose').click();
}
export async function openManagerTab(page, name) {
  await page.locator('html[data-manager-ready="true"]').waitFor({state:'attached'});
  if (['translation','product-drafts','blog-drafts'].includes(name) && await page.locator('#translationWorkspaceNav').isHidden()) {
    if (await page.locator('#managerMenuButton').isVisible()) await page.locator('#managerMenuButton').click();
    await page.locator('[data-workspace="translation"]').click();
  }
  if (name === 'product-order') { await openManagerTab(page,'products'); if (await page.locator('#productBackButton').isVisible()) await page.locator('#productBackButton').click(); }
  const target=page.locator(`[data-tab="${name}"]`);
  if (await target.evaluate(node=>!!node.closest('.sidebar')) && await page.locator('#managerMenuButton').isVisible() && await page.locator('#managerMenuButton').getAttribute('aria-expanded')==='false') await page.locator('#managerMenuButton').click();
  await target.click();
}
