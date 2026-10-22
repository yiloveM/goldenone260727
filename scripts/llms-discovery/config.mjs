export const defaults = Object.freeze({enabled:false,multilingual:false,markdown:false,llmsFull:false,maxEntries:500,maxFullBytes:1048576,
  include:{products:true,categories:true,articles:true,company:true,resources:true,contact:true},summaries:[],excludePaths:[]});
export const kinds = Object.keys(defaults.include);
const own = (value,keys) => {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key))) throw new Error('Invalid AI discovery configuration fields.');
};
export const publicPath = value => {
  if(typeof value!=='string' || !value.startsWith('/') || /[\\?#\u0000-\u0020<>"`]/u.test(value) || value.startsWith('//') || /%(?:2e|2f|5c|00)/i.test(value)) return false;
  if(value.split('/').some(part=>part==='.'||part==='..')) return false;
  return !/^\/(?:api|manager|keystatic|r2|_astro|_legacy-content|_llms)(?:\/|$)/i.test(value);
};
export function validateConfig(value={}) {
  own(value,Object.keys(defaults));
  const config={...defaults,...value,include:{...defaults.include,...value.include}};
  for(const key of ['enabled','multilingual','markdown','llmsFull']) if(typeof config[key]!=='boolean') throw new Error(`Invalid ${key}.`);
  for(const [key,min,max] of [['maxEntries',1,2000],['maxFullBytes',65536,2097152]]) if(!Number.isInteger(config[key])||config[key]<min||config[key]>max) throw new Error(`Invalid ${key}.`);
  own(config.include,kinds); for(const flag of Object.values(config.include)) if(typeof flag!=='boolean') throw new Error('Invalid include setting.');
  if(!Array.isArray(config.summaries)||config.summaries.length>50||!Array.isArray(config.excludePaths)||config.excludePaths.length>2000) throw new Error('Invalid discovery lists.');
  const locales=new Set();
  for(const summary of config.summaries){own(summary,['locale','text']);if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(summary.locale)||typeof summary.text!=='string'||summary.text.length>2000||locales.has(summary.locale))throw new Error('Invalid or duplicate localized summary.');locales.add(summary.locale);}
  for(const path of config.excludePaths) if(!publicPath(path)||path.includes('*')) throw new Error('Exclusions must be exact public paths.');
  return config;
}
export const configSnapshot = value => {
  const ordered=item=>Array.isArray(item)?item.map(ordered):item&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,ordered(item[key])])):item;
  return JSON.stringify(ordered(validateConfig(value)));
};
