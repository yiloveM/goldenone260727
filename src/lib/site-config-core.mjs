import structure from '../config/site-config.schema.json' with { type: 'json' };
import legacyStructure from '../config/site-config-v1.schema.json' with { type: 'json' };
import featureStructure from '../config/site-feature-config.schema.json' with { type: 'json' };
import catalog from '../config/standard-modules.json' with { type: 'json' };
import { validateModuleSequence } from './standard-modules.mjs';
export const standardModules = catalog.modules;
export const supportedSiteLocales = structure.properties.locales.properties.selected.items.enum;
// Deliberately bounded JSON Schema subset emitted by our Zod structure. Unknown
// keywords fail verification; no eval, remote refs, defaults or coercion.
const supported = new Set(['$schema', 'type', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'enum', 'const']);
export function validateSchema(schema, value, label = 'configuration') {
    for (const key of Object.keys(schema))
        if (!supported.has(key))
            throw new Error('Unsupported schema keyword: ' + key);
    const fail = () => { throw new Error('配置字段不正确：' + label); };
    if (schema.const !== undefined && value !== schema.const)
        fail();
    if (schema.enum && !schema.enum.includes(value))
        fail();
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            fail();
        for (const key of schema.required || [])
            if (!Object.hasOwn(value, key))
                fail();
        for (const [key, item] of Object.entries(value)) {
            if (!Object.hasOwn(schema.properties || {}, key)) {
                if (schema.additionalProperties === false)
                    fail();
            }
            else
                validateSchema(schema.properties[key], item, label + '.' + key);
        }
    }
    else if (schema.type === 'array') {
        if (!Array.isArray(value))
            fail();
        if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity))
            fail();
        for (const [i, item] of value.entries())
            validateSchema(schema.items, item, label + '[' + i + ']');
    }
    else if (schema.type === 'string') {
        if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength ?? Infinity) || schema.pattern && !new RegExp(schema.pattern).test(value))
            fail();
    }
    else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean')
            fail();
    }
    else if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))
            fail();
    }
    return value;
}
export function parseSiteConfig(config) {
    validateSchema(config?.scope === 'features' ? featureStructure : config?.schemaVersion === 1 ? legacyStructure : structure, config, 'site-config');
    if (config.scope !== 'features') {
    const seen = new Set();
    for (const [index, item] of config.modules.home.entries()) {
        const def = standardModules.find(x => x.id === item.id);
        if (!def || def.support !== 'implemented' || def.kind !== 'section')
            throw new Error(`首页模块尚不支持：${item.id}`);
        if (!def.variants.includes(item.variant))
            throw new Error(`模块布局尚不支持：${item.id}/${item.variant}`);
        if (seen.has(item.id))
            throw new Error(`首页模块重复：${item.id}`);
        seen.add(item.id);
        if (item.id === 'hero' && index !== 0)
            throw new Error('Banner / Hero 必须位于首页首位。');
        if (config.schemaVersion === 1 && item.id === 'reviews' && !config.features.reviews.enabled)
            throw new Error('客户评价模块需要先启用客户评价。');
        if (config.schemaVersion === 1 && item.id === 'downloads' && config.features.downloads.mode === 'disabled')
            throw new Error('资料下载模块需要选择下载模式。');
    }
    if (!seen.has('hero'))
        throw new Error('首页必须保留 Banner / Hero 及主标题。');
    validateModuleSequence(config.modules.home, standardModules);
    }
    if (new Set(config.locales.selected).size !== config.locales.selected.length)
        throw new Error('目标语言不能重复。');
    const ai = config.features.aiDiscovery;
    if (config.schemaVersion === 1 && !ai.enabled && (ai.multilingual || ai.markdown || ai.llmsFull))
        throw new Error('AI 内容导航的子功能需要先启用 AI 内容导航。');
    if ((config.schemaVersion === 1 || ai.enabled) && ai.llmsFull && !ai.markdown)
        throw new Error('合并全文需要先启用 Markdown 内容版本。');
    if (config.schemaVersion === 2 && new Set(config.features.visuals.editableSlots).size !== config.features.visuals.editableSlots.length)
        throw new Error('站点视觉位置不能重复。');
    return config;
}
export const hasSiteComposition = config => !!config && config.scope !== 'features';
// One source of policy; legacy documents remain content stores, never a second
// enabled/mode controller in centralized mode. No content is removed here.
/** @param {string} file @param {Record<string, any>} legacy @param {unknown} config */
export function effectivePolicyFile(file, legacy = {}, config = null) {
    if (config == null)
        return legacy;
    const c = parseSiteConfig(config), f = c.features;
    switch (file.replaceAll('\\', '/')) {
        case 'src/data/site-language-settings.json': return { sourceLocale: 'en', enabledLocales: Object.fromEntries(supportedSiteLocales.map(l => [l, c.locales.selected.includes(l)])) };
        case 'src/data/form-verification.json': return { ...legacy, turnstileEnabled: f.verification.provider === 'turnstile' };
        case 'src/data/catalog-downloads.json': return { ...legacy, mode: f.downloads.mode, enabled: f.downloads.mode !== 'disabled' };
        case 'src/data/customer-reviews.json': return { ...legacy, enabled: f.reviews.enabled };
        case 'src/data/product-editor-settings.json': return { ...legacy, ...f.productEditing };
        case 'src/keystatic/analytics-dashboard.json': return { ...legacy, managerVisible: f.managerAnalytics.visible };
        case 'src/data/article-publisher-settings.json': return { ...legacy, enabled: f.articlePublisher.enabled, ...(c.schemaVersion === 2 ? { ai: { ...legacy.ai, research: f.articlePublisher.research }, images: { ...legacy.images, bodyImage: f.articlePublisher.bodyImage } } : {}) };
        case 'src/data/ai-seo-settings.json': return { ...legacy, ...f.aiDiscovery, ...(!f.aiDiscovery.enabled && c.schemaVersion === 2 ? {multilingual:false,markdown:false,llmsFull:false} : {}) };
        case 'src/data/site-visuals.json': return c.schemaVersion === 2 ? projectVisualControls(legacy, f.visuals.editableSlots) : legacy;
        default: return legacy;
    }
}
export function projectVisualControls(raw, editableSlots) {
    const result = structuredClone(raw || {}), allowed = new Set(editableSlots);
    result.home ||= {}; result.home.heroSlides ||= []; result.home.center ||= {};
    result.pages ||= {}; result.categories ||= [];
    for (const key of allowed) {
        const [group, id] = key.split('.');
        if (group === 'home' && id !== 'center' && !result.home.heroSlides.some(row => row.key === id)) result.home.heroSlides.push({ key: id, visual: {} });
        if (group === 'pages') result.pages[id] ||= {};
        if (group === 'category' && !result.categories.some(row => row.key === id)) result.categories.push({ key: id, visual: {} });
    }
    for (const row of result.home.heroSlides) { row.visual ||= {}; row.visual.enabled = allowed.has(`home.${row.key}`); }
    result.home.center.enabled = allowed.has('home.center');
    for (const [id, value] of Object.entries(result.pages)) value.enabled = allowed.has(`pages.${id}`);
    for (const row of result.categories) { row.visual ||= {}; row.visual.enabled = allowed.has(`category.${row.key}`); }
    return result;
}
export function validateVisualControlSlots(config,slots){
    if(config?.schemaVersion===2&&config.features.visuals.editableSlots.some(key=>!slots.some(slot=>slot.key===key&&slot.supported===true)))throw new Error('站点视觉包含尚未支持的位置。');
}
export function managerPolicyProjection(config) {
    if (!config)
        return null;
    const c = parseSiteConfig(config);
    return { reviewEnabled: c.features.reviews.enabled, analyticsVisible: c.features.managerAnalytics.visible, productEditing: c.features.productEditing, selectedLocales: ['en', ...c.locales.selected] };
}
