import { getCollection, type CollectionEntry } from 'astro:content';
import {
  arPages,
  arFaqs,
  bnPages,
  bnFaqs,
  dePages,
  deFaqs,
  esPages,
  esFaqs,
  filPages,
  filFaqs,
  frPages,
  frFaqs,
  hiPages,
  hiFaqs,
  koPages,
  koFaqs,
  ptPages,
  ptFaqs,
  ruPages,
  ruFaqs,
  trPages,
  trFaqs,
  urPages,
  urFaqs,
  uzPages,
  uzFaqs,
  zhPages,
  zhFaqs,
  type Locale,
} from '../data/i18n';
import { buildProductCategories, isProductPublished } from '../data/productCategories';
import { translateProductCategory } from '../data/i18n';

export type NonEnglishLocale = Exclude<Locale, 'en'>;

export const localizedPagesByLocale: Record<NonEnglishLocale, any> = {
  zh: zhPages,
  ar: arPages,
  hi: hiPages,
  es: esPages,
  fr: frPages,
  bn: bnPages,
  pt: ptPages,
  ru: ruPages,
  ur: urPages,
  de: dePages,
  tr: trPages,
  fil: filPages,
  ko: koPages,
  uz: uzPages,
};

export const getLocalizedPageCopy = (locale: NonEnglishLocale) => localizedPagesByLocale[locale];

export const localizedFaqsByLocale: Record<NonEnglishLocale, Array<{ question: string; answer: string }>> = {
  zh: zhFaqs,
  ar: arFaqs,
  hi: hiFaqs,
  es: esFaqs,
  fr: frFaqs,
  bn: bnFaqs,
  pt: ptFaqs,
  ru: ruFaqs,
  ur: urFaqs,
  de: deFaqs,
  tr: trFaqs,
  fil: filFaqs,
  ko: koFaqs,
  uz: uzFaqs,
};

export const getLocalizedFaqs = (locale: NonEnglishLocale) => localizedFaqsByLocale[locale];

export const getLocalizedProductStaticPaths = async () => {
  const products = (await getCollection('products')).filter(isProductPublished);
  return products.map(product => ({ params: { slug: product.id.replace(/\.mdoc$/, '') }, props: { product } }));
};

export const getLocalizedProductCategoryStaticPaths = async (locale: NonEnglishLocale) => {
  const products = (await getCollection('products')).filter(isProductPublished);
  return buildProductCategories(products).map(category => ({
    params: { slug: category.slug },
    props: { category: translateProductCategory(category, locale) },
  }));
};

export const getLocalizedBlogStaticPaths = async () => {
  const posts = await getCollection('blog');
  return posts.map(post => ({ params: { slug: post.id.replace(/\.mdoc$/, '') }, props: { post } }));
};

export type ProductEntry = CollectionEntry<'products'>;
export type BlogEntry = CollectionEntry<'blog'>;
