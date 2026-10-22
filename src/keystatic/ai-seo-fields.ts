import { fields } from '@keystatic/core';
import { llmsStatusField } from './llms-status-field';

export const aiSeoFields = () => ({
  enabled:fields.checkbox({label:'启用 AI 内容导航（llms.txt）',defaultValue:false,description:'为会读取此文件的 AI 工具提供公开资料导航；不改变 Google 排名。保存后使用现有“发布网站更新”生效。'}),
  multilingual:fields.checkbox({label:'生成各公开语言的导航',defaultValue:false,description:'仅收录本站已开放且有真实内容的语言页面，缺少翻译会跳过。'}),
  markdown:fields.checkbox({label:'生成 Markdown 内容版本',defaultValue:false,description:'从正式页面的同一内容生成，无需另外维护正文；无法安全转换时仍链接原网页。'}),
  llmsFull:fields.checkbox({label:'生成合并全文（可选）',defaultValue:false,description:'须同时开启 Markdown；不是 llms.txt 规范的必需文件。超出限制的完整章节会跳过并在状态中说明。'}),
  maxEntries:fields.integer({label:'每种语言的最多收录条目',defaultValue:500,validation:{min:1,max:2000}}),
  maxFullBytes:fields.integer({label:'每种语言合并全文的大小上限（字节）',defaultValue:1048576,validation:{min:65536,max:2097152}}),
  include:fields.object({
    products:fields.checkbox({label:'产品与服务详情',defaultValue:true}),
    categories:fields.checkbox({label:'产品分类',defaultValue:true}),
    articles:fields.checkbox({label:'文章',defaultValue:true}),
    company:fields.checkbox({label:'企业介绍',defaultValue:true}),
    resources:fields.checkbox({label:'技术资料与常见问题',defaultValue:true}),
    contact:fields.checkbox({label:'联系与商务询盘页面',defaultValue:true}),
  },{label:'收录内容'}),
  summaries:fields.array(fields.object({
    locale:fields.text({label:'本站语言代码',validation:{isRequired:true},description:'使用“网站语言”中的代码，例如 en、es。每种语言仅填写一次，不自动翻译。'}),
    text:fields.text({label:'已核实的企业简介',multiline:true,validation:{isRequired:true,length:{max:2000}}}),
  }),{label:'自定义语言简介（选填）',description:'不填写时，使用该语言正式页面已有的简介。',itemLabel:props=>props.fields.locale.value||'语言简介'}),
  excludePaths:fields.array(fields.text({label:'正式页面路径',validation:{isRequired:true},description:'精确路径，须以 / 开头；不能填写域名、查询参数、通配符或后台路径。'}),{label:'排除页面',itemLabel:props=>props.value||'页面'}),
  status:llmsStatusField(),
});
