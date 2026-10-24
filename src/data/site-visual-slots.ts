import profile from './industry-profile.json';
import settings from './site-language-settings.json';
import localeCopy from './site-locales.json';
import origin from './site-origin.json';

const slug = (value: string) => value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const visualSlots = [
  { key: 'home.primary', group: 'home', title: '首页首屏', path: '/', imagePath: 'homeHero.rippleDesktop', supported: true },
  { key: 'home.quality', group: 'home', title: '质量与细节', path: '/', imagePath: 'homeContext.qualityHero', supported: true },
  { key: 'home.cooperation', group: 'home', title: '项目合作', path: '/', imagePath: 'homeContext.cooperationHero', supported: true },
  { key: 'home.center', group: 'home', title: '首页独立居中图', path: '/', imagePath: '', supported: false },
  ...[['productsCatalog', '产品目录', '/products/'], ['about', '关于我们', '/about/'], ['contact', '联系我们', '/contact/'], ['faq', '常见问题', '/faq/'], ['articles', '所有文章', '/blog/']].map(([key, title, path]) => ({ key: `pages.${key}`, group: 'pages', title, path, imagePath: `pageBanners.${key === 'articles' ? 'engineeringNotes' : key}`, supported: true })),
  ...profile.productArchitecture.categoryPlans.map(category => ({ key: `category.${slug(category.name)}`, group: 'categories', title: category.name, path: `/products/category/${slug(category.name)}/`, imagePath: '', supported: true })),
];
// Same published-static-language conditions as i18n.ts, without importing its
// renderer graph back into backgroundImages.ts (which would create a cycle).
const entries = localeCopy.locales as Record<string, any>;
export const visualLocales = ['en', ...Object.entries(settings.enabledLocales).filter(([code, enabled]) => {
  const entry = entries[code]; return enabled && entry?.approved === true && localeCopy.requiredPhraseKeys.every(key => entry.phrases?.[key]?.trim()) && entry.faqs?.length === localeCopy.requiredFaqCount && entry.faqs.every((item: any) => item.question?.trim() && item.answer?.trim());
}).map(([code]) => code)];
export const visualPaths = [...new Set(visualSlots.filter(slot => slot.supported).map(slot => slot.path))];
export const knownVisualLocales = ['en', ...Object.keys(settings.enabledLocales)];
export const visualPolicy = { slots: visualSlots, locales: visualLocales, knownLocales: knownVisualLocales, paths: visualPaths, fragments: ['#free-design'], origin: origin.productionUrl, cdn: String(import.meta.env.PUBLIC_R2_ASSET_BASE_URL || '') };
