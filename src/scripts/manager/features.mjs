import {tabFeatures,registeredManagerFeature} from '../../lib/feature-registry.mjs';
import {featureAllowed} from '../../lib/feature-policy.mjs';
export function installFeatures(context){
 const ids=['products','articles','translations','visuals','media','publishing','reviews','analytics','productTranslations','articleTranslations','contentSources'];
 let flags=Object.fromEntries(ids.map(id=>[id,false])),pending=null;
 const originalRequest=context.requestJson,originalForm=context.requestForm,originalPicker=context.openImagePicker;
 const canUseTab=tab=>!Object.hasOwn(tabFeatures,tab)||flags[tabFeatures[tab]]===true;
 function apply(next){const previous=flags;flags=next;context.features=flags;context.managerReviewSystemEnabled=flags.reviews===true;
  document.querySelectorAll('[data-tab],[data-workspace],[data-workspace-target]').forEach(node=>{const tab=node.dataset.tab||node.dataset.workspace||node.dataset.workspaceTarget;node.hidden=!canUseTab(tab);});
  document.querySelectorAll('[data-panel]').forEach(panel=>{panel.inert=!canUseTab(panel.dataset.panel);});
  document.querySelectorAll('[data-image-field],[data-image-list],[data-rich-command="image"],#assetUploadButton,#imagePickerUploadButton').forEach(node=>{node.disabled=!flags.media;});
  if(context.analyticsLink)context.analyticsLink.hidden=!flags.analytics;
  const analysisGroup=context.$('managerAnalyticsGroup');if(analysisGroup)analysisGroup.hidden=!flags.analytics;
  document.querySelectorAll('[data-review-fields]').forEach(node=>{node.hidden=!flags.reviews;node.inert=!flags.reviews;});
  if(document.documentElement.dataset.managerReady==='true'){
    if(flags.contentSources&&!previous.contentSources)void context.loadTranslationLocales().catch(()=>{});
    if(flags.products&&!previous.products)void context.loadProducts().catch(error=>context.setStatus('statusText',error.message,true));
  }
  if(!canUseTab(context.activePanel())){context.activateTab('dashboard');context.setStatus('managerFeatureStatus','功能设置已更新。当前编辑仍保留，请联系站长开启后继续。');}
 }
 context.requestJson=async(url,options={})=>{const path=new URL(url,location.origin).pathname;if(path.startsWith('/api/manager/')){const feature=registeredManagerFeature(path,options.method||'GET');if(!featureAllowed(flags,feature))throw new Error('站长暂未开放此功能，本次未保存；已有内容仍保留。');}try{return await originalRequest(url,options);}catch(error){if(error?.status===403)void loadFeaturePolicy().catch(()=>{});throw error;}};
 context.requestForm=async(...args)=>{if(!flags.media)throw new Error('站长暂未开放媒体管理，本次未上传。');return originalForm(...args);};
 context.openImagePicker=async(...args)=>{if(!flags.media)throw new Error('站长暂未开放媒体管理，可继续使用已有图片。');return originalPicker(...args);};
 const loadFeaturePolicy=()=>{if(pending)return pending;pending=originalRequest('/api/manager/features').then(data=>{if(!data.features||ids.some(id=>typeof data.features[id]!=='boolean'))throw new Error('功能设置暂时无法核验，请稍后重试。');apply(data.features);return data.features;}).catch(error=>{apply(Object.fromEntries(ids.map(id=>[id,false])));context.setStatus('managerFeatureStatus','暂时无法核验功能设置。当前编辑仍保留，请稍后重试。',true);throw error;}).finally(()=>{pending=null;});return pending;};
 Object.assign(context,{features:flags,canUseTab,loadFeaturePolicy});apply(flags);
 const timer=setInterval(()=>{if(!document.hidden)void loadFeaturePolicy().catch(()=>{});},15000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
