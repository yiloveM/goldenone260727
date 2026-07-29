import type { CollectionEntry } from 'astro:content';

export const INQUIRY_CART_STORAGE_KEY = 'businessweb-inquiry-cart-v1';
export const INQUIRY_CART_MAX_ITEMS = 30;
export const INQUIRY_CART_MAX_QUANTITY = 999999;

export interface InquiryCartItem {
  productSlug: string;
  productTitle: string;
  series: string;
  model: string;
  quantity: number;
  productPath: string;
}

export const isModelSpecTable = (table: { columns?: readonly string[] }) =>
  /(^|\b)(model|item|code|sku|product\s*code)(\b|$)/i.test(String(table.columns?.[0] || ''));

export const getProductModelCodes = (product: Pick<CollectionEntry<'products'>, 'data'>) => {
  const seen = new Set<string>();
  const models: string[] = [];

  product.data.specTables.forEach(table => {
    if (!isModelSpecTable(table)) return;
    table.rows.forEach(row => {
      const model = String(row[0] || '').trim();
      const key = model.toLocaleLowerCase('en');
      if (!model || seen.has(key)) return;
      seen.add(key);
      models.push(model);
    });
  });

  return models;
};
