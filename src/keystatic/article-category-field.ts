import { fields } from '@keystatic/core';
import { articleCategoryOptions, canonicalArticleCategory } from '../lib/article-categories.mjs';
export const articleCategoryField = (defaultValue = 'other-articles') => {
  const field = fields.select({ label: '文章分类', options: articleCategoryOptions('zh'), defaultValue });
  // Historical foreign-language labels remain readable without expanding the
  // author's three choices or rewriting closed-language records on read.
  return { ...field, parse: (value: unknown) => field.parse(canonicalArticleCategory(value, defaultValue)),
    reader: { parse: (value: unknown) => field.reader.parse(canonicalArticleCategory(value, defaultValue)) } };
};
