import { parseSiteConfig } from './site-config-core.mjs';
import { managerDefaults, singletonFeatures, collectionFeatures } from './feature-registry.mjs';
import {featureSupport} from '../data/feature-support.mjs';
export function validateFeatureSupport(config,support=featureSupport){
 if(!config)return;
 const f=config.features;
 if(!support.articlePublisher&&f.articlePublisher.enabled||!support.verificationProviders.includes(f.verification.provider)||!support.downloadModes.includes(f.downloads.mode))throw new Error('本站尚未支持此功能设置；原内容仍保留。');
}
export function featurePolicy(config, legacy = {}) {
    const c=config==null?null:parseSiteConfig(config),f=c?.features;
    validateFeatureSupport(c);
    const flags={ ...managerDefaults, ...(c?.schemaVersion===2?f.manager:{}), reviews:f?f.reviews.enabled:legacy.reviews?.enabled!==false, analytics:f?f.managerAnalytics.visible:legacy.analytics?.managerVisible===true,
        articlePublisher:f?f.articlePublisher.enabled:legacy.publisher?.enabled===true, aiDiscovery:f?f.aiDiscovery.enabled:legacy.aiSeo?.enabled===true,
        downloads:f?f.downloads.mode!=='disabled':legacy.downloads?.mode?legacy.downloads.mode!=='disabled':legacy.downloads?.enabled===true };
    return { ...flags, productTranslations:flags.products&&flags.translations, articleTranslations:flags.articles&&flags.translations,
        translations:flags.translations&&(flags.products||flags.articles),contentSources:flags.products||flags.articles,
        visualConfiguration:flags.visuals&&(c?.schemaVersion!==2||f.visuals.editableSlots.length>0) };
}
export function interfaceConfig(base, flags) {
    const permitted=(registry,key)=>{if(!Object.hasOwn(registry,key))throw new Error('未登记的后台页面：'+key);const id=registry[key];return id==null||flags[id]===true;};
    const singletons=Object.fromEntries(Object.entries(base.singletons||{}).filter(([key])=>permitted(singletonFeatures,key)&&(key!=='siteVisuals'||flags.visualConfiguration)));
    const collections=Object.fromEntries(Object.entries(base.collections||{}).filter(([key])=>permitted(collectionFeatures,key)));
    const allowed=new Set([...Object.keys(singletons),...Object.keys(collections),'---']);
    const navigation=base.ui?.navigation;
    return {...base,singletons,collections,ui:{...base.ui,navigation:Array.isArray(navigation)?navigation.filter(k=>allowed.has(k)):Object.fromEntries(Object.entries(navigation||{}).map(([group,keys])=>[group,keys.filter(k=>allowed.has(k))]))}};
}
export function featureAllowed(flags, feature) {
    if(feature==null)return true;
    if(feature==='sharedTranslations')return flags.products||flags.articles;
    if(feature==='sharedContent')return flags.products||flags.articles||flags.visuals;
    return flags[feature]===true;
}
export function managerFeatures(flags){return Object.fromEntries([...Object.keys(managerDefaults),'reviews','analytics','productTranslations','articleTranslations','contentSources'].map(id=>[id,flags[id]===true]));}
export function ownerFormDefaults(config,legacy={}){const value=config?.features?.downloads?.mode||legacy.downloads?.mode;return{downloadMode:['disabled','direct','protected'].includes(value)?value:legacy.downloads?.enabled===true?'protected':'disabled'};}
