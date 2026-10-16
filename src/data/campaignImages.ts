import { slugifyCategory } from './productCategories';

export const campaignRoot = '/r2/Banner/2026-product-design';

export const categoryProcessImages = (category: string) =>
  category === 'Fridge Magnets' ? [] : ['artwork', 'specification', 'approval'].map(stage =>
    `/r2/products/design-process/${slugifyCategory(category)}/${stage}.webp`
  );
