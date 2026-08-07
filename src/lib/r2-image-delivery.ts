export type R2ImageDeliveryMode = 'original' | 'edge-webp';

const WEBP_TRANSFORM_SOURCE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

const getExtension = (value: string) => {
  const pathname = value.split(/[?#]/, 1)[0] || '';
  return pathname.split('.').pop()?.toLowerCase() || '';
};

export const getR2WebpDeliveryUrl = (source: string | undefined, assetBaseUrl: string | undefined, deliveryMode: string | undefined) => {
  if (deliveryMode?.trim().toLowerCase() !== 'edge-webp' || !source || !assetBaseUrl) return '';

  try {
    const imageUrl = new URL(source);
    const assetBase = new URL(assetBaseUrl);
    const assetBasePath = assetBase.pathname.replace(/\/+$/, '');

    if (imageUrl.origin !== assetBase.origin) return '';
    if (assetBasePath) return '';
    if (imageUrl.pathname.startsWith('/cdn-cgi/image/')) return '';
    if (!WEBP_TRANSFORM_SOURCE_EXTENSIONS.has(getExtension(imageUrl.pathname))) return '';

    return `${imageUrl.origin}/cdn-cgi/image/format=webp,quality=82${imageUrl.pathname}`;
  } catch {
    return '';
  }
};
