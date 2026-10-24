// Public factory contracts; site adapters supply content and visual positions.
import {featureSupport} from '../data/feature-support.mjs';
export const managerFeatureIds = ['products', 'articles', 'translations', 'visuals', 'media', 'publishing'];
export const managerDefaults = Object.freeze(Object.fromEntries(managerFeatureIds.map(id => [id, true])));
export const singletonFeatures = Object.freeze({
    siteConfig: null, homeContent: null, siteFoundation: null, sitePublisher: null,
    siteVisuals: 'visuals', productEditorSettings: 'products', productManager: 'products', productOrder: 'products',
    blogManager: 'articles', aiTranslator: 'translations', productTranslationReview: 'productTranslations', blogTranslationReview: 'articleTranslations',
    imagePool: 'media', customerReviews: 'reviews', analyticsDashboard: null, articlePublisher: 'articlePublisher', aiSeo: 'aiDiscovery',
    formVerification: null, catalogDownloads: 'downloads', siteLanguages: null,
    ...featureSupport.extraSingletons,
});
export const collectionFeatures = Object.freeze({ products: 'products', blog: 'articles', productTranslations: 'products', blogTranslations: 'articles', ...featureSupport.extraCollections });
export const featureLabels = Object.freeze({products:'产品管理',articles:'所有文章',translations:'翻译任务与候选审核',visuals:'站点视觉',media:'媒体管理',publishing:'发布网站更新',reviews:'客户评价',analytics:'访问分析',articlePublisher:'AI 文章发布',aiDiscovery:'AI 内容导航',downloads:'资料下载'});
export const tabFeatures = Object.freeze({ products:'products',order:'products',blog:'articles',translation:'translations','product-drafts':'productTranslations','blog-drafts':'articleTranslations',visuals:'visuals',images:'media',publish:'publishing',reviews:'reviews' });
export const managerRoutes = Object.freeze({
    '/api/manager/products':'products','/api/manager/product-order':'products','/api/manager/product-drafts':'products','/api/manager/product-drafts/[id]/apply':'products','/api/manager/product-deletion':'products',
    '/api/manager/blog':'articles','/api/manager/blog-drafts':'articles','/api/manager/blog-drafts/[id]/apply':'articles','/api/manager/blog-deletion':'articles',
    '/api/manager/review-drafts':'reviews','/api/manager/review-drafts/[id]/apply':'reviews','/api/manager/site-visuals':'visuals','/api/manager/r2/assets':'media',
    '/api/manager/ai/translations':'translations','/api/manager/ai/translation-status':'translations','/api/manager/ai/translation-locales':'contentSources',
    '/api/manager/ai/drafts':'sharedTranslations','/api/manager/ai/draft-preview':'sharedTranslations','/api/manager/content-preview':'sharedContent',
    '/api/manager/deploy/site':'publishing','/api/manager/workspace':null,'/api/manager/status':null,'/api/manager/features':null,
});
export function registeredManagerFeature(pathname,method='GET') {
    const path=pathname.replace(/\/+$/,'').replace(/\/(product|blog|review)-drafts\/[^/]+\/apply$/, '/$1-drafts/[id]/apply');
    if(!Object.hasOwn(managerRoutes,path))throw new Error('此操作暂未开放，本次未保存。');
    if(path==='/api/manager/deploy/site'&&method==='GET')return null;
    return managerRoutes[path];
}
