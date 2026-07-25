import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { productCategoryMeta, sortProductsByPriority } from '../../../data/productCategories';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const prerender = false;

const DEFAULT_BRANCH = 'main';
const PRODUCT_PATH_PREFIX = 'src/content/products/';

const parseCookies = (request: Request) => {
  const cookies: Record<string, string> = {};
  const header = request.headers.get('cookie') || '';

  for (const item of header.split(';')) {
    const [name, ...valueParts] = item.trim().split('=');
    if (!name || !valueParts.length) continue;
    try {
      cookies[name] = decodeURIComponent(valueParts.join('='));
    } catch {
      cookies[name] = valueParts.join('=');
    }
  }

  return cookies;
};

const getEnvString = (env: Record<string, unknown> | undefined, key: string) =>
  typeof env?.[key] === 'string' ? env[key].trim() : '';

const getRepoFullName = (env: Record<string, unknown> | undefined) =>
  getEnvString(env, 'KEYSTATIC_GITHUB_REPO') || getEnvString(env, 'PUBLIC_KEYSTATIC_GITHUB_REPO') || 'your-org/businessweb';

const getBranch = (env: Record<string, unknown> | undefined) => getEnvString(env, 'KEYSTATIC_GITHUB_BRANCH') || DEFAULT_BRANCH;

const githubHeaders = (accessToken: string) => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${accessToken}`,
  'content-type': 'application/json',
  'user-agent': 'businessweb-keystatic-product-manager',
});

const githubFetch = async <T>(url: string, accessToken: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(accessToken),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
};

const getAccessToken = (request: Request) => parseCookies(request)['keystatic-gh-access-token'] || '';

const hasGitHubWriteAccess = async (request: Request, env: Record<string, unknown> | undefined) => {
  const accessToken = getAccessToken(request);
  if (!accessToken) return false;

  const user = await githubFetch<{ login?: string }>('https://api.github.com/user', accessToken);
  if (!user.login) return false;

  const permission = await githubFetch<{ permission?: string }>(
    `https://api.github.com/repos/${getRepoFullName(env)}/collaborators/${encodeURIComponent(user.login)}/permission`,
    accessToken
  );

  return permission.permission === 'admin' || permission.permission === 'maintain' || permission.permission === 'write';
};

const requireWriteAccess = async (request: Request, env: Record<string, unknown> | undefined) => {
  if (await hasGitHubWriteAccess(request, env)) {
    return null;
  }

  return new Response('需要使用有内容管理权限的账号登录后才能保存产品。', { status: 401 });
};

const slugFromId = (id: string) => id.replace(/\.mdoc$/, '');

const pathForProductId = (id: string) => `${PRODUCT_PATH_PREFIX}${id}`;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const updateSortOrder = (source: string, sortOrder: number) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Product file is missing frontmatter');
  }

  const frontmatter = match[1];
  const nextLine = `sortOrder: ${sortOrder}`;
  const nextFrontmatter = /^sortOrder:\s*.*$/m.test(frontmatter)
    ? frontmatter.replace(/^sortOrder:\s*.*$/m, nextLine)
    : /^series:\s*.*$/m.test(frontmatter)
      ? frontmatter.replace(/^(series:\s*.*)$/m, `$1\n${nextLine}`)
      : `${frontmatter}\n${nextLine}`;

  return `---\n${nextFrontmatter}\n---${source.slice(match[0].length)}`;
};

const updatePublished = (source: string, published: boolean) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Product file is missing frontmatter');
  }

  const frontmatter = match[1];
  const nextLine = `published: ${published ? 'true' : 'false'}`;
  const nextFrontmatter = /^published:\s*.*$/m.test(frontmatter)
    ? frontmatter.replace(/^published:\s*.*$/m, nextLine)
    : /^featured:\s*.*$/m.test(frontmatter)
      ? frontmatter.replace(/^(featured:\s*.*)$/m, `${nextLine}\n$1`)
      : `${frontmatter}\n${nextLine}`;

  return `---\n${nextFrontmatter}\n---${source.slice(match[0].length)}`;
};

const getProductSummaries = async () => {
  const products = sortProductsByPriority(await getCollection('products'));
  const categories = [
    ...productCategoryMeta.map(category => category.name),
    ...Array.from(new Set(products.map(product => product.data.category))).filter(
      category => !productCategoryMeta.some(meta => meta.name === category)
    ),
  ];

  return {
    products: products.map(product => ({
      id: product.id,
      slug: slugFromId(product.id),
      title: product.data.title,
      series: product.data.series,
      category: product.data.category,
      image: product.data.image,
      sortOrder: product.data.sortOrder,
      published: product.data.published !== false,
    })),
    categories,
  };
};

export const GET: APIRoute = async () => {
  const data = await getProductSummaries();

  return new Response(JSON.stringify(data), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  const accessToken = getAccessToken(request);
  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);

  let body: {
    category?: string;
    productIds?: string[];
    sortOrders?: Array<{ id?: string; sortOrder?: number }>;
    publications?: Array<{ id?: string; published?: boolean }>;
  };

  try {
    body = (await request.json()) as {
      category?: string;
      productIds?: string[];
      sortOrders?: Array<{ id?: string; sortOrder?: number }>;
      publications?: Array<{ id?: string; published?: boolean }>;
    };
  } catch {
    return new Response('Bad product order payload', { status: 400 });
  }

  const products = await getCollection('products');
  const productsById = new Map(products.map(product => [product.id, product]));
  const requestedUpdates = Array.isArray(body.sortOrders)
    ? body.sortOrders.map(item => ({
        id: item.id || '',
        sortOrder: Number.isFinite(item.sortOrder) && Number(item.sortOrder) > 0 ? Number(item.sortOrder) : 9999,
      }))
    : [];
  const publicationUpdates = Array.isArray(body.publications)
    ? body.publications.map(item => ({
        id: item.id || '',
        published: item.published !== false,
      }))
    : [];

  const updates = requestedUpdates.length
    ? requestedUpdates
    : (() => {
        const category = (body.category || '').trim();
        const productIds = Array.isArray(body.productIds) ? body.productIds : [];
        if (!category || !productIds.length) return [];

        const categoryProducts = products.filter(product => product.data.category === category);
        const expectedIds = new Set(categoryProducts.map(product => product.id));
        if (productIds.length !== expectedIds.size || productIds.some(id => !expectedIds.has(id) || !productsById.has(id))) {
          return null;
        }

        return productIds.map((id, index) => ({ id, sortOrder: index + 1 }));
      })();

  if (updates === null) {
    return new Response('Product order must include every product in the selected category exactly once', { status: 400 });
  }

  if (
    (!updates.length && !publicationUpdates.length) ||
    updates.some(update => !productsById.has(update.id)) ||
    publicationUpdates.some(update => !productsById.has(update.id))
  ) {
    return new Response('Valid product sort order updates are required', { status: 400 });
  }

  const ref = await githubFetch<{ object: { sha: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/ref/heads/${encodeURIComponent(branch)}`,
    accessToken
  );
  const headSha = ref.object.sha;
  const headCommit = await githubFetch<{ tree: { sha: string } }>(
    `https://api.github.com/repos/${repoFullName}/git/commits/${headSha}`,
    accessToken
  );

  const tree = [];

  for (const update of updates) {
    const path = pathForProductId(update.id);
    const file = await githubFetch<{ content: string }>(
      `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      accessToken
    );
    const content = updateSortOrder(decodeBase64(file.content), update.sortOrder);
    tree.push({
      path,
      mode: '100644',
      type: 'blob',
      content,
    });
  }

  for (const update of publicationUpdates) {
    const path = pathForProductId(update.id);
    const file = await githubFetch<{ content: string }>(
      `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      accessToken
    );
    const content = updatePublished(decodeBase64(file.content), update.published);
    tree.push({
      path,
      mode: '100644',
      type: 'blob',
      content,
    });
  }

  const nextTree = await githubFetch<{ sha: string }>(`https://api.github.com/repos/${repoFullName}/git/trees`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree,
    }),
  });
  const nextCommit = await githubFetch<{ sha: string }>(`https://api.github.com/repos/${repoFullName}/git/commits`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      message: publicationUpdates.length && !updates.length ? `Update product visibility` : `Update product display weights`,
      tree: nextTree.sha,
      parents: [headSha],
    }),
  });

  await githubFetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/${encodeURIComponent(branch)}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: nextCommit.sha,
    }),
  });

  return new Response(JSON.stringify({ commit: nextCommit.sha }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  const accessToken = getAccessToken(request);
  const repoFullName = getRepoFullName(env);
  const branch = getBranch(env);

  let body: { id?: string };

  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return new Response('Bad delete product payload', { status: 400 });
  }

  const productId = (body.id || '').trim();
  if (!productId || productId.includes('/') || productId.includes('\\') || !productId.endsWith('.mdoc')) {
    return new Response('Valid product id is required', { status: 400 });
  }

  const products = await getCollection('products');
  const product = products.find(item => item.id === productId);
  if (!product) {
    return new Response('Product was not found', { status: 404 });
  }

  const path = pathForProductId(productId);
  const file = await githubFetch<{ sha: string }>(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    accessToken
  );

  const deleted = await githubFetch<{ commit: { sha: string } }>(
    `https://api.github.com/repos/${repoFullName}/contents/${encodePath(path)}`,
    accessToken,
    {
      method: 'DELETE',
      body: JSON.stringify({
        message: `Delete product ${product.data.title}`,
        sha: file.sha,
        branch,
      }),
    }
  );

  return new Response(JSON.stringify({ deleted: productId, commit: deleted.commit.sha }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
