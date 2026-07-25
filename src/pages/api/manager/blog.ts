import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getRuntimeEnv, requireManagerAccess } from '../../../lib/manager/access';

export const prerender = false;

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

export const GET: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const posts = (await getCollection('blog')).sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      posts: posts.map(post => ({
        id: post.id,
        slug: slugFromId(post.id),
        title: post.data.title,
        description: post.data.description,
        category: post.data.category,
        image: post.data.image,
        author: post.data.author,
        featured: post.data.featured,
        publishDate: post.data.publishDate.toISOString(),
        body: (post as unknown as { body?: string }).body || '',
      })),
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};
