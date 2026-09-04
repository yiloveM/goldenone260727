export const articleBodyLocales = ['zh', 'ar', 'hi', 'es', 'pt', 'fr', 'ru', 'ko', 'fil', 'tr', 'de', 'uz', 'bn', 'ur', 'ja', 'ms', 'nl', 'el', 'th'] as const;
export type ArticleBodyLocale = (typeof articleBodyLocales)[number];
export type ArticleBodyTranslationMap = Record<string, string>;

const loaders: Record<ArticleBodyLocale, () => Promise<ArticleBodyTranslationMap>> = {
  zh: () => import('./zh').then(module => module.zhArticleBodyTranslations as ArticleBodyTranslationMap),
  ar: () => import('./ar').then(module => module.arArticleBodyTranslations as ArticleBodyTranslationMap),
  hi: () => import('./hi').then(module => module.hiArticleBodyTranslations as ArticleBodyTranslationMap),
  es: () => import('./es').then(module => module.esArticleBodyTranslations as ArticleBodyTranslationMap),
  pt: () => import('./pt').then(module => module.ptArticleBodyTranslations as ArticleBodyTranslationMap),
  fr: () => import('./fr').then(module => module.frArticleBodyTranslations as ArticleBodyTranslationMap),
  ru: () => import('./ru').then(module => module.ruArticleBodyTranslations as ArticleBodyTranslationMap),
  ko: () => import('./ko').then(module => module.koArticleBodyTranslations as ArticleBodyTranslationMap),
  fil: () => import('./fil').then(module => module.filArticleBodyTranslations as ArticleBodyTranslationMap),
  tr: () => import('./tr').then(module => module.trArticleBodyTranslations as ArticleBodyTranslationMap),
  de: () => import('./de').then(module => module.deArticleBodyTranslations as ArticleBodyTranslationMap),
  uz: () => import('./uz').then(module => module.uzArticleBodyTranslations as ArticleBodyTranslationMap),
  bn: () => import('./bn').then(module => module.bnArticleBodyTranslations as ArticleBodyTranslationMap),
  ur: () => import('./ur').then(module => module.urArticleBodyTranslations as ArticleBodyTranslationMap),
  ja: () => import('./ja').then(module => module.jaArticleBodyTranslations as ArticleBodyTranslationMap),
  ms: () => import('./ms').then(module => module.msArticleBodyTranslations as ArticleBodyTranslationMap),
  nl: () => import('./nl').then(module => module.nlArticleBodyTranslations as ArticleBodyTranslationMap),
  el: () => import('./el').then(module => module.elArticleBodyTranslations as ArticleBodyTranslationMap),
  th: () => import('./th').then(module => module.thArticleBodyTranslations as ArticleBodyTranslationMap),
};

const cache = new Map<ArticleBodyLocale, Promise<ArticleBodyTranslationMap>>();

export const getStaticArticleBody = async (locale: ArticleBodyLocale, slug: string) => {
  const loader = loaders[locale];
  if (!loader) return '';
  if (!cache.has(locale)) cache.set(locale, loader());
  const translations = await cache.get(locale);
  return translations?.[slug] || '';
};
