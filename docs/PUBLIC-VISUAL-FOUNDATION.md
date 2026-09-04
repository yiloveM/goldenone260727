# Golden One Public Visual Boundary

## Purpose

Golden One is an established customer site, not the neutral mother template. Its public composition, styles, media, product architecture, and interaction language are customer assets. Engineering-capability migrations must preserve them unless the owner separately requests a phase-one public redesign.

## Isolation Boundary

- `src/styles/goldenone-redesign.css` and the existing public component markup own the current customer visual layer.
- `src/styles/home-tailwind.css` is scoped to `IndustryHome.astro`; it uses the existing Tailwind prefix and does not authorize a site-wide restyle.
- `src/components/IndustryHome.astro` remains shared by English and localized home routes.
- `BaseLayout.astro` owns metadata, JSON-LD, canonical URLs, hreflang, navigation data, language switching, inquiry cart, and footer routes.
- `/keystatic/`, `/manager/`, `/api/`, `/r2/`, Cloudflare bindings, content schemas, CAPTCHA, public-form persistence, controlled-download services, and publishing workflows are engineering capabilities outside the customer public visual layer.

Adding a disabled backend capability, locale plumbing, API route, audit, or documentation must not recolor, rearrange, rename, or restyle Golden One public pages. A future phase-one redesign may replace public composition only after current industry research and explicit scope confirmation.

## Interaction Gate

For public changes, test desktop and mobile navigation, submenu pointer transitions, keyboard focus, touch, carousels, galleries, filters, forms, CAPTCHA, sharing, inquiry cart, loading/success/error states, overflow, reduced motion, and no-script content. Remove duplicate headings and template residue without weakening buyer-facing information.

Run:

```powershell
npm run check
npm run check:template
npm run build
```
