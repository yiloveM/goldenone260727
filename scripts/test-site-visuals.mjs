import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteVisuals, emptyVisual, validateSiteVisuals, mergeVisualPatch, resolveVisual, visualAt, setVisual } from '../src/lib/site-visuals.mjs';
const slots = [{ key:'home.primary', group:'home', supported:true },{key:'home.center',group:'home',supported:false},{key:'pages.about',group:'pages',supported:true},{key:'category.tools',group:'categories',supported:true}];
const policy = { slots, locales:['en','es'], knownLocales:['en','es','ar'], paths:['/','/about/'], fragments:['#free-design'], origin:'https://fixture.test', cdn:'https://media.fixture.test/assets' };
const base = () => emptySiteVisuals(slots,true);
const patch = (fields = {}) => ({ slots:[{ key:'home.primary', image:'/r2/home/banner.webp', ...fields }] });
test('missing/OFF/empty/ON/re-enable preserve exact existing desktop and mobile fallbacks',()=>{
  let value=validateSiteVisuals(null,policy); assert.equal(resolveVisual(value,slots[0],'old','old-mobile').image,'old');
  value=base();assert.deepEqual(resolveVisual(value,slots[0],'old','old-mobile'),{image:'old',mobileImage:'old-mobile',active:false,alt:'',focusX:50,focusY:50});
  value=mergeVisualPatch(value,patch(),policy);assert.equal(resolveVisual(value,slots[0],'old','old-mobile').mobileImage,'/r2/home/banner.webp');
  value.home.heroSlides[0].visual.enabled=false;assert.equal(resolveVisual(value,slots[0],'old','old-mobile').mobileImage,'old-mobile');
  value.home.heroSlides[0].visual.enabled=true;assert.equal(resolveVisual(value,slots[0],'old').image,'/r2/home/banner.webp');
});
test('unknown extensions, media, closed-language text and owner settings survive a content patch',()=>{
 const value=base();value.extension={customer:'keep'};value.home.heroSlides[0].visual.imageMetadata=[{alt:'preserve'}];value.home.heroSlides[0].visual.localizedAlts=[{locale:'ar',text:'retained'}];
 const next=mergeVisualPatch(value,patch({localizedAlts:[{locale:'es',text:'Texto'}]}),policy);assert.deepEqual(next.extension,value.extension);assert.deepEqual(next.home.heroSlides[0].visual.imageMetadata,value.home.heroSlides[0].visual.imageMetadata);assert.equal(next.home.heroSlides[0].visual.localizedAlts.length,2);assert.deepEqual(value.home.heroSlides[0].visual.image,'');
});
test('Manager cannot enable slots or write arbitrary keys, closed positions or languages',()=>{
 assert.throws(()=>mergeVisualPatch(base(),patch({enabled:true}),policy));
 const value=base();value.home.heroSlides[0].visual.enabled=false;assert.throws(()=>mergeVisualPatch(value,patch(),policy));
 for(const payload of [{slots:[{key:'home.center',image:'/r2/a.webp'}]},{slots:[{key:'../secrets',image:'/r2/a.webp'}]},patch({localizedAlts:[{locale:'ar',text:'forbidden'}]}),patch({script:'bad'}),{...patch(),path:'.env'}])assert.throws(()=>mergeVisualPatch(base(),payload,policy));
});
test('malformed types, ranges, arrays, versions and duplicate slots are rejected together',()=>{
 for(const fields of [{image:42},{focusX:101},{focusY:-1},{focusX:12.4},{localizedAlts:{}},{localizedAlts:[{locale:'es',text:'a'},{locale:'es',text:'b'}]}])assert.throws(()=>mergeVisualPatch(base(),patch(fields),policy));
 assert.throws(()=>validateSiteVisuals({...base(),version:2},policy));assert.throws(()=>validateSiteVisuals({...base(),home:{heroSlides:[{key:'primary',visual:emptyVisual()},{key:'primary',visual:emptyVisual()}]}},policy));
 assert.throws(()=>mergeVisualPatch(base(),{slots:[...patch().slots,...patch().slots]},policy));
});
test('image allowlist rejects foreign sites, credentials, documents, private paths and traversal',()=>{
 for(const image of ['https://other.test/a.webp','https://media.fixture.test/elsewhere/a.webp','https://u:p@media.fixture.test/assets/a.webp','/r2/a.pdf','/api/private.webp','//other.test/a.webp','/r2/../x.webp','/r2/%2e%2e/x.webp','javascript:alert(1)','/r2/a.webp?x=1',"/r2/a');x.webp"]){assert.throws(()=>mergeVisualPatch(base(),patch({image}),policy),image);}
 assert.equal(mergeVisualPatch(base(),patch({image:'https://media.fixture.test/assets/a.webp'}),policy).home.heroSlides[0].visual.image,'https://media.fixture.test/assets/a.webp');
});
test('safe CTA uses only actual declared public destinations and explicit locale text',()=>{
 for(const href of ['https://evil.test','/api/','//evil.test','/missing/','#unknown'])assert.throws(()=>mergeVisualPatch(base(),{...patch(),primaryCta:{href,labels:[{locale:'en',text:'Go'}]}},policy));
 const value=mergeVisualPatch(base(),{...patch(),primaryCta:{href:'/about/',labels:[{locale:'en',text:'About'},{locale:'es',text:'Acerca'}]}},policy);assert.equal(value.home.primaryCta.href,'/about/');
});
test('nested encoded traversal and malformed URL escapes are rejected for both media roots',()=>{
 for (const image of ['/r2/%252e%252e/x.webp','/r2/a%255cx.webp','/r2/%broken.webp','https://media.fixture.test/assets/%252e%252e/x.webp','https://media.fixture.test/assets/a%2527.webp']) assert.throws(()=>mergeVisualPatch(base(),patch({image}),policy),image);
});
test('shared product center stays outside the site adapter and localized alt never invents translation',()=>{
 const value=base();setVisual(value,slots[1],{...emptyVisual(true),image:'/r2/center.webp'});assert.equal(resolveVisual(value,slots[1],'product-fallback').image,'product-fallback');
 const next=mergeVisualPatch(base(),patch({alt:'English'}),policy);assert.equal(resolveVisual(next,slots[0],'old','old','es').alt,'');
});
test('missing/null focal points normalize to 50 and two customer configs remain independent',()=>{
 const first=base();first.home.heroSlides[0].visual.focusX=null;delete first.home.heroSlides[0].visual.focusY;assert.equal(validateSiteVisuals(first,policy).home.heroSlides[0].visual.focusY,50);
 const next=mergeVisualPatch(first,patch(),policy);assert.equal(visualAt(next,slots[0]).focusX,50);assert.equal(visualAt(base(),slots[0]).image,'');
 const hosted=mergeVisualPatch(base(),patch({image:'https://media.fixture.test/assets/a.webp'}),policy);assert.throws(()=>validateSiteVisuals(hosted,{...policy,origin:'https://another.test',cdn:'https://another-media.test'}));
});
