import { collection, config, fields, singleton } from '@keystatic/core';
import { productManagerField } from './src/keystatic/product-manager-field';
import { productOrderField } from './src/keystatic/product-order-field';
import { r2ImagePoolField } from './src/keystatic/r2-image-pool-field';
import { r2ImageUrlField } from './src/keystatic/r2-image-url-field';
import { r2MarkdocComponents } from './src/keystatic/r2-markdoc-components';
import { aiTranslatorField } from './src/keystatic/ai-translator-field';
import { sitePublisherField } from './src/keystatic/site-publisher-field';
import { translationDraftReviewField } from './src/keystatic/translation-draft-review-field';
import { siteLanguageBulkActionsField, siteLanguageCheckboxField } from './src/keystatic/site-language-selector-field';
import siteLocaleConfig from './src/data/site-locales.json';

const isProduction = process.env.NODE_ENV === 'production';
const configuredGitHubRepo = String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO || '').trim();
const githubAppSlug = String(import.meta.env.PUBLIC_KEYSTATIC_GITHUB_APP_SLUG || '').trim();

if (isProduction && (!configuredGitHubRepo || configuredGitHubRepo === 'your-org/businessweb')) {
  throw new Error(
    'Set PUBLIC_KEYSTATIC_GITHUB_REPO to the real owner/repo in wrangler.toml before building for production.'
  );
}
if (isProduction && !githubAppSlug) {
  throw new Error(
    'Set PUBLIC_KEYSTATIC_GITHUB_APP_SLUG to the GitHub App slug in wrangler.toml before building for production.'
  );
}

const [githubOwner = 'your-org', githubName = 'businessweb'] = (
  configuredGitHubRepo || 'your-org/businessweb'
).split('/');

const translationLocaleOptions = [
  { label: 'Simplified Chinese（简体中文）', value: 'zh' },
  { label: 'Arabic（阿拉伯语）', value: 'ar' },
  { label: 'Hindi（印地语）', value: 'hi' },
  { label: 'Spanish（西班牙语）', value: 'es' },
  { label: 'French（法语）', value: 'fr' },
  { label: 'Bengali（孟加拉语）', value: 'bn' },
  { label: 'Portuguese（葡萄牙语）', value: 'pt' },
  { label: 'Russian（俄语）', value: 'ru' },
  { label: 'Urdu（乌尔都语）', value: 'ur' },
  { label: 'German（德语）', value: 'de' },
  { label: 'Turkish（土耳其语）', value: 'tr' },
  { label: 'Filipino（菲律宾语）', value: 'fil' },
  { label: 'Korean（韩语）', value: 'ko' },
  { label: 'Uzbek（乌兹别克语）', value: 'uz' },
] as const;

const localeEntries = (siteLocaleConfig.locales || {}) as Record<string, {
  approved?: boolean;
  phrases?: Record<string, string>;
  faqs?: Array<{ question?: string; answer?: string }>;
}>;
const requiredPhraseKeys = siteLocaleConfig.requiredPhraseKeys || [];
const requiredFaqCount = Number(siteLocaleConfig.requiredFaqCount || 0);
const isStaticLocaleReady = (locale: string) => {
  const entry = localeEntries[locale];
  if (!entry || entry.approved !== true) return false;
  if (requiredPhraseKeys.some(key => !entry.phrases?.[key]?.trim())) return false;
  return Array.isArray(entry.faqs)
    && entry.faqs.length === requiredFaqCount
    && entry.faqs.every(item => item.question?.trim() && item.answer?.trim());
};
const targetLocaleCodes = translationLocaleOptions.map(option => option.value);
const targetLanguageFields = {
  selectionTools: siteLanguageBulkActionsField({ localeCodes: targetLocaleCodes }),
  ...Object.fromEntries(
    translationLocaleOptions.map(option => [
      option.value,
      siteLanguageCheckboxField({
        code: option.value,
        label: `${option.label} · ${option.value}`,
        defaultValue: false,
        description: isStaticLocaleReady(option.value)
          ? '固定 UI、页面文案和 FAQ 已审核。勾选并保存后可进入公开站点和翻译工作流。'
          : '勾选并保存后会出现在 AI 翻译选项中；固定文案审核完成前不会作为公开站点语言上线。',
      }),
    ])
  ),
};

const specTablesTranslationField = () =>
  fields.array(
    fields.object({
      title: fields.text({ label: '表格标题' }),
      columns: fields.array(fields.text({ label: '列名' }), {
        label: '列',
        itemLabel: props => props.value || '列',
      }),
      headerRows: fields.array(
        fields.object({
          cells: fields.array(
            fields.object({
              text: fields.text({ label: '表头文字' }),
              colspan: fields.integer({ label: '跨列数', defaultValue: 1 }),
              rowspan: fields.integer({ label: '跨行数', defaultValue: 1 }),
            }),
            { label: '表头单元格', itemLabel: props => props.fields.text.value || '单元格' }
          ),
        }),
        { label: '复杂表头行', itemLabel: () => '表头行' }
      ),
      rows: fields.array(
        fields.array(fields.text({ label: '单元格' }), {
          label: '单元格',
          itemLabel: props => props.value || '单元格',
        }),
        { label: '表格行', itemLabel: () => '行' }
      ),
    }),
    { label: '型号参数表', itemLabel: props => props.fields.title.value || '参数表' }
  );

export default config({
  storage: isProduction
    ? { kind: 'github', repo: { owner: githubOwner, name: githubName } }
    : { kind: 'local' },
  ui: {
    brand: { name: '通用企业网站内容管理' },
    navigation: {
      '站点设置': ['siteFoundation', 'siteLanguages', 'customerReviews'],
      '内容管理': ['productManager', 'productOrder', 'products', 'blog', 'aiTranslator', 'productTranslationReview', 'blogTranslationReview', 'sitePublisher'],
      '媒体资源': ['imagePool'],
    },
  },
  singletons: {
    customerReviews: singleton({
      label: '评价系统',
      path: 'src/data/customer-reviews',
      format: 'json',
      schema: {
        enabled: fields.checkbox({
          label: '启用前台评价系统（总开关）',
          defaultValue: true,
          description: '关闭后，首页和全部产品详情页不显示评价区，评价 Review 结构化数据也不会输出。数据会保留，重新开启即可恢复。',
        }),
        summary: fields.object({
          rating: fields.text({ label: '店铺聚合评分', defaultValue: '4.9', description: '只能填写已经核实的公开评分，例如 4.9。' }),
          source: fields.text({ label: '评分来源名称', defaultValue: 'Alibaba.com' }),
          profileUrl: fields.text({ label: '店铺评价页链接', defaultValue: '' }),
          checkedOn: fields.text({ label: '最后核实日期（YYYY-MM-DD）', defaultValue: '' }),
        }, {
          label: '店铺总评分',
          description: '评价数量无需填写，系统会自动统计下方评价列表中的记录总数。',
        }),
        reviews: fields.array(
          fields.object({
            id: fields.text({ label: '唯一 ID', description: '使用英文小写、数字和短横线，例如 alibaba-order-20260813-01。' }),
            published: fields.checkbox({ label: '前台显示', defaultValue: true }),
            kind: fields.select({
              label: '数据类型',
              options: [
                { label: '真实且已核实', value: 'verified' },
                { label: '样式演示（不进入 SEO）', value: 'demo' },
              ],
              defaultValue: 'verified',
            }),
            rating: fields.select({
              label: '星级',
              options: [{ label: '5 星', value: '5' }, { label: '4 星', value: '4' }],
              defaultValue: '5',
            }),
            quote: fields.text({ label: '评价原文', multiline: true }),
            buyerLabel: fields.text({ label: '买家显示名称', defaultValue: 'Verified Alibaba buyer' }),
            country: fields.text({ label: '国家/地区（可空）', defaultValue: '' }),
            date: fields.text({ label: '评价日期（YYYY-MM-DD）', defaultValue: '' }),
            projectType: fields.text({ label: '产品或项目类型', defaultValue: '' }),
            source: fields.text({ label: '来源名称', defaultValue: 'Alibaba.com' }),
            sourceUrl: fields.text({ label: '该评价的可核实链接', defaultValue: '' }),
            productSlugs: fields.array(fields.text({ label: '产品 Slug' }), {
              label: '关联产品 Slug（留空则仅作为通用评价）',
              itemLabel: props => props.value || '产品 Slug',
            }),
            seoEligible: fields.checkbox({
              label: '允许进入 Review SEO 结构化数据',
              defaultValue: false,
              description: '仅当数据类型为“真实且已核实”，并填写买家名称、日期、来源链接和关联产品后才能勾选。',
            }),
          }),
          {
            label: '评价列表（数量自动统计）',
            description: '新增或删除评价后，前台评价数量会随列表记录总数自动变化。',
            itemLabel: props => props.fields.buyerLabel.value || props.fields.id.value || '评价',
          }
        ),
      },
    }),
    siteLanguages: singleton({
      label: '网站语言',
      path: 'src/data/site-language-settings',
      format: 'json',
      schema: {
        sourceLocale: fields.select({
          label: '默认源语言（固定）',
          options: [{ label: 'English（英语） · en', value: 'en' }],
          defaultValue: 'en',
          description: '英语是唯一源语言，不能关闭。其它语言均从已核实的英语内容翻译。',
        }),
        enabledLocales: fields.object(targetLanguageFields, {
          label: '启用的目标语言',
          description: '保存并完成自动部署后，/manager/ 和 AI 翻译只显示已勾选语言。公开站点还要求该语言的固定文案和 FAQ 已审核。',
        }),
      },
    }),
    siteFoundation: singleton({
      label: '品牌与行业基础',
      path: 'src/data/industry-profile.json',
      format: 'json',
      schema: {
        version: fields.integer({ label: '配置结构版本', defaultValue: 1 }),
        lifecycle: fields.select({
          label: '建站阶段',
          options: [
            { label: '模板状态 - 尚未配置', value: 'template' },
            { label: '行业资料已完成', value: 'briefed' },
            { label: 'SEO 与 GEO 调研已完成', value: 'researched' },
            { label: '生产站已完成并通过检查', value: 'production-ready' },
          ],
          defaultValue: 'template',
        }),
        brand: fields.object({
          name: fields.text({ label: '对外品牌名称', defaultValue: 'BusinessWeb' }),
          tagline: fields.text({ label: '对外品牌短句', defaultValue: 'International B2B brand platform' }),
          legalName: fields.text({ label: '公司法定名称', defaultValue: '' }),
          description: fields.text({ label: '面向客户的品牌定位', multiline: true, defaultValue: '' }),
          email: fields.text({ label: '询盘邮箱', defaultValue: 'sales@example.com' }),
          phone: fields.text({ label: '电话', defaultValue: '' }),
          whatsapp: fields.text({ label: 'WhatsApp URL', defaultValue: '' }),
          address: fields.text({ label: '办公地址', multiline: true, defaultValue: '' }),
          factoryAddress: fields.text({ label: '工厂或运营地址', multiline: true, defaultValue: '' }),
          socialProfiles: fields.array(fields.text({ label: '主页 URL' }), {
            label: '已核实的公开社交主页',
            itemLabel: props => props.value || '主页 URL',
          }),
        }),
        market: fields.object({
          industry: fields.text({ label: '行业', defaultValue: 'Your industry' }),
          businessModel: fields.select({
            label: '商业与产品模式',
            options: [
              { label: '尚未确定', value: 'undetermined' },
              { label: '工业产品系列与型号目录', value: 'industrial-series' },
              { label: '独立实物产品', value: 'discrete-products' },
              { label: '专业服务', value: 'services' },
              { label: '工程解决方案', value: 'solutions' },
              { label: '产品与服务混合模式', value: 'hybrid' },
            ],
            defaultValue: 'undetermined',
          }),
          primaryLocale: fields.text({ label: '源内容语言（保持 en）', defaultValue: 'en' }),
          markets: fields.array(fields.text({ label: '目标市场' }), {
            label: '目标市场',
            itemLabel: props => props.value || '市场',
          }),
          buyerRoles: fields.array(fields.text({ label: '采购者角色' }), {
            label: '主要采购者角色',
            itemLabel: props => props.value || '采购者角色',
          }),
          positioning: fields.text({ label: '市场定位', multiline: true, defaultValue: '' }),
        }),
        seo: fields.object({
          coreKeywords: fields.array(fields.text({ label: '英语核心关键词' }), {
            label: '核心关键词',
            itemLabel: props => props.value || '关键词',
          }),
          longTailKeywords: fields.array(fields.text({ label: '长尾关键词' }), {
            label: '已核实的长尾关键词',
            itemLabel: props => props.value || '关键词',
          }),
          entityTopics: fields.array(fields.text({ label: '实体或主题' }), {
            label: '实体与主题覆盖',
            itemLabel: props => props.value || '实体',
          }),
          searchIntentSummary: fields.text({ label: '当前搜索意图摘要', multiline: true, defaultValue: '' }),
          competitorReferences: fields.array(fields.text({ label: '竞品或搜索结果参考 URL' }), {
            label: '调研参考资料',
            itemLabel: props => props.value || '参考资料',
          }),
          lastResearchDate: fields.text({ label: '最近一次实时数据调研日期（YYYY-MM-DD）', defaultValue: '' }),
        }),
        productArchitecture: fields.object({
          offeringType: fields.select({
            label: '产品目录结构',
            options: [
              { label: '尚未确定', value: 'undetermined' },
              { label: '工业产品系列与型号参数表', value: 'industrial-series' },
              { label: '独立产品目录', value: 'discrete-products' },
              { label: '服务', value: 'services' },
              { label: '解决方案页面', value: 'solutions' },
              { label: '混合模式', value: 'hybrid' },
            ],
            defaultValue: 'undetermined',
          }),
          categoryPlans: fields.array(
            fields.object({
              name: fields.text({ label: '分类名称' }),
              description: fields.text({ label: '面向客户的分类描述', multiline: true }),
              highlights: fields.array(fields.text({ label: '亮点' }), {
                label: '分类亮点',
                itemLabel: props => props.value || '亮点',
              }),
            }),
            { label: '规划中的公开分类', itemLabel: props => props.fields.name.value || '分类' }
          ),
          commonAttributes: fields.array(fields.text({ label: '系列通用属性' }), {
            label: '通用属性',
            itemLabel: props => props.value || '属性',
          }),
          modelAttributes: fields.array(fields.text({ label: '型号专属属性' }), {
            label: '型号专属属性',
            itemLabel: props => props.value || '属性',
          }),
        }),
        visual: fields.object({
          archetype: fields.text({ label: '视觉方向', defaultValue: 'precise editorial' }),
          accentColor: fields.text({ label: '强调色（#RRGGBB）', defaultValue: '#0f766e' }),
          accentColorStrong: fields.text({ label: '深强调色（#RRGGBB）', defaultValue: '#075985' }),
          accentColorSoft: fields.text({ label: '浅强调色（#RRGGBB）', defaultValue: '#ccfbf1' }),
          heroDirection: fields.text({ label: '首屏主图方向', multiline: true, defaultValue: '' }),
          imageRules: fields.text({ label: '图片选择规则', multiline: true, defaultValue: '' }),
        }),
        governance: fields.object({
          factsVerified: fields.checkbox({ label: '只使用已核实事实', defaultValue: false }),
          contentOwner: fields.text({ label: '内容负责人', defaultValue: '' }),
          lastUpdated: fields.text({ label: '最近更新日期（YYYY-MM-DD）', defaultValue: '' }),
          notes: fields.text({ label: '内部上线备注', multiline: true, defaultValue: '' }),
        }),
      },
    }),
    productTranslationReview: singleton({
      label: '产品翻译草稿',
      path: 'src/keystatic/product-translation-review.json',
      format: 'json',
      schema: {
        review: translationDraftReviewField({ label: '产品翻译草稿', type: 'product' }),
      },
    }),
    blogTranslationReview: singleton({
      label: '文章翻译草稿',
      path: 'src/keystatic/blog-translation-review.json',
      format: 'json',
      schema: {
        review: translationDraftReviewField({ label: '文章翻译草稿', type: 'blog' }),
      },
    }),
    sitePublisher: singleton({
      label: '发布网站更新',
      path: 'src/keystatic/site-publisher.json',
      format: 'json',
      schema: {
        publisher: sitePublisherField({ label: '发布网站更新' }),
      },
    }),
    aiTranslator: singleton({
      label: 'AI 翻译助手',
      path: 'src/keystatic/ai-translator.json',
      format: 'json',
      schema: {
        translator: aiTranslatorField({ label: 'AI 翻译助手' }),
      },
    }),
    productManager: singleton({
      label: '产品管理',
      path: 'src/keystatic/product-manager.json',
      format: 'json',
      schema: {
        manager: productManagerField({ label: '产品管理' }),
      },
    }),
    productOrder: singleton({
      label: '产品排序',
      path: 'src/keystatic/product-order.json',
      format: 'json',
      schema: {
        order: productOrderField({ label: '产品排序' }),
      },
    }),
    imagePool: singleton({
      label: '图片池',
      path: 'src/keystatic/image-pool.json',
      format: 'json',
      schema: {
        browser: r2ImagePoolField({ label: '图片池' }),
      },
    }),
  },
  collections: {
    products: collection({
      label: '产品与服务内容',
      slugField: 'title',
      path: 'src/content/products/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: '标题' } }),
        description: fields.text({ label: '简短描述', multiline: true }),
        offeringType: fields.select({
          label: '结构化数据中的内容类型',
          options: [
            { label: '实物产品', value: 'physical-product' },
            { label: '服务', value: 'service' },
            { label: '工程解决方案', value: 'solution' },
          ],
          defaultValue: 'physical-product',
        }),
        modelStrategy: fields.select({
          label: '型号与参数结构',
          options: [
            { label: '单一可销售型号', value: 'single-model' },
            { label: '包含多个型号行的系列', value: 'series' },
            { label: '按订单配置', value: 'configurable' },
            { label: '不适用于此服务', value: 'not-applicable' },
          ],
          defaultValue: 'series',
        }),
        category: fields.text({ label: '公开分类', defaultValue: 'Solutions' }),
        series: fields.text({ label: '系列 / 型号 / 服务组' }),
        sortOrder: fields.integer({ label: '显示顺序', defaultValue: 9999 }),
        published: fields.checkbox({ label: '前端上线', defaultValue: true }),
        image: r2ImageUrlField({
          label: '主图 URL',
          pickerTitle: '选择主图',
          description: '该图片用于列表缩略图和详情页主图。',
        }),
        galleryImages: fields.array(r2ImageUrlField({ label: '图库图片 URL', pickerTitle: '选择图库图片' }), {
          label: '图库图片',
          itemLabel: props => props.value || '图片',
        }),
        detailImages: fields.array(
          fields.object({
            image: r2ImageUrlField({ label: '图片 URL', pickerTitle: '选择详情图片' }),
            title: fields.text({ label: '图片标题', defaultValue: '' }),
            caption: fields.text({ label: '图片说明', multiline: true, defaultValue: '' }),
          }),
          { label: '详情图片', itemLabel: props => props.fields.title.value || props.fields.image.value || '详情图片' }
        ),
        applications: fields.array(fields.text({ label: '应用场景' }), {
          label: '应用场景',
          itemLabel: props => props.value || '应用场景',
        }),
        specs: fields.array(
          fields.object({
            label: fields.text({ label: '参数名' }),
            value: fields.text({ label: '参数值' }),
          }),
          { label: '基础参数', itemLabel: props => props.fields.label.value || '参数' }
        ),
        specTables: specTablesTranslationField(),
        highlights: fields.array(fields.text({ label: '亮点' }), {
          label: '产品或服务亮点',
          itemLabel: props => props.value || '亮点',
        }),
        faqs: fields.array(
          fields.object({
            question: fields.text({ label: '问题' }),
            answer: fields.text({ label: '答案', multiline: true }),
          }),
          { label: '常见问题', itemLabel: props => props.fields.question.value || 'FAQ' }
        ),
        aggregateRatingValue: fields.text({
          label: '真实客户聚合评分（仅站长维护）',
          description: '可选。只能填写真实公开的 1.0 至 5.0 评分数据。',
          defaultValue: '',
        }),
        aggregateRatingCount: fields.integer({
          label: '真实评分数量（仅站长维护）',
          description: '可选。填写评分值时，这里必须是实际评分数量。',
          defaultValue: 0,
        }),
        featured: fields.checkbox({ label: '首页推荐', defaultValue: false }),
        content: fields.markdoc({ label: '正文内容', components: r2MarkdocComponents }),
      },
    }),
    blog: collection({
      label: '文章内容',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: '文章标题' } }),
        description: fields.text({ label: 'SEO 描述', multiline: true }),
        publishDate: fields.date({ label: '发布日期' }),
        category: fields.text({ label: '文章分类' }),
        image: r2ImageUrlField({
          label: '封面图 URL',
          pickerTitle: '选择文章封面图',
          description: '可粘贴图片 URL，也可从图片池选择。',
        }),
        author: fields.text({ label: '作者', defaultValue: 'BusinessWeb Editorial Team' }),
        featured: fields.checkbox({ label: '首页推荐', defaultValue: false }),
        content: fields.markdoc({ label: '正文内容', components: r2MarkdocComponents }),
      },
    }),
    productTranslations: collection({
      label: '产品翻译草稿内容',
      slugField: 'title',
      path: 'src/content/productTranslations/*',
      format: { contentField: 'content' },
      previewUrl: '/api/ai/draft-preview?type=product&draft={slug}',
      schema: {
        title: fields.slug({ name: { label: '翻译标题' } }),
        sourceSlug: fields.text({ label: '英文产品 slug' }),
        sourceTitle: fields.text({ label: '英文产品标题' }),
        locale: fields.select({
          label: '语言',
          options: [...translationLocaleOptions],
          defaultValue: 'zh',
        }),
        published: fields.checkbox({ label: '审核后发布', defaultValue: false }),
        generatedAt: fields.text({ label: '生成时间' }),
        description: fields.text({ label: 'SEO 描述', multiline: true }),
        offeringType: fields.select({
          label: '内容类型',
          options: [
            { label: '实物产品', value: 'physical-product' },
            { label: '服务', value: 'service' },
            { label: '工程解决方案', value: 'solution' },
          ],
          defaultValue: 'physical-product',
        }),
        modelStrategy: fields.select({
          label: '型号与参数结构',
          options: [
            { label: '单一可销售型号', value: 'single-model' },
            { label: '包含多个型号行的系列', value: 'series' },
            { label: '按订单配置', value: 'configurable' },
            { label: '不适用于此服务', value: 'not-applicable' },
          ],
          defaultValue: 'series',
        }),
        categoryName: fields.text({ label: '分类名称' }),
        series: fields.text({ label: '系列 / 型号 / 服务组' }),
        applications: fields.array(fields.text({ label: '应用场景' }), {
          label: '应用场景',
          itemLabel: props => props.value || '应用场景',
        }),
        specs: fields.array(
          fields.object({
            label: fields.text({ label: '参数名' }),
            value: fields.text({ label: '参数值' }),
          }),
          { label: '基础参数', itemLabel: props => props.fields.label.value || '参数' }
        ),
        specTables: specTablesTranslationField(),
        highlights: fields.array(fields.text({ label: '亮点' }), {
          label: '产品或服务亮点',
          itemLabel: props => props.value || '亮点',
        }),
        faqs: fields.array(
          fields.object({
            question: fields.text({ label: '问题' }),
            answer: fields.text({ label: '答案', multiline: true }),
          }),
          { label: '常见问题', itemLabel: props => props.fields.question.value || 'FAQ' }
        ),
        content: fields.markdoc({ label: '翻译正文', components: r2MarkdocComponents }),
      },
    }),
    blogTranslations: collection({
      label: '文章翻译草稿内容',
      slugField: 'title',
      path: 'src/content/blogTranslations/*',
      format: { contentField: 'content' },
      previewUrl: '/api/ai/draft-preview?type=blog&draft={slug}',
      schema: {
        title: fields.slug({ name: { label: '翻译标题' } }),
        sourceSlug: fields.text({ label: '英文文章 slug' }),
        sourceTitle: fields.text({ label: '英文文章标题' }),
        locale: fields.select({
          label: '语言',
          options: [...translationLocaleOptions],
          defaultValue: 'zh',
        }),
        published: fields.checkbox({ label: '审核后发布', defaultValue: false }),
        generatedAt: fields.text({ label: '生成时间' }),
        description: fields.text({ label: 'SEO 描述', multiline: true }),
        category: fields.text({ label: '文章分类' }),
        content: fields.markdoc({ label: '翻译正文', components: r2MarkdocComponents }),
      },
    }),
  },
});
