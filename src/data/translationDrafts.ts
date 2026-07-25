import type { CollectionEntry } from 'astro:content';
import type { Locale } from './i18n';

type LocalizedProductData = {
  title: string;
  fullTitle: string;
  description: string;
  categoryName: string;
  series: string;
  applications: string[];
  specs: Array<{ label: string; value: string }>;
  specTables: CollectionEntry<'products'>['data']['specTables'];
  highlights: string[];
  faqs: Array<{ question: string; answer: string }>;
};

type LocalizedBlogData = {
  title: string;
  description: string;
  category: string;
};

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

export const findPublishedProductTranslation = (
  drafts: CollectionEntry<'productTranslations'>[],
  sourceSlug: string,
  locale: Locale
) =>
  drafts.find(
    draft => draft.data.published === true && draft.data.sourceSlug === sourceSlug && draft.data.locale === locale
  );

export const findPublishedBlogTranslation = (
  drafts: CollectionEntry<'blogTranslations'>[],
  sourceSlug: string,
  locale: Locale
) =>
  drafts.find(
    draft => draft.data.published === true && draft.data.sourceSlug === sourceSlug && draft.data.locale === locale
  );

export const productTranslationDraftPath = (draft: CollectionEntry<'productTranslations'> | undefined) =>
  draft ? slugFromId(draft.id) : '';

export const blogTranslationDraftPath = (draft: CollectionEntry<'blogTranslations'> | undefined) =>
  draft ? slugFromId(draft.id) : '';

export const applyProductTranslationDraft = <T extends LocalizedProductData>(
  localized: T,
  draft: CollectionEntry<'productTranslations'> | undefined
): T => {
  if (!draft) return localized;
  const data = draft.data;
  return {
    ...localized,
    title: data.title || localized.title,
    fullTitle: data.title || localized.fullTitle,
    description: data.description || localized.description,
    categoryName: data.categoryName || localized.categoryName,
    series: data.series || localized.series,
    applications: data.applications.length ? data.applications : localized.applications,
    specs: data.specs.length ? data.specs : localized.specs,
    specTables: data.specTables.length ? data.specTables : localized.specTables,
    highlights: data.highlights.length ? data.highlights : localized.highlights,
    faqs: data.faqs.length ? data.faqs : localized.faqs,
  };
};

export const applyBlogTranslationDraft = <T extends LocalizedBlogData>(
  localized: T,
  draft: CollectionEntry<'blogTranslations'> | undefined
): T => {
  if (!draft) return localized;
  const data = draft.data;
  return {
    ...localized,
    title: data.title || localized.title,
    description: data.description || localized.description,
    category: data.category || localized.category,
  };
};
