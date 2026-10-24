import type {APIRoute} from 'astro';
import {getRuntimeEnv,requireManagerAccess} from '../../../lib/manager/access';
import {readFeatureState,featureResponse} from '../../../lib/manager/features';
import {managerFeatures} from '../../../lib/feature-policy.mjs';
export const prerender=false;
export const GET:APIRoute=async({locals,request})=>{const env=getRuntimeEnv(locals),access=requireManagerAccess(request,env);if(access.response)return access.response;try{const state=(locals as any).featureState||await readFeatureState(env);return Response.json({features:managerFeatures(state.features)},{headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});}catch{return featureResponse(503);}};
