import type { CollectionEntry } from 'astro:content';
import { brandAssets } from './assets';
import { getProductCardKeywords } from './productCardKeywords';
import { getCategoryMeta } from './productCategories';
import { publicProductSpecs } from './productSpecs';
import { industryProfile } from './industry-profile';
import { siteInfo } from './site';

type ProductEntry = CollectionEntry<'products'>;
type BlogEntry = CollectionEntry<'blog'>;

export type JsonLd = Record<string, unknown>;

export const productEntitiesEnabled = true;

const fallbackSiteUrl = 'https://businessweb.workers.dev';
const languageByLocalePrefix: Record<string, string> = {
  zh: 'zh-CN',
  ar: 'ar',
  hi: 'hi',
  es: 'es',
  fr: 'fr',
  bn: 'bn',
  pt: 'pt-BR',
  ru: 'ru',
  ur: 'ur',
  de: 'de',
  tr: 'tr',
  fil: 'fil',
  ko: 'ko',
  uz: 'uz',
};

const cleanText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

export const siteUrl = (site?: URL | string | null) => {
  const value = typeof site === 'string' ? site : site?.toString();
  return (value || fallbackSiteUrl).replace(/\/+$/, '');
};

export const absoluteUrl = (pathOrUrl: string, site?: URL | string | null) => {
  if (!pathOrUrl) return '';
  return new URL(pathOrUrl, `${siteUrl(site)}/`).toString();
};

export const uniqueList = <T>(items: T[]) => [...new Set(items.filter(Boolean))];

export const languageFromUrl = (urlOrPath: string) => {
  try {
    const url = new URL(urlOrPath, fallbackSiteUrl);
    const firstSegment = url.pathname.split('/').filter(Boolean)[0] || '';
    return languageByLocalePrefix[firstSegment] || 'en';
  } catch {
    return 'en';
  }
};

export const compactDescription = (value: string, maxLength = 158) => {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 90 ? lastSpace : clipped.length).replace(/[,.:\s]+$/, '')}.`;
};

export const productKeywords = (product: ProductEntry) =>
  uniqueList([
    product.data.category,
    product.data.series,
    ...getProductCardKeywords(product),
    ...product.data.highlights,
    ...product.data.applications,
  ].map(item => cleanText(String(item || '')).toLowerCase()).filter(Boolean));

export const categoryKeywords = (categoryName: string) =>
  uniqueList([categoryName, getCategoryMeta(categoryName).displayName || '', ...getCategoryMeta(categoryName).highlights]);

export const productSeoPhrase = (product: ProductEntry) =>
  cleanText(product.data.category || 'business offering').toLowerCase();

export const productSeoKeywordVariants = (product: ProductEntry) => productKeywords(product);

export const productSeoDescription = (product: ProductEntry) =>
  compactDescription(
    `${product.data.title} is a ${productSeoPhrase(product)} in the ${product.data.series} range. ${product.data.description}`
  );

export const categorySeoDescription = (categoryName: string, description: string) =>
  compactDescription(`${getCategoryMeta(categoryName).displayName || categoryName}: ${description}`);

export const organizationId = (site?: URL | string | null) => `${siteUrl(site)}/#organization`;
export const websiteId = (site?: URL | string | null) => `${siteUrl(site)}/#website`;

export const organizationStructuredData = (site?: URL | string | null): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': organizationId(site),
  name: siteInfo.name,
  url: `${siteUrl(site)}/`,
  email: siteInfo.email,
  telephone: siteInfo.phone,
  address: siteInfo.address,
  logo: absoluteUrl(brandAssets.logo, site),
  sameAs: uniqueList([siteInfo.x, siteInfo.pinterest]),
});

export const websiteStructuredData = (site?: URL | string | null): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': websiteId(site),
  name: siteInfo.name,
  url: `${siteUrl(site)}/`,
  description: siteInfo.description,
  publisher: { '@id': organizationId(site) },
  inLanguage: 'en',
});

export const webPageStructuredData = (
  options: {
    name: string;
    description: string;
    url: string;
    image?: string;
    language?: string;
    mainEntityId?: string;
  },
  site?: URL | string | null
): JsonLd => {
  const url = absoluteUrl(options.url, site);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: cleanText(options.name),
    description: cleanText(options.description),
    inLanguage: options.language || languageFromUrl(url),
    isPartOf: { '@id': websiteId(site) },
    publisher: { '@id': organizationId(site) },
    ...(options.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: absoluteUrl(options.image, site) } } : {}),
    ...(options.mainEntityId ? { mainEntity: { '@id': options.mainEntityId } } : {}),
  };
};

export const breadcrumbStructuredData = (
  items: { name: string; url: string }[],
  site?: URL | string | null
): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: absoluteUrl(item.url, site),
  })),
});

type ProductProperty = {
  name: string;
  value: string;
  propertyID?: string;
  unitText?: string;
};

const propertyValues = (items: ProductProperty[]) => {
  const grouped = new Map<string, { name: string; values: string[]; propertyID?: string; unitText?: string }>();
  items.forEach(item => {
    const name = cleanText(item.name);
    const value = cleanText(item.value);
    if (!name || !value) return;
    const propertyID = cleanText(item.propertyID || '');
    const unitText = cleanText(item.unitText || '');
    const key = propertyID.toLowerCase() || name.toLowerCase();
    const group = grouped.get(key) || {
      name,
      values: [],
      ...(propertyID ? { propertyID } : {}),
      ...(unitText ? { unitText } : {}),
    };
    if (!group.values.some(existing => existing.toLowerCase() === value.toLowerCase())) group.values.push(value);
    grouped.set(key, group);
  });
  return Array.from(grouped.values()).map(item => ({
    '@type': 'PropertyValue',
    name: item.name,
    value: item.values.join(' / '),
    ...(item.propertyID ? { propertyID: item.propertyID } : {}),
    ...(item.unitText ? { unitText: item.unitText } : {}),
  }));
};

const modelSlug = (model: string) => cleanText(model).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const productGroupId = (series: string) =>
  cleanText(series)
    .replace(/&/g, 'and')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || modelSlug(series);

const specificationPropertyId = (value: string) => {
  const key = cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key ? `businessweb:spec:${key}` : '';
};

const unitFromColumn = (column: string) => {
  const units = Array.from(column.matchAll(/\(([^)]+)\)/g)).map(match => cleanText(match[1]));
  return units.find(value => /^(mm|cm|m|kg|g|lb|oz|w|kw|hp|v|hz|rpm|psi|bar|kpa|l|ml|m3\/h|gpm|%)$/i.test(value));
};

const valueWithColumnUnit = (column: string, value: string) => {
  const text = cleanText(value);
  if (!text) return '';
  const unit = unitFromColumn(column);
  if (!unit || /[a-zA-Z%"']/.test(text)) return text;
  return /^[-+]?\d+(\.\d+)?$/.test(text) ? `${text} ${unit}` : text;
};

const isModelSpecTable = (table: ProductEntry['data']['specTables'][number]) => {
  const firstColumn = table.columns[0]?.toLowerCase() || '';
  return table.rows.length > 0 && (firstColumn.includes('model') || firstColumn.includes('item') || firstColumn.includes('code') || firstColumn.includes('sku'));
};

const variantDimension = (column: string) => {
  const text = cleanText(column.replace(/\([^)]*\)/g, ' ').replace(/\s*\/\s*/g, ' ')).toLowerCase();
  if (!text) return '';
  if (/(color|colour)/.test(text)) return 'https://schema.org/color';
  if (/(material|housing|body)/.test(text)) return 'https://schema.org/material';
  if (/(size|dimension|diameter|height|width|length|capacity|volume)/.test(text)) return 'https://schema.org/size';
  return '';
};

const variantSize = (properties: ProductProperty[]) => {
  const propertyLabel = (item: ProductProperty) => item.propertyID || item.name;
  const dimension = properties.find(item => /(^|\b)(size|dimension|diameter|height|width|length|capacity|volume)\b/i.test(propertyLabel(item)));
  return dimension?.value || '';
};

const variantPropertyValue = (properties: ProductProperty[], dimension: string) =>
  properties.find(property => variantDimension(property.propertyID || property.name) === dimension)?.value || '';

const productGroupVariesBy = (variants: Array<{ properties: ProductProperty[] }>) => {
  const dimensions = ['https://schema.org/color', 'https://schema.org/material', 'https://schema.org/size'];
  return dimensions.filter(dimension => {
    const values = variants.flatMap(({ properties }) => {
      if (dimension === 'https://schema.org/size') {
        const size = variantSize(properties);
        return size ? [size] : [];
      }
      return properties.filter(property => variantDimension(property.propertyID || property.name) === dimension).map(property => property.value);
    });
    return new Set(values.map(value => cleanText(value).toLowerCase()).filter(Boolean)).size > 1;
  });
};

const variantDescription = (product: ProductEntry, model: string, properties: ProductProperty[]) => {
  const details = propertyValues(properties)
    .slice(0, 6)
    .map(property => `${property.name}: ${property.value}`)
    .join('; ');
  return cleanText(
    `${model} is a ${productSeoPhrase(product)} model in the ${product.data.series} range${details ? ` with ${details}` : ''}. ${product.data.description}`
  );
};

const variantTables = (product: ProductEntry) => product.data.specTables.filter(isModelSpecTable);

const variantRows = (product: ProductEntry) => {
  const tables = variantTables(product);
  if (!tables.length) return [];

  const variants = new Map<string, { model: string; tableTitles: Set<string>; properties: ProductProperty[]; seen: Set<string> }>();

  tables.forEach(table => {
    const rowCountByModel = new Map<string, number>();
    table.rows.forEach(row => {
      const model = cleanText(row[0] || '');
      if (model) rowCountByModel.set(model, (rowCountByModel.get(model) || 0) + 1);
    });
    const rowIndexByModel = new Map<string, number>();

    table.rows.forEach(row => {
      const model = cleanText(row[0] || '');
      if (!model) return;

      const existing = variants.get(model) || { model, tableTitles: new Set<string>(), properties: [], seen: new Set<string>() };
      existing.tableTitles.add(table.title);

      const rowProperties: ProductProperty[] = [];
      table.columns.slice(1).forEach((column, index) => {
        const name = cleanText(column);
        const value = valueWithColumnUnit(column, row[index + 1] || '');
        const propertyID = specificationPropertyId(column);
        const unitText = unitFromColumn(column);
        const key = `${propertyID || name.toLowerCase()}|${value.toLowerCase()}`;
        if (!name || !value || existing.seen.has(key)) return;
        existing.seen.add(key);
        const property = {
          name,
          value,
          ...(propertyID ? { propertyID } : {}),
          ...(unitText ? { unitText } : {}),
        };
        existing.properties.push(property);
        rowProperties.push(property);
      });

      if ((rowCountByModel.get(model) || 0) > 1 && rowProperties.length > 0) {
        const rowIndex = (rowIndexByModel.get(model) || 0) + 1;
        rowIndexByModel.set(model, rowIndex);
        const tableKey = specificationPropertyId(table.title).replace(/^businessweb:spec:/, '') || 'specifications';
        const name = `${cleanText(table.title || 'Specifications')} - configuration ${rowIndex}`;
        const value = rowProperties.map(property => `${property.name}: ${property.value}`).join('; ');
        const propertyID = `businessweb:table:${tableKey}:configuration-${rowIndex}`;
        const key = `${propertyID}|${value.toLowerCase()}`;
        if (!existing.seen.has(key)) {
          existing.seen.add(key);
          existing.properties.push({ name, value, propertyID });
        }
      }

      variants.set(model, existing);
    });
  });

  return Array.from(variants.values());
};

const partitionVariantProperties = (variants: Array<{ model: string; properties: ProductProperty[] }>) => {
  if (variants.length < 2) {
    return { sharedProperties: [] as ProductProperty[], specificPropertiesByModel: new Map<string, ProductProperty[]>() };
  }

  const propertyKey = (property: ProductProperty) => cleanText(property.propertyID || property.name).toLowerCase();
  const keysByVariant = variants.map(variant => new Set(variant.properties.map(propertyKey)));
  const candidateKeys = [...keysByVariant[0]].filter(key => keysByVariant.every(keys => keys.has(key)));
  const sharedKeys = new Set(candidateKeys.filter(key => {
    const signatures = variants.map(variant =>
      [...new Set(variant.properties.filter(property => propertyKey(property) === key).map(property => cleanText(property.value).toLowerCase()))]
        .sort()
        .join('|')
    );
    return signatures.every(signature => signature === signatures[0]);
  }));

  const sharedProperties = variants[0].properties.filter(property => sharedKeys.has(propertyKey(property)));
  const specificPropertiesByModel = new Map(
    variants.map(variant => [variant.model, variant.properties.filter(property => !sharedKeys.has(propertyKey(property)))])
  );
  return { sharedProperties, specificPropertiesByModel };
};

export const productStructuredData = (product: ProductEntry, slug: string, site?: URL | string | null): JsonLd[] => {
  const url = absoluteUrl(`/products/${slug}/`, site);
  const image = product.data.image ? absoluteUrl(product.data.image, site) : absoluteUrl(brandAssets.heroCenter, site);
  const categoryMeta = getCategoryMeta(product.data.category);
  const description = productSeoDescription(product);
  const serviceLike = product.data.offeringType === 'service' || product.data.offeringType === 'solution';
  const baseBreadcrumb = breadcrumbStructuredData(
    [
      { name: 'Home', url: '/' },
      { name: 'Products', url: '/products/' },
      { name: categoryMeta.displayName || categoryMeta.name, url: `/products/category/${categoryMeta.slug}/` },
      { name: product.data.title, url: `/products/${slug}/` },
    ],
    site
  );
  if (serviceLike) {
    const serviceEntity: JsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      '@id': `${url}#service`,
      name: product.data.title,
      description,
      url,
      image: [image],
      inLanguage: 'en',
      serviceType: product.data.series || product.data.category,
      category: product.data.category,
      provider: { '@id': organizationId(site) },
      mainEntityOfPage: { '@id': `${url}#webpage` },
      ...(industryProfile.market.markets.length ? { areaServed: industryProfile.market.markets } : {}),
      additionalProperty: propertyValues([
        ...publicProductSpecs(product.data.specs).map(spec => ({ name: spec.label, value: spec.value })),
        ...product.data.applications.map((application, index) => ({ name: `Application ${index + 1}`, value: application })),
      ]),
    };
    const data: JsonLd[] = productEntitiesEnabled ? [serviceEntity, baseBreadcrumb] : [baseBreadcrumb];
    if (product.data.faqs.length) {
      data.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: product.data.faqs.map(item => ({
          '@type': 'Question',
          name: cleanText(item.question),
          acceptedAnswer: { '@type': 'Answer', text: cleanText(item.answer) },
        })),
      });
    }
    return data;
  }
  const variants = variantRows(product);
  const { sharedProperties, specificPropertiesByModel } = partitionVariantProperties(variants);
  const groupId = productGroupId(product.data.series);
  const seriesProperties: ProductProperty[] = [
    ...publicProductSpecs(product.data.specs).map(spec => ({
      name: spec.label,
      value: spec.value,
      propertyID: specificationPropertyId(`series-${spec.label}`),
    })),
    ...product.data.highlights.map((feature, index) => ({
      name: `Series feature ${index + 1}`,
      value: feature,
      propertyID: `businessweb:series:feature-${index + 1}`,
    })),
    ...product.data.applications.slice(0, 8).map((application, index) => ({
      name: `Application ${index + 1}`,
      value: application,
      propertyID: `businessweb:series:application-${index + 1}`,
    })),
  ];

  const baseProduct: JsonLd = {
    '@context': 'https://schema.org',
    '@type': variants.length > 1 ? 'ProductGroup' : 'Product',
    '@id': `${url}#product`,
    name: product.data.title,
    description,
    url,
    image: [image],
    inLanguage: 'en',
    mainEntityOfPage: { '@id': `${url}#webpage` },
    brand: { '@type': 'Brand', name: siteInfo.name },
    manufacturer: { '@id': organizationId(site) },
    category: product.data.category,
    productID: product.data.series,
    keywords: productSeoKeywordVariants(product).join(', '),
    additionalProperty: propertyValues([...seriesProperties, ...(variants.length > 1 ? sharedProperties : [])]),
  };

  if (product.data.aggregateRatingValue && product.data.aggregateRatingCount > 0) {
    baseProduct.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.data.aggregateRatingValue,
      ratingCount: product.data.aggregateRatingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (variants.length === 1) {
    const [{ model, properties, tableTitles }] = variants;
    const size = variantSize(properties);
    const color = variantPropertyValue(properties, 'https://schema.org/color');
    baseProduct.model = model;
    baseProduct.sku = model;
    baseProduct.mpn = model;
    baseProduct.productID = model;
    baseProduct.description = variantDescription(product, model, properties);
    if (size) baseProduct.size = size;
    if (color) baseProduct.color = color;
    baseProduct.additionalProperty = propertyValues([
      ...seriesProperties,
      ...properties,
      ...Array.from(tableTitles).map(title => ({
        name: 'Specification table',
        value: title,
        propertyID: specificationPropertyId(`table-${title}`),
      })),
    ]);
  }

  if (variants.length > 1) {
    baseProduct.productGroupID = groupId;
    const variesBy = productGroupVariesBy(variants);
    if (variesBy.length) baseProduct.variesBy = variesBy;
    baseProduct.hasVariant = variants.map(({ model, properties, tableTitles }) => {
      const variantUrl = `${url}?model=${encodeURIComponent(model)}`;
      const variantId = `${url}#${modelSlug(model)}`;
      const size = variantSize(properties);
      const color = variantPropertyValue(properties, 'https://schema.org/color');
      const variantMaterial = variantPropertyValue(properties, 'https://schema.org/material');
      return {
        '@type': 'Product',
        '@id': variantId,
        name: `${product.data.title} - ${model}`,
        model,
        sku: model,
        mpn: model,
        productID: model,
        url: variantUrl,
        description: variantDescription(product, model, properties),
        image: [image],
        inLanguage: 'en',
        brand: { '@type': 'Brand', name: siteInfo.name },
        manufacturer: { '@id': organizationId(site) },
        category: product.data.category,
        inProductGroupWithID: groupId,
        isVariantOf: { '@id': `${url}#product` },
        ...(size ? { size } : {}),
        ...(color ? { color } : {}),
        ...(variantMaterial ? { material: variantMaterial } : {}),
        additionalProperty: propertyValues([
          ...(specificPropertiesByModel.get(model) || properties),
          ...Array.from(tableTitles).map(title => ({
            name: 'Specification table',
            value: title,
            propertyID: specificationPropertyId(`table-${title}`),
          })),
        ]),
      };
    });
  }

  const data: JsonLd[] = [baseBreadcrumb];
  if (productEntitiesEnabled) data.unshift(baseProduct);

  if (product.data.faqs.length > 0) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: product.data.faqs.map(item => ({
        '@type': 'Question',
        name: cleanText(item.question),
        acceptedAnswer: { '@type': 'Answer', text: cleanText(item.answer) },
      })),
    });
  }

  return data;
};

export const collectionStructuredData = (
  options: {
    name: string;
    description: string;
    url: string;
    image?: string;
    keywords?: string[];
    items: { name: string; url: string; image?: string }[];
  },
  site?: URL | string | null
): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${absoluteUrl(options.url, site)}#webpage`,
  name: options.name,
  description: cleanText(options.description),
  url: absoluteUrl(options.url, site),
  ...(options.image ? { image: absoluteUrl(options.image, site) } : {}),
  keywords: uniqueList(options.keywords || []).join(', '),
  isPartOf: {
    '@type': 'WebSite',
    '@id': websiteId(site),
    name: siteInfo.name,
    url: `${siteUrl(site)}/`,
  },
  publisher: {
    '@type': 'Organization',
    '@id': organizationId(site),
    name: siteInfo.name,
    url: `${siteUrl(site)}/`,
  },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: options.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.url, site),
      ...(item.image ? { image: absoluteUrl(item.image, site) } : {}),
    })),
  },
});

export const articleStructuredData = (post: BlogEntry, slug: string, site?: URL | string | null): JsonLd => {
  const url = absoluteUrl(`/blog/${slug}/`, site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: post.data.title,
    description: cleanText(post.data.description),
    inLanguage: 'en',
    ...(post.data.image ? { image: [absoluteUrl(post.data.image, site)] } : {}),
    datePublished: post.data.publishDate.toISOString(),
    dateModified: post.data.publishDate.toISOString(),
    author: { '@id': organizationId(site) },
    publisher: { '@id': organizationId(site) },
    mainEntityOfPage: { '@id': `${url}#webpage` },
  };
};
