import type {APIRoute} from 'astro';
import {requireInternalPortalAccess} from '../../../lib/admin-portals';
import {getRuntimeEnv} from '../../../lib/runtime-env';
import {ownerFeatureState,featureResponse} from '../../../lib/manager/features';
import {ownerFormDefaults} from '../../../lib/feature-policy.mjs';
export const prerender=false;
export const GET:APIRoute=async({locals,request,url})=>{const env=getRuntimeEnv(locals);if(!import.meta.env.DEV){const denied=requireInternalPortalAccess(request,env,'keystatic');if(denied)return denied;}try{const state=await ownerFeatureState(env,request,url.searchParams.get('branch')||'');return Response.json({features:state.features,revision:state.revision,schemaVersion:state.config?.schemaVersion||null,scope:state.config&&'scope'in state.config?state.config.scope:undefined,formDefaults:ownerFormDefaults(state.config,'legacy' in state?state.legacy:{})},{headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});}catch{return featureResponse(503);}};
