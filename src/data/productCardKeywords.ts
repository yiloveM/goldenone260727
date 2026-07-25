import type { CollectionEntry } from 'astro:content';

type ProductEntry = CollectionEntry<'products'>;

const fallbackByCategory: Record<string, string[]> = {
  'Industrial Products': ['B2B product', 'Specification data', 'Project selection', 'Quotation support'],
  'Custom Solutions': ['OEM ready', 'ODM support', 'Configurable offer', 'Market fit'],
  'Spare Parts & Accessories': ['Accessory range', 'Lifecycle support', 'Replacement parts', 'Service supply'],
  'Service Programs': ['Training support', 'Documentation', 'After-sales', 'Implementation'],
};

const normalizeTags = (tags: string[]) => {
  const seen = new Set<string>();
  return tags
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
};

const inferKeywordTags = (product: ProductEntry) => {
  const text = `${product.data.title} ${product.data.series} ${product.data.category} ${product.data.description}`.toLowerCase();
  const tags: string[] = [];

  if (text.includes('oem')) tags.push('OEM ready');
  if (text.includes('odm')) tags.push('ODM support');
  if (text.includes('custom')) tags.push('Custom configuration');
  if (text.includes('service')) tags.push('Service support');
  if (text.includes('accessory') || text.includes('spare')) tags.push('Accessory range');
  if (text.includes('project')) tags.push('Project selection');
  if (text.includes('commercial') || text.includes('industrial')) tags.push('B2B use');

  return tags;
};

export const getProductCardKeywords = (product: ProductEntry) =>
  normalizeTags([
    ...inferKeywordTags(product),
    ...(fallbackByCategory[product.data.category] ?? ['Business offering', 'Specification support', 'Content ready', 'International site']),
  ]);
