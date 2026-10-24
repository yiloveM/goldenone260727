import { z } from 'astro/zod';
import catalog from '../config/standard-modules.json' with { type: 'json' };
export const supportedSiteLocales = ['zh', 'ar', 'hi', 'es', 'fr', 'bn', 'pt', 'ru', 'ur', 'de', 'tr', 'fil', 'ko', 'uz', 'ja', 'ms', 'nl', 'el', 'th'];
export const standardModules = catalog.modules;
const flag = () => z.strictObject({ enabled: z.boolean() });
const hex = z.string().regex(/^#[a-f\d]{6}$/i);
const key = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
export const siteConfigV1Schema = z.strictObject({
    schemaVersion: z.literal(1),
    modules: z.strictObject({
        shell: z.strictObject({ navigation: z.literal('standard'), footer: z.literal('standard') }),
        home: z.array(z.strictObject({ id: key, variant: key, contentKey: key })).min(1).max(30),
    }),
    design: z.strictObject({ direction: z.enum(['technical', 'product-led', 'editorial', 'service-led', 'reference-led']), density: z.enum(['comfortable', 'compact']), motion: z.enum(['reduced', 'subtle']), accentColor: hex, accentStrong: hex, accentSoft: hex }),
    features: z.strictObject({
        verification: z.strictObject({ provider: z.enum(['signed-captcha', 'turnstile']) }),
        downloads: z.strictObject({ mode: z.enum(['disabled', 'direct', 'protected']) }),
        reviews: flag(), inquiryCart: z.strictObject({ visible: z.boolean() }), managerAnalytics: z.strictObject({ visible: z.boolean() }), articlePublisher: flag(),
        aiDiscovery: z.strictObject({ enabled: z.boolean(), multilingual: z.boolean(), markdown: z.boolean(), llmsFull: z.boolean() }),
        productEditing: z.strictObject({ offeringType: z.enum(['physical-product', 'service', 'solution']), modelStrategy: z.enum(['single-model', 'series', 'configurable', 'not-applicable']) }),
    }),
    locales: z.strictObject({ source: z.literal('en'), selected: z.array(z.enum(supportedSiteLocales)).max(supportedSiteLocales.length) }),
});
export const siteConfigSchema = siteConfigV1Schema.extend({
    schemaVersion: z.literal(2),
    features: siteConfigV1Schema.shape.features.extend({
        manager: z.strictObject({ products: z.boolean(), articles: z.boolean(), translations: z.boolean(), visuals: z.boolean(), media: z.boolean(), publishing: z.boolean() }),
        visuals: z.strictObject({ editableSlots: z.array(z.string().regex(/^(home|pages|category)\.[a-zA-Z0-9-]+$/)).max(100) }),
        articlePublisher: z.strictObject({ enabled: z.boolean(), research: z.boolean(), bodyImage: z.boolean() }),
        aiDiscovery: siteConfigV1Schema.shape.features.shape.aiDiscovery.extend({ include: z.strictObject({ products: z.boolean(), categories: z.boolean(), articles: z.boolean(), company: z.boolean(), resources: z.boolean(), contact: z.boolean() }) }),
    }),
});
export const siteFeatureConfigSchema = z.strictObject({
    schemaVersion: z.literal(2), scope: z.literal('features'),
    features: siteConfigSchema.shape.features, locales: siteConfigSchema.shape.locales,
});
export { parseSiteConfig, effectivePolicyFile, managerPolicyProjection } from './site-config-core.mjs';
export const siteConfigJsonSchema = () => z.toJSONSchema(siteConfigSchema);
export const siteFeatureConfigJsonSchema = () => z.toJSONSchema(siteFeatureConfigSchema);
