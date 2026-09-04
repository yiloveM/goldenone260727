# AstroWind Integration Boundary

## Decision

AstroWind is an optional public-layer engineering reference, not a replacement for the Golden One application core and not a visual authority for this customer site.

It may inform component boundaries, semantic markup, stable media dimensions, responsive spacing, progressive enhancement, and low-JavaScript implementation. Do not copy an upstream theme or periodically overwrite this repository.

## Golden One Ownership

Golden One retains:

- Astro 6 with the Cloudflare Workers adapter and static-assets-first routing;
- the existing Golden One public visual layer and product architecture;
- `/keystatic/`, `/manager/`, D1, R2, KV, AI translation, analytics, public forms, CAPTCHA, controlled downloads, publishing, and Git write-back;
- canonical, hreflang, sitemap, JSON-LD, `llms.txt`, and product-catalog behavior.

AstroWind must not introduce a second site configuration, SEO implementation, content collection, deployment system, header, language source, or administration workflow. Its demo pages, SaaS modules, theme switching, template copy, palette, card composition, and animations are not buyer or industry evidence.

## Adoption Rule

Before adapting any upstream implementation:

1. identify the specific accessibility, performance, or maintainability problem;
2. confirm the current Golden One code does not already solve it;
3. explain any stack or capability change and obtain the owner's required approval before editing;
4. adapt only the smallest useful part without changing the public visual layer during capability-only work;
5. retain any license notice required by the exact upstream code used;
6. run the repository checks and browser QA appropriate to the change.

Current industry research and explicit owner references remain the only design authority.
