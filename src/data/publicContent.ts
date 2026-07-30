import type { CollectionEntry } from 'astro:content';

const isTemplateExample = (id: string) => id.startsWith('template-example-');

export const isPublicBlogPost = (post: CollectionEntry<'blog'>) => !isTemplateExample(post.id);
