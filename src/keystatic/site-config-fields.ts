import { fields } from '@keystatic/core';
import { standardModules, supportedSiteLocales } from '../lib/site-config-schema.mjs';
import { productClassificationFields } from './product-editor-fields';
import {visualSlots} from '../data/site-visual-slots';
import {managerFeatureIds,featureLabels} from '../lib/feature-registry.mjs';
import {featureSupport} from '../data/feature-support.mjs';
const select = (label: string, values: string[], value = values[0]) => fields.select({ label, options: values.map(value => ({ label: value, value })), defaultValue: value });
const enabled = (label: string, value = false) => fields.object({ enabled: fields.checkbox({ label, defaultValue: value }) });
const allVariants = [...new Set(standardModules.filter(x => x.support === 'implemented' && x.kind === 'section').flatMap(x => x.variants))];
const allSiteConfigFields = (version=2) => ({
    schemaVersion: fields.integer({ label: '配置结构版本', defaultValue: version, validation: { min: version, max: version } }),
    modules: fields.object({
        shell: fields.object({ navigation: select('导航', ['standard']), footer: select('页脚', ['standard']) }),
        home: fields.array(fields.object({
            id: fields.select({ label: '模块', options: standardModules.filter(x => x.support === 'implemented' && x.kind === 'section').map(x => ({ label: x.name, value: x.id })), defaultValue: 'hero' }),
            variant: select('布局', allVariants, 'image'),
            contentKey: fields.text({ label: '内容标识', defaultValue: 'hero', description: '与首页内容的标识一致，例如 oem-odm。图片继续使用“站点视觉资源”。' }),
        }), { label: '首页模块与顺序', description: 'Hero保持首位。选择模块后使用它支持的布局；评价/下载须同时开启相应功能。保存后通过现有发布流程验证生效，验证失败不会发布错误版本。', itemLabel: props => standardModules.find(x => x.id === props.fields.id.value)?.name || props.fields.id.value, validation: { length: { min: 1, max: 30 } } }),
    }, { label: '首页方案' }),
    design: fields.object({ direction: select('风格方向', ['technical', 'product-led', 'editorial', 'service-led', 'reference-led']), density: select('信息密度', ['comfortable', 'compact']), motion: select('动效', ['reduced', 'subtle'], 'subtle'), accentColor: fields.text({ label: '强调色 #RRGGBB', defaultValue: '#0f766e' }), accentStrong: fields.text({ label: '深强调色 #RRGGBB', defaultValue: '#075985' }), accentSoft: fields.text({ label: '浅强调色 #RRGGBB', defaultValue: '#ccfbf1' }) }, { label: '设计参数' }),
    features: fields.object({
        ...(version===2?{manager:fields.object(Object.fromEntries(managerFeatureIds.map(id=>[id,fields.checkbox({label:`开放${featureLabels[id as keyof typeof featureLabels]}`,defaultValue:true})])),{label:'Manager 工作区',description:'控制内容管理员可使用的功能；不会删除或撤下公开内容。'})}:{}),
        verification: fields.object({ provider: select('表单验证', ['signed-captcha', 'turnstile']) }),
        downloads: fields.object({ mode: select('下载模式', ['disabled', 'direct', 'protected']) }),
        reviews: enabled('客户评价', true),
        inquiryCart: fields.object({ visible: fields.checkbox({ label: '显示询盘清单', defaultValue: true, description: '只影响清单入口，不移除询盘后端或必要验证。' }) }),
        managerAnalytics: fields.object({ visible: fields.checkbox({ label: '内容管理员可查看访问分析', defaultValue: false }) }),
        articlePublisher: fields.object({enabled:fields.checkbox({label:'AI 文章任务',defaultValue:false}),...(version===2?{research:fields.checkbox({label:'先进行联网研究',defaultValue:true}),bodyImage:fields.checkbox({label:'生成正文配图',defaultValue:false})}:{})},{label:'AI 文章发布',description:'模型、时间和费用参数在开启后的配置页维护。母版永不执行付费任务。'}),
        aiDiscovery: fields.object({ enabled: fields.checkbox({ label: 'AI 内容导航', defaultValue: false }), multilingual: fields.checkbox({ label: '多语言导航', defaultValue: false }), markdown: fields.checkbox({ label: 'Markdown 内容表示', defaultValue: false }), llmsFull: fields.checkbox({ label: '合并全文（须开启Markdown）', defaultValue: false }),...(version===2?{include:fields.object(Object.fromEntries([['products','产品与服务'],['categories','产品分类'],['articles','文章'],['company','企业介绍'],['resources','技术资料与常见问题'],['contact','联系与商务询盘']].map(([key,label])=>[key,fields.checkbox({label,defaultValue:true})])),{label:'收录范围'})}:{}) }),
        ...(version===2?{visuals:fields.object({editableSlots:fields.array(fields.select({label:'允许内容管理员编辑的位置',options:visualSlots.filter(slot=>slot.supported).map(slot=>({label:slot.title,value:slot.key})),defaultValue:'home.primary'}),{label:'站点视觉位置',itemLabel:props=>visualSlots.find(slot=>slot.key===props.value)?.title||props.value,description:'仅列出本站已有位置；没有选择的位置继续原图并保留已选素材。'})},{label:'开放视觉位置'})}:{}),
        productEditing: fields.object(productClassificationFields()),
    }, { label: '业务功能与内容策略' }),
    locales: fields.object({ source: select('唯一源语言', ['en']), selected: fields.array(select('目标语言', supportedSiteLocales), { label: '目标语言', description: '选择不代表已经具备公开条件。仅已审核文案/FAQ与真实页面进入公开语言；关闭保留原内容。', itemLabel: props => props.value }) }, { label: '网站语言' }),
});
export const siteConfigFields = (version=2,scope?:'features') => {
 const result:any=allSiteConfigFields(version);
 if(scope==='features'){
  delete result.modules;delete result.design;
  result.scope=fields.select({label:'配置范围',options:[{label:'现有站点功能',value:'features'}],defaultValue:'features'});
 }
 if(!featureSupport.articlePublisher)result.features.fields.articlePublisher=fields.ignored();
 result.features.fields.verification.fields.provider=select('表单验证',featureSupport.verificationProviders);
 result.features.fields.downloads.fields.mode=select('下载模式',featureSupport.downloadModes);
 return result;
};
export const homeContentFields = () => ({
    version: fields.integer({ label: '数据版本', defaultValue: 1, validation: { min: 1, max: 1 } }),
    sections: fields.array(fields.object({
        key: fields.text({ label: '内容标识', validation: { isRequired: true }, description: '对应首页模块配置的内容标识。' }),
        locale: select('语言', ['en', ...supportedSiteLocales]), approved: fields.checkbox({ label: '本语言内容已审核', defaultValue: false }),
        title: fields.text({ label: '标题', validation: { isRequired: true, length: { max: 200 } } }), description: fields.text({ label: '简介', multiline: true, validation: { length: { max: 2000 } } }),
        items: fields.array(fields.object({ title: fields.text({ label: '项目标题', validation: { isRequired: true, length: { max: 200 } } }), description: fields.text({ label: '说明', multiline: true, validation: { length: { max: 2000 } } }), href: fields.text({ label: '公开站内路径', validation: { isRequired: true }, description: '填写实际存在的英文原始路径；系统按语言解析。不能填写后台、外部网址或编造产品页。' }) }), { label: '具体项目', itemLabel: props => props.fields.title.value, validation: { length: { max: 12 } } }),
    }), { label: '首页内容', itemLabel: props => `${props.fields.key.value} · ${props.fields.locale.value}`, validation: { length: { max: 200 } } }),
});
