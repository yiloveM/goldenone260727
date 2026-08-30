import type { APIRoute } from 'astro';
import { getRuntimeEnv, requireManagerAccess } from '../../../../lib/manager/access';

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
    throw new Error('图片文件夹路径不正确。');
  }

  return prefix;
};

const normalizeKey = (value: string | null) => {
  const key = (value || '').trim().replace(/^\/+/, '');

  if (!key || key.endsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error('文件路径不正确。');
  }

  return key;
};

const normalizeFolderPrefix = (value: string | null) => {
  const prefix = normalizePrefix(value);
  if (!prefix) throw new Error('请输入文件夹名称。');
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
};

const normalizeLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, MAX_LIMIT);
};

const normalizeBaseUrl = (value: unknown) => {
  const baseUrl = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_PUBLIC_BASE_URL;
  return baseUrl.replace(/\/+$/, '');
};

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
const getFileName = (key: string) => key.split('/').filter(Boolean).pop() || key;
const getFolderName = (prefix: string) => prefix.split('/').filter(Boolean).pop() || prefix;
const isFolderPlaceholderKey = (key: string) => getFileName(key) === FOLDER_PLACEHOLDER_NAME;

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

const keyFromPrefixAndExistingName = (prefix: string, sourceKey: string) => {
  const normalizedPrefix = prefix ? prefix.replace(/\/?$/, '/') : '';
  return `${normalizedPrefix}${sanitizeFilename(getFileName(sourceKey))}`;
};

const splitExtension = (key: string) => {
  const slashIndex = key.lastIndexOf('/');
  const dotIndex = key.lastIndexOf('.');

  if (dotIndex === -1 || dotIndex < slashIndex) {
    return { stem: key, extension: '' };
  }

  return { stem: key.slice(0, dotIndex), extension: key.slice(dotIndex) };
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
const getUniqueTargetKey = async (bucket: any, sourceKey: string, targetPrefix: string) => {
  let targetKey = keyFromPrefixAndExistingName(targetPrefix, sourceKey);

  if (targetKey === sourceKey) return targetKey;
  if (!(await bucket.head(targetKey))) return targetKey;

  const { stem, extension } = splitExtension(targetKey);
  let index = 1;

  while (await bucket.head(targetKey)) {
    targetKey = `${stem}-${Date.now()}-${index}${extension}`;
    index += 1;
  }

  return targetKey;
};

const getBucket = (env: Record<string, unknown> | undefined) => env?.CONTENT_BUCKET as any;

export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const bucket = getBucket(env);
  if (!bucket) {
    return new Response('图片管理服务暂时不可用，请稍后重试。', { status: 503 });
  }

  let prefix = '';
  try {
    prefix = normalizePrefix(url.searchParams.get('prefix'));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '图片文件夹路径不正确。', { status: 400 });
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

  const documents = files.filter((file: any) => file.isDocument);

  return new Response(
    JSON.stringify({
      manager: { email: access.email },
      prefix,
      documents,
      folders,
      files,
      images: files.filter((file: any) => file.isImage),
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
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const bucket = getBucket(env);
  if (!bucket) {
    return new Response('图片管理服务暂时不可用，请稍后重试。', { status: 503 });
  }

  const formData = await request.formData();
  let prefix = '';
  try {
    prefix = normalizePrefix(String(formData.get('prefix') || ''));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '图片文件夹路径不正确。', { status: 400 });
  }

  const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return new Response('请选择需要上传的图片或 PDF 文件。', { status: 400 });
  if (files.length > MAX_UPLOAD_FILES) return new Response(`一次最多上传 ${MAX_UPLOAD_FILES} 个文件。`, { status: 400 });

  const publicBaseUrl = normalizeBaseUrl(env?.PUBLIC_R2_ASSET_BASE_URL || import.meta.env.PUBLIC_R2_ASSET_BASE_URL);
  const uploaded = [];

  for (const file of files) {
    if (!isSupportedMediaFile(file.name, file.type)) {
      return new Response(`不支持的媒体文件：${file.name}`, { status: 400 });
    }

    const isPdf = isPdfFileName(file.name, file.type);
    if (isPdf && file.size > MAX_PDF_BYTES) {
      return new Response(`PDF 文件不能超过 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB：${file.name}`, { status: 400 });
    }

    let key = keyFromPrefixAndFilename(prefix, file.name);
    if (await bucket.head(key)) {
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
      customMetadata: { source: 'manager-image-pool', uploadedBy: access.email },
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
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
};
export const PUT: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const bucket = getBucket(env);
  if (!bucket) {
    return new Response('图片管理服务暂时不可用，请稍后重试。', { status: 503 });
  }

  let folderPrefix = '';
  try {
    const body = (await request.json()) as { prefix?: string };
    folderPrefix = normalizeFolderPrefix(body.prefix || null);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '文件夹名称不正确。', { status: 400 });
  }

  await bucket.put(`${folderPrefix}${FOLDER_PLACEHOLDER_NAME}`, '', {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: { source: 'manager-image-pool-folder', createdBy: access.email },
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
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    }
  );
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const bucket = getBucket(env);
  if (!bucket) {
    return new Response('图片管理服务暂时不可用，请稍后重试。', { status: 503 });
  }

  let keys: string[] = [];
  let targetPrefix = '';
  try {
    const body = (await request.json()) as { keys?: string[]; targetPrefix?: string };
    keys = Array.isArray(body.keys) ? [...new Set(body.keys.map(key => normalizeKey(key || null)))] : [];
    targetPrefix = normalizePrefix(body.targetPrefix || '');
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '移动文件请求不正确。', { status: 400 });
  }

  if (!keys.length) return new Response('请先选择需要移动的文件。', { status: 400 });
  if (keys.length > MAX_MOVE_FILES) return new Response(`一次最多移动 ${MAX_MOVE_FILES} 个文件。`, { status: 400 });

  const moved = [];
  for (const key of keys) {
    const object = await bucket.get(key);
    if (!object?.body) return new Response(`找不到文件：${key}`, { status: 404 });

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
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const env = getRuntimeEnv(locals);
  const access = requireManagerAccess(request, env);
  if (access.response) return access.response;

  const bucket = getBucket(env);
  if (!bucket) {
    return new Response('图片管理服务暂时不可用，请稍后重试。', { status: 503 });
  }

  let key = '';
  try {
    const body = (await request.json()) as { key?: string };
    key = normalizeKey(body.key || null);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : '文件路径不正确。', { status: 400 });
  }

  await bucket.delete(key);

  return new Response(JSON.stringify({ deleted: key }), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
};
