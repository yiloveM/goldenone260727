import { validateSiteVisuals, resolveVisual } from '../lib/site-visuals.mjs';
import { visualPolicy, visualSlots } from './site-visual-slots';

// Optional file: old sites have no new singleton and must continue to build.
const files = import.meta.glob('./site-visuals.json', { eager: true, import: 'default' });
export const storedSiteVisuals = files['./site-visuals.json'] ?? null;
export const siteVisuals = validateSiteVisuals(storedSiteVisuals, visualPolicy);
export const siteVisual = (key: string, fallback: string, mobileFallback = fallback, locale = 'en') => {
  const slot = visualSlots.find(slot => slot.key === key);
  return slot ? resolveVisual(siteVisuals, slot, fallback, mobileFallback, locale) : { image: fallback, mobileImage: mobileFallback, active: false, alt: '', focusX: 50, focusY: 50 };
};
export function overlaySiteImages<T extends Record<string, any>>(legacy: T): T {
  const images = structuredClone(legacy);
  for (const slot of visualSlots.filter(slot => slot.imagePath)) {
    const [group, key] = slot.imagePath.split('.');
    images[group][key] = siteVisual(slot.key, legacy[group][key]).image;
  }
  const primary = siteVisual('home.primary', legacy.homeHero.rippleDesktop, legacy.homeHero.rippleMobile);
  images.homeHero.rippleMobile = primary.mobileImage;
  return images;
}
