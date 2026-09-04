import downloadSettingsJson from './catalog-downloads.json';

export interface CatalogDownload {
  id: string;
  fileName: string;
  title: string;
  description: string;
  url: string;
}

interface CatalogDownloadSettings {
  enabled?: boolean;
  documents?: unknown[];
}

const downloadSettings = downloadSettingsJson as CatalogDownloadSettings;

const normalizeDocument = (value: unknown): CatalogDownload | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const document = {
    id: String(record.id || '').trim(),
    fileName: String(record.fileName || '').trim(),
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    url: String(record.url || '').trim(),
  };

  try {
    const url = new URL(document.url);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id)) return null;
    if (!document.fileName.toLowerCase().endsWith('.pdf') || !document.title) return null;
    if (url.protocol !== 'https:' || !url.pathname.toLowerCase().endsWith('.pdf')) return null;
    return document;
  } catch {
    return null;
  }
};

export const catalogDownloadsEnabled = downloadSettings.enabled === true;

// Only explicitly enabled, valid HTTPS documents are exposed to the gated-download API.
const configuredDocuments = catalogDownloadsEnabled
  ? (downloadSettings.documents || []).map(normalizeDocument).filter((item): item is CatalogDownload => item !== null)
  : [];
const seenDocumentIds = new Set<string>();
export const catalogDownloads: readonly CatalogDownload[] = configuredDocuments.filter(document => {
  if (seenDocumentIds.has(document.id)) return false;
  seenDocumentIds.add(document.id);
  return true;
});

export const catalogDownloadsAvailable = catalogDownloadsEnabled && catalogDownloads.length > 0;

export const catalogDownloadById = (id: string) =>
  catalogDownloads.find(document => document.id === id);
