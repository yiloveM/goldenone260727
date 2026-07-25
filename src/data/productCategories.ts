import type { CollectionEntry } from 'astro:content';
import { siteImages } from './backgroundImages';
import { industryProfile } from './industry-profile';

type ProductEntry = CollectionEntry<'products'>;

export type ProductCategoryMeta = {
  name: string;
  displayName?: string;
  slug: string;
  description: string;
  image: string;
  imageAlt: string;
  accent: string;
  highlights: string[];
};

export type ProductCategory = ProductCategoryMeta & {
  href: string;
  products: ProductEntry[];
  count: number;
};

export const slugifyCategory = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const categoryImages = [
  siteImages.productCategories.industrialProducts,
  siteImages.productCategories.customSolutions,
  siteImages.productCategories.spareParts,
  siteImages.productCategories.servicePrograms,
];

export const productCategoryMeta: readonly ProductCategoryMeta[] = industryProfile.productArchitecture.categoryPlans.map((category, index) => ({
  name: category.name,
  displayName: category.name,
  slug: slugifyCategory(category.name),
  description: category.description,
  image: categoryImages[index % categoryImages.length],
  imageAlt: `${category.name} category`,
  accent: index === 0 ? 'Core offering' : index === 1 ? 'Project capability' : 'Lifecycle support',
  highlights: category.highlights,
}));

export const categoryHref = (categoryName: string) => `/products/category/${slugifyCategory(categoryName)}/`;

export const getCategoryMeta = (categoryName: string): ProductCategoryMeta => {
  const slug = slugifyCategory(categoryName);
  return productCategoryMeta.find(category => category.slug === slug) ?? {
    name: categoryName,
    displayName: categoryName,
    slug,
    description: 'Business offering prepared for selection, comparison, and quotation workflows.',
    image: siteImages.productCategories.fallback,
    imageAlt: `${categoryName} category`,
    accent: 'Business offer',
    highlights: ['Selection ready', 'Specification support', 'Commercial workflow'],
  };
};

const getProductSortOrder = (product: ProductEntry) =>
  Number.isFinite(product.data.sortOrder) ? product.data.sortOrder : Number.MAX_SAFE_INTEGER;

export const isProductPublished = (product: ProductEntry) => product.data.published !== false;

export const sortProductsByPriority = (products: ProductEntry[]) =>
  [...products].sort((a, b) => {
    const orderDifference = getProductSortOrder(a) - getProductSortOrder(b);
    if (orderDifference !== 0) return orderDifference;
    return a.data.title.localeCompare(b.data.title);
  });

export const sortProductsByTitle = sortProductsByPriority;

export const buildProductCategories = (products: ProductEntry[]): ProductCategory[] => {
  const grouped = products.filter(isProductPublished).reduce<Record<string, ProductEntry[]>>((groups, product) => {
    groups[product.data.category] = [...(groups[product.data.category] || []), product];
    return groups;
  }, {});

  const knownCategories = productCategoryMeta
    .map(meta => ({
      ...meta,
      href: categoryHref(meta.name),
      products: sortProductsByPriority(grouped[meta.name] || []),
      count: grouped[meta.name]?.length || 0,
    }))
    .filter(category => category.count > 0);

  const unknownCategories = Object.keys(grouped)
    .filter(name => !productCategoryMeta.some(meta => meta.name === name))
    .sort()
    .map(name => {
      const meta = getCategoryMeta(name);
      return {
        ...meta,
        href: categoryHref(name),
        products: sortProductsByPriority(grouped[name] || []),
        count: grouped[name]?.length || 0,
      };
    });

  return [...knownCategories, ...unknownCategories];
};
