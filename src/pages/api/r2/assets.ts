import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/runtime-env';

export const prerender = false;

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp']);
const DEFAULT_PUBLIC_BASE_URL = 'https://cdn.example.com';
const PDF_EXTENSION = 'pdf';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MAX_LIMIT = 500;
const MAX_UPLOAD_FILES = 12;
const MAX_MOVE_FILES = 50;
const FOLDER_PLACEHOLDER_NAME = '.keep';

const normalizePrefix = (value: string | null) => {
  const prefix = (value || '').trim().replace(/^\/+/, '');

  if (prefix.includes('..') || prefix.includes('\\')) {
    throw new Error('Bad R2 prefix');
  }

  return prefix;
};

const normalizeKey = (value: string | null) => {
  const key = (value || '').trim().replace(/^\/+/, '');

  if (!key || key.endsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error('Bad R2 object key');
  }

  return key;
};

const normalizeFolderPrefix = (value: string | null) => {
  const prefix = normalizePrefix(value);

  if (!prefix) {
    throw new Error('Folder prefix is required');
  }

  return prefix.endsWith('/') ? prefix : `${prefix}/`;
};

const normalizeLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, MAX_LIMIT);
};

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

const normalizeBaseUrl = (value: unknown) => {
  const baseUrl = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_PUBLIC_BASE_URL;
  return baseUrl.replace(/\/+$/, '');
};

const getFileName = (key: string) => key.split('/').filter(Boolean).pop() || key;

const isFolderPlaceholderKey = (key: string) => getFileName(key) === FOLDER_PLACEHOLDER_NAME;

const getFolderName = (prefix: string) => {
  const parts = prefix.split('/').filter(Boolean);
  return parts[parts.length - 1] || prefix;
};

const getContentType = (filename: string, fallback = '') => {
  if (fallback.startsWith('image/') || fallback === 'application/pdf') return fallback;

  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  };

  return mimeTypes[extension] || 'application/octet-stream';
};

const isImageFileName = (filename: string, type = '') => {
  if (type.startsWith('image/')) return true;
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(extension);
};

const isPdfFileName = (filename: string, type = '') => type === 'application/pdf' || filename.split('.').pop()?.toLowerCase() === PDF_EXTENSION;
const isSupportedMediaFile = (filename: string, type = '') => isImageFileName(filename, type) || isPdfFileName(filename, type);
const sanitizeFilename = (filename: string) => {
  const fallbackName = `image-${Date.now()}`;
  const cleanName = (filename || fallbackName)
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '');

  return cleanName || fallbackName;
};

const keyFromPrefixAndFilename = (prefix: string, filename: string) => {
  const normalizedPrefix = prefix ? prefix.replace(/\/?$/, '/') : '';
  return `${normalizedPrefix}${sanitizeFilename(filename)}`;
};

const splitExtension = (key: string) => {
  const slashIndex = key.lastIndexOf('/');
  const dotIndex = key.lastIndexOf('.');

  if (dotIndex === -1 || dotIndex < slashIndex) {
    return { stem: key, extension: '' };
  }

  return { stem: key.slice(0, dotIndex), extension: key.slice(dotIndex) };
};

const keyFromPrefixAndExistingName = (prefix: string, sourceKey: string) => {
  const normalizedPrefix = prefix ? prefix.replace(/\/?$/, '/') : '';
  return `${normalizedPrefix}${sanitizeFilename(getFileName(sourceKey))}`;
};

const getUniqueTargetKey = async (bucket: any, sourceKey: string, targetPrefix: string) => {
  let targetKey = keyFromPrefixAndExistingName(targetPrefix, sourceKey);

  if (targetKey === sourceKey) {
    return targetKey;
  }

  let existing = await bucket.head(targetKey);
  if (!existing) return targetKey;

  const { stem, extension } = splitExtension(targetKey);
  let index = 1;

  while (existing) {
    targetKey = `${stem}-${Date.now()}-${index}${extension}`;
    existing = await bucket.head(targetKey);
    index += 1;
  }

  return targetKey;
};

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
  getEnvString(env, 'PUBLIC_KEYSTATIC_GITHUB_REPO') || getEnvString(env, 'KEYSTATIC_GITHUB_REPO') || 'yiloveM/goldenone260727';

const hasGitHubWriteAccess = async (request: Request, env: Record<string, unknown> | undefined) => {
  const accessToken = parseCookies(request)['keystatic-gh-access-token'];
  if (!accessToken) return false;

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'businessweb-keystatic-image-pool',
    },
  });

  if (!userResponse.ok) return false;

  const user = (await userResponse.json()) as { login?: string };
  if (!user.login) return false;

  const permissionResponse = await fetch(
    `https://api.github.com/repos/${getRepoFullName(env)}/collaborators/${encodeURIComponent(user.login)}/permission`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'businessweb-keystatic-image-pool',
      },
    }
  );

  if (!permissionResponse.ok) return false;

  const data = (await permissionResponse.json()) as { permission?: string };
  return data.permission === 'admin' || data.permission === 'maintain' || data.permission === 'write';
};

const requireWriteAccess = async (request: Request, env: Record<string, unknown> | undefined) => {
  const expectedToken = getEnvString(env, 'R2_IMAGE_POOL_WRITE_TOKEN') || getEnvString(env, 'KEYSTATIC_SECRET');
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerToken = request.headers.get('x-r2-image-pool-token') || '';

  if (expectedToken && (bearerToken === expectedToken || headerToken === expectedToken)) {
    return null;
  }

  if (await hasGitHubWriteAccess(request, env)) {
    return null;
  }

  return new Response('需要使用有仓库写入权限的 Keystatic GitHub 账号登录后才能上传或删除 R2 文件。', { status: 401 });
};
const getObjectContentType = (object: any) => object.httpMetadata?.contentType || object.customMetadata?.contentType || '';

const isImageObject = (object: any) => {
  const contentType = getObjectContentType(object);
  if (contentType.startsWith('image/')) return true;

  const extension = object.key.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(extension);
};

const isDocumentObject = (object: any) => {
  const contentType = getObjectContentType(object);
  if (contentType === 'application/pdf') return true;
  return object.key.split('.').pop()?.toLowerCase() === PDF_EXTENSION;
};
export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let prefix: string;

  try {
    prefix = normalizePrefix(url.searchParams.get('prefix'));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad R2 prefix', { status: 400 });
  }

  const bucket = env?.CONTENT_BUCKET as any;

  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const cursor = url.searchParams.get('cursor') || undefined;
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const publicBaseUrl = normalizeBaseUrl(env?.PUBLIC_R2_ASSET_BASE_URL || import.meta.env.PUBLIC_R2_ASSET_BASE_URL);

  const list = await bucket.list({
    cursor,
    delimiter: '/',
    include: ['httpMetadata', 'customMetadata'],
    limit,
    prefix,
  });

  const folders = (list.delimitedPrefixes || []).map((folderPrefix: string) => {
    const normalizedFolderPrefix = folderPrefix.endsWith('/') ? folderPrefix : `${folderPrefix}/`;

    return {
      type: 'folder',
      prefix: normalizedFolderPrefix,
      name: getFolderName(normalizedFolderPrefix),
    };
  });

  const files = list.objects
    .filter((object: any) => !isFolderPlaceholderKey(object.key))
    .map((object: any) => ({
      type: 'file',
      key: object.key,
      name: getFileName(object.key),
      url: `${publicBaseUrl}/${encodeKey(object.key)}`,
      size: object.size,
      uploaded: object.uploaded ? object.uploaded.toISOString() : null,
      contentType: getObjectContentType(object),
      isImage: isImageObject(object),
      isDocument: isDocumentObject(object),
    }));

  const images = files.filter((file: any) => file.isImage);
  const documents = files.filter((file: any) => file.isDocument);

  return new Response(
    JSON.stringify({
      prefix,
      folders,
      files,
      images,
      documents,
      truncated: list.truncated,
      cursor: list.truncated ? list.cursor : undefined,
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};
export const POST: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const bucket = env?.CONTENT_BUCKET as any;

  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  const formData = await request.formData();
  let prefix: string;

  try {
    prefix = normalizePrefix(String(formData.get('prefix') || ''));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad R2 prefix', { status: 400 });
  }

  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);

  if (!files.length) {
    return new Response('No supported media files were provided', { status: 400 });
  }

  if (files.length > MAX_UPLOAD_FILES) {
    return new Response(`Upload at most ${MAX_UPLOAD_FILES} files at a time`, { status: 400 });
  }

  const uploaded = [];
  const publicBaseUrl = normalizeBaseUrl(env?.PUBLIC_R2_ASSET_BASE_URL || import.meta.env.PUBLIC_R2_ASSET_BASE_URL);

  for (const file of files) {
    if (!isSupportedMediaFile(file.name, file.type)) {
      return new Response(`Unsupported media file: ${file.name}`, { status: 400 });
    }

    const isPdf = isPdfFileName(file.name, file.type);
    if (isPdf && file.size > MAX_PDF_BYTES) {
      return new Response(`PDF files must not exceed ${MAX_PDF_BYTES} bytes: ${file.name}`, { status: 400 });
    }

    let key = keyFromPrefixAndFilename(prefix, file.name);
    const existing = await bucket.head(key);

    if (existing) {
      const dotIndex = key.lastIndexOf('.');
      const suffix = `-${Date.now()}`;
      key = dotIndex === -1 ? `${key}${suffix}` : `${key.slice(0, dotIndex)}${suffix}${key.slice(dotIndex)}`;
    }

    const object = await bucket.put(key, file, {
      httpMetadata: {
        cacheControl: PUBLIC_MEDIA_CACHE_CONTROL,
        contentDisposition: isPdf ? `inline; filename="${sanitizeFilename(file.name)}"` : undefined,
        contentType: getContentType(file.name, file.type),
      },
      customMetadata: {
        source: 'keystatic-image-pool',
      },
    });

    uploaded.push({
      key,
      name: getFileName(key),
      url: `${publicBaseUrl}/${encodeKey(key)}`,
      size: object?.size || file.size,
      uploaded: object?.uploaded ? object.uploaded.toISOString() : null,
      contentType: getContentType(file.name, file.type),
    });
  }

  return new Response(JSON.stringify({ uploaded }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
export const PUT: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const bucket = env?.CONTENT_BUCKET as any;

  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let folderPrefix: string;

  try {
    const body = (await request.json()) as { prefix?: string };
    folderPrefix = normalizeFolderPrefix(body.prefix || null);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad R2 folder prefix', { status: 400 });
  }

  const placeholderKey = `${folderPrefix}${FOLDER_PLACEHOLDER_NAME}`;
  await bucket.put(placeholderKey, '', {
    httpMetadata: {
      contentType: 'text/plain; charset=utf-8',
    },
    customMetadata: {
      source: 'keystatic-image-pool-folder',
    },
  });

  return new Response(
    JSON.stringify({
      folder: {
        type: 'folder',
        prefix: folderPrefix,
        name: getFolderName(folderPrefix),
      },
    }),
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    }
  );
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const bucket = env?.CONTENT_BUCKET as any;

  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let keys: string[];
  let targetPrefix: string;

  try {
    const body = (await request.json()) as { keys?: string[]; targetPrefix?: string };
    keys = Array.isArray(body.keys) ? [...new Set(body.keys.map(key => normalizeKey(key || null)))] : [];
    targetPrefix = normalizePrefix(body.targetPrefix || '');
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad R2 move request', { status: 400 });
  }

  if (!keys.length) {
    return new Response('No R2 object keys were provided', { status: 400 });
  }

  if (keys.length > MAX_MOVE_FILES) {
    return new Response(`Move at most ${MAX_MOVE_FILES} files at a time`, { status: 400 });
  }

  const moved = [];

  for (const key of keys) {
    const object = await bucket.get(key);

    if (!object?.body) {
      return new Response(`R2 object not found: ${key}`, { status: 404 });
    }

    const targetKey = await getUniqueTargetKey(bucket, key, targetPrefix);

    if (targetKey === key) {
      moved.push({ from: key, to: targetKey, skipped: true });
      continue;
    }

    await bucket.put(targetKey, object.body, {
      customMetadata: object.customMetadata,
      httpMetadata: object.httpMetadata,
    });
    await bucket.delete(key);
    moved.push({ from: key, to: targetKey });
  }

  return new Response(JSON.stringify({ moved }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const bucket = env?.CONTENT_BUCKET as any;

  if (!bucket) {
    return new Response('R2 binding CONTENT_BUCKET is not configured', { status: 503 });
  }

  const writeError = await requireWriteAccess(request, env);
  if (writeError) return writeError;

  let key: string;

  try {
    const body = (await request.json()) as { key?: string };
    key = normalizeKey(body.key || null);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Bad R2 object key', { status: 400 });
  }

  await bucket.delete(key);

  return new Response(JSON.stringify({ deleted: key }), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
