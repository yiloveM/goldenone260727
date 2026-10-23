import Markdoc from '@markdoc/markdoc';
import { safeContentUrl } from './content-links.mjs';

// The installed Markdoc parser handles nested emphasis, escaped brackets and
// balanced URL parentheses. Only an explicit HTML vocabulary crosses into UI.
export function renderMarkdownPreview(body: string, resolveMedia: (value: string) => string = value => value) {
  const ast = Markdoc.parse(String(body || ''));
  const mediaAttrs = { src: { type: String, required: true }, alt: { type: String }, caption: { type: String }, title: { type: String } };
  const tree = Markdoc.transform(ast, { tags: {
    r2Image: { attributes: mediaAttrs, transform(node: any) {
      const { src, alt = '', caption = '' } = node.attributes;
      const url = safeContentUrl(resolveMedia(safeContentUrl(src, true)), true);
      return url ? new Markdoc.Tag('figure', {}, [new Markdoc.Tag('img', { src: url, alt, loading: 'lazy' }), ...(caption ? [new Markdoc.Tag('figcaption', {}, [caption])] : [])]) : [];
    } },
    r2Document: { attributes: mediaAttrs, transform(node: any) {
      const url = safeContentUrl(resolveMedia(safeContentUrl(node.attributes.src, true)), true);
      return url ? new Markdoc.Tag('p', {}, [new Markdoc.Tag('a', { href: url }, [node.attributes.title || 'PDF document'])]) : [];
    } },
  } });
  const allowed = new Set(['article','p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','s','a','img','figure','figcaption','blockquote','hr','br','pre','code','table','thead','tbody','tr','th','td']);
  const clean = (value: any): any => {
    if (Array.isArray(value)) return value.flatMap(item => { const next = clean(item); return Array.isArray(next) ? next : [next]; });
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (!value || !allowed.has(value.name)) return [];
    const children = clean(value.children || []);
    const attrs: Record<string, any> = {};
    if (value.name === 'a') {
      const href = safeContentUrl(value.attributes?.href);
      if (!href) return children;
      attrs.href = href;
      attrs.rel = 'noopener noreferrer';
      if (typeof value.attributes?.title === 'string') attrs.title = value.attributes.title;
    }
    if (value.name === 'img') {
      const src = safeContentUrl(resolveMedia(safeContentUrl(value.attributes?.src, true)), true);
      if (!src) return [];
      Object.assign(attrs, { src, alt: String(value.attributes?.alt || ''), loading: 'lazy' });
    }
    if (value.name === 'ol' && Number.isSafeInteger(value.attributes?.start)) attrs.start = value.attributes.start;
    return new Markdoc.Tag(value.name, attrs, children);
  };
  return Markdoc.renderers.html(clean(tree));
}
