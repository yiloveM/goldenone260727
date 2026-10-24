// Shared by the build, the owner form and the authenticated content writer.
// Slots are declared by the site adapter; a content request never supplies paths.
export const VISUAL_FILE = 'src/data/site-visuals.json';
/** @typedef {{locale:string,text:string}} LocaleText */
/** @typedef {{enabled:boolean,image:string,mobileImage:string,alt:string,localizedAlts:LocaleText[],focusX:number,focusY:number,[key:string]:any}} Visual */
/** @typedef {{version:number,home:{heroSlides:{key:string,visual:Visual}[],center:Visual,primaryCta:{href:string,labels:LocaleText[]}},pages:Record<string,Visual>,categories:{key:string,visual:Visual}[],[key:string]:any}} VisualConfig */
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const text = (value, max = 500) => { assert(value == null || typeof value === 'string', '文字格式不正确。'); const result = String(value ?? '').trim(); assert(result.length <= max, '文字过长，请缩短后重试。'); return result; };
export const emptyVisual = (enabled = false) => ({ enabled, image: '', mobileImage: '', alt: '', localizedAlts: [], focusX: 50, focusY: 50 });
/** @returns {Visual|undefined} */
export function visualAt(config, slot) {
  if (slot.group === 'home') return slot.key === 'home.center' ? config?.home?.center : config?.home?.heroSlides?.find(item => `home.${item.key}` === slot.key)?.visual;
  if (slot.group === 'pages') return config?.pages?.[slot.key.slice(6)];
  return config?.categories?.find(item => `category.${item.key}` === slot.key)?.visual;
}
export function setVisual(config, slot, value) {
  if (slot.group === 'home') {
    config.home ||= { heroSlides: [] }; config.home.heroSlides ||= [];
    if (slot.key === 'home.center') config.home.center = value;
    else { let item = config.home.heroSlides.find(item => `home.${item.key}` === slot.key); if (!item) config.home.heroSlides.push(item = { key: slot.key.slice(5) }); item.visual = value; }
  } else if (slot.group === 'pages') { config.pages ||= {}; config.pages[slot.key.slice(6)] = value; }
  else { config.categories ||= []; let item = config.categories.find(item => `category.${item.key}` === slot.key); if (!item) config.categories.push(item = { key: slot.key.slice(9) }); item.visual = value; }
}
/** @returns {VisualConfig} */
export function emptySiteVisuals(slots, enabled = false) {
  /** @type {VisualConfig} */
  const value = { version: 1, home: { heroSlides: [], center: emptyVisual(), primaryCta: { href: '', labels: [] } }, pages: {}, categories: [] };
  for (const slot of slots) setVisual(value, slot, emptyVisual(enabled && slot.supported !== false));
  return value;
}
export function validateVisualImage(value, policy) {
  const image = text(value, 2048); if (!image) return '';
  assert(!/[\u0000-\u0020\\'"<>]/.test(image), '图片地址不正确，请从图片池重新选择。');
  let url; try { url = new URL(image, policy.origin); } catch { throw new Error('图片地址不正确。'); }
  const origin = new URL(policy.origin);
  let decoded = image;
  for (let index = 0; index < 5; index++) { let next; try { next = decodeURIComponent(decoded); } catch { throw new Error('图片地址编码不正确。'); } if (next === decoded) break; decoded = next; }
  assert(!decoded.includes('%') && !/[\u0000-\u001f\\'"<>]/.test(decoded) && !decoded.split('/').some(part => part === '.' || part === '..'), '图片地址不正确，请从图片池重新选择。');
  const local = image.startsWith('/r2/') && !/%2e|%2f|%5c/i.test(image) && url.origin === origin.origin;
  const cdn = policy.cdn && policy.cdn !== 'https://cdn.example.com' ? new URL(policy.cdn) : null;
  const hosted = cdn && url.protocol === 'https:' && !url.username && !url.password && url.origin === cdn.origin && url.pathname.startsWith(cdn.pathname.replace(/\/$/, '') + '/');
  assert((local || hosted) && !url.hash && !url.search && /\.(avif|gif|jpe?g|png|webp|svg)$/i.test(url.pathname), '请选择本站图片池中的图片，不能使用文档或外站地址。');
  return image;
}
/** @returns {LocaleText[]} */
function localeTexts(value, policy) {
  assert(value == null || Array.isArray(value), '语言说明格式不正确。');
  const seen = new Set();
  return (value || []).map(item => {
    assert(object(item) && Object.keys(item).every(key => ['locale', 'text'].includes(key)), '语言说明字段不正确。');
    assert(policy.locales.includes(item.locale) && !seen.has(item.locale), '语言未开放或重复。'); seen.add(item.locale);
    return { locale: item.locale, text: text(item.text, 500) };
  });
}
export function normalizeVisual(value, policy) {
  assert(value == null || object(value), '图片设置格式不正确。'); const data = value || {};
  assert(data.enabled == null || typeof data.enabled === 'boolean', '位置开关格式不正确。');
  const point = value => { if (value == null) return 50; assert(Number.isInteger(value) && value >= 0 && value <= 100, '裁切焦点应为 0 到 100 的整数。'); return value; };
  return { enabled: data.enabled === true, image: validateVisualImage(data.image, policy), mobileImage: validateVisualImage(data.mobileImage, policy), alt: text(data.alt), localizedAlts: localeTexts(data.localizedAlts, policy), focusX: point(data.focusX), focusY: point(data.focusY) };
}
export function validateSiteVisuals(value, policy) {
  if (value == null) return emptySiteVisuals(policy.slots);
  assert(object(value) && (value.version == null || value.version === 1), '站点视觉配置版本不支持。');
  assert(value.home == null || object(value.home), '首页视觉配置不正确。');
  assert(value.pages == null || object(value.pages), '页面视觉配置不正确。');
  for (const [array, group] of [[value.home?.heroSlides, 'home'], [value.categories, 'category']]) {
    assert(array == null || Array.isArray(array), '视觉位置列表格式不正确。'); const seen = new Set();
    for (const item of array || []) { assert(object(item) && policy.slots.some(slot => slot.key === `${group}.${item.key}`) && !seen.has(item.key), '视觉位置未知或重复。'); seen.add(item.key); }
  }
  for (const key of Object.keys(value.pages || {})) assert(policy.slots.some(slot => slot.key === `pages.${key}`), '页面位置不受支持。');
  const result = emptySiteVisuals(policy.slots);
  const storedPolicy = { ...policy, locales: policy.knownLocales || policy.locales };
  for (const slot of policy.slots) setVisual(result, slot, normalizeVisual(visualAt(value, slot), storedPolicy));
  const cta = value.home?.primaryCta || {}; assert(object(cta), '首页链接格式不正确。');
  const href = text(cta.href, 1000), labels = localeTexts(cta.labels, storedPolicy);
  if (href) { assert(href.startsWith('/') && !href.startsWith('//') || policy.fragments?.includes(href), '请选择有效的本站公开页面。'); assert(!href.startsWith('/') || policy.paths.includes(href), '链接目标不是本站可用的公开页面。'); assert(labels.some(item => item.locale === 'en' && item.text), '请填写链接的英文文字。'); }
  result.home.primaryCta = { href, labels };
  return result;
}
export function mergeVisualPatch(raw, patch, policy) {
  const current = validateSiteVisuals(raw, policy);
  assert(object(patch) && Object.keys(patch).every(key => ['slots', 'primaryCta'].includes(key)), '只允许修改已开放位置的内容。');
  assert(Array.isArray(patch.slots) && patch.slots.length > 0 && patch.slots.length <= policy.slots.length, '请选择需要修改的位置。');
  const next = structuredClone(raw || emptySiteVisuals(policy.slots)), seen = new Set();
  for (const item of patch.slots) {
    assert(object(item) && Object.keys(item).every(key => ['key', 'image', 'mobileImage', 'alt', 'localizedAlts', 'focusX', 'focusY'].includes(key)), '不能修改站长的位置开关或其它设置。');
    const slot = policy.slots.find(slot => slot.key === item.key);
    assert(slot && slot.supported !== false && visualAt(current, slot)?.enabled && !seen.has(item.key), '位置尚未开放或已经重复。'); seen.add(item.key);
    const existing = visualAt(next, slot) || {}, incoming = { ...item };
    if (incoming.localizedAlts !== undefined) incoming.localizedAlts = [...(existing.localizedAlts || []).filter(entry => !policy.locales.includes(entry.locale)), ...localeTexts(incoming.localizedAlts, policy)];
    setVisual(next, slot, { ...existing, ...normalizeVisual({ ...existing, ...incoming }, { ...policy, locales: policy.knownLocales || policy.locales }), enabled: true });
  }
  if (patch.primaryCta !== undefined) {
    assert(seen.has('home.primary') && object(patch.primaryCta) && Object.keys(patch.primaryCta).every(key => ['href', 'labels'].includes(key)), '首页链接只能随首屏内容一起修改。');
    next.home.primaryCta = { ...next.home.primaryCta, ...patch.primaryCta, labels: [...(next.home.primaryCta?.labels || []).filter(entry => !policy.locales.includes(entry.locale)), ...localeTexts(patch.primaryCta.labels, policy)] };
  }
  validateSiteVisuals(next, policy); return next;
}
export function resolveVisual(config, slot, fallback, mobileFallback = fallback, locale = 'en') {
  const value = visualAt(config, slot);
  if (slot.supported === false || !value?.enabled || !value.image) return { image: fallback, mobileImage: mobileFallback, active: false, alt: '', focusX: 50, focusY: 50 };
  return { ...value, image: value.image, mobileImage: value.mobileImage || value.image, active: true, alt: locale === 'en' ? value.alt : value.localizedAlts?.find(item => item.locale === locale)?.text || '' };
}
