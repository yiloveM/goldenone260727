import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type R2Folder = {
  type: 'folder';
  prefix: string;
  name: string;
};

type R2File = {
  type: 'file';
  key: string;
  name: string;
  url: string;
  size: number;
  uploaded: string | null;
  contentType: string;
  isImage: boolean;
  isDocument: boolean;
};

type R2AssetResponse = {
  prefix: string;
  folders: R2Folder[];
  files: R2File[];
  images?: R2File[];
  truncated: boolean;
  cursor?: string;
};

type LoadState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; data: R2AssetResponse }
  | { kind: 'error'; message: string };

type R2ImagePickerProps = {
  isOpen: boolean;
  title?: string;
  assetKind?: 'image' | 'document';
  onSelect(url: string): void;
  onClose(): void;
};

const normalizeAdminPrefix = (value: string) => {
  const cleaned = value.trim().replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!cleaned) return '';
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
};

const getParentPrefix = (prefix: string) => {
  const trimmed = prefix.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index === -1 ? '' : `${trimmed.slice(0, index)}/`;
};

const getBreadcrumbs = (prefix: string) => {
  const parts = prefix.split('/').filter(Boolean);
  let accumulated = '';

  return parts.map(part => {
    accumulated += `${part}/`;
    return { name: part, prefix: accumulated };
  });
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
};

export function R2ImagePicker({ isOpen, title = '选择图片', assetKind = 'image', onSelect, onClose }: R2ImagePickerProps) {
  const rootRef = useRef<HTMLDialogElement | null>(null);
  const [prefix, setPrefix] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [copiedUrl, setCopiedUrl] = useState('');

  useSyncedSurfaceTheme(rootRef, 'r2');
  const isDocumentPicker = assetKind === 'document';

  const loadAssets = useCallback(async (nextPrefix: string, nextCursor?: string, append = false) => {
    const normalizedPrefix = normalizeAdminPrefix(nextPrefix);
    setState(current => (append && current.kind === 'ready' ? current : { kind: 'loading' }));

    const params = new URLSearchParams();
    if (normalizedPrefix) params.set('prefix', normalizedPrefix);
    if (nextCursor) params.set('cursor', nextCursor);

    try {
      const response = await fetch(`/api/r2/assets?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());

      const data = (await response.json()) as R2AssetResponse;
      const files = data.files || data.images || [];
      setPrefix(data.prefix);
      setCursor(data.cursor);
      setState(current => {
        if (append && current.kind === 'ready') {
          return {
            kind: 'ready',
            data: {
              ...data,
              folders: current.data.folders,
              files: [...current.data.files, ...files],
            },
          };
        }

        return { kind: 'ready', data: { ...data, files } };
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : '无法加载图片池。',
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) void loadAssets(prefix || '');
  }, [isOpen, loadAssets]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const dialog = rootRef.current;
    if (dialog && !dialog.open) {
      try {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      } catch {
        dialog.setAttribute('open', '');
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (dialog?.open) dialog.close();
    };
  }, [isOpen, onClose]);

  const folders = state.kind === 'ready' ? state.data.folders : [];
  const files = state.kind === 'ready' ? state.data.files.filter(file => (isDocumentPicker ? file.isDocument : file.isImage)) : [];
  const hasMore = state.kind === 'ready' && state.data.truncated && cursor;
  const parentPrefix = useMemo(() => getParentPrefix(prefix), [prefix]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(prefix), [prefix]);

  const openFolder = (nextPrefix: string) => {
    setCursor(undefined);
    void loadAssets(nextPrefix);
  };

  const handleCopy = async (event: MouseEvent, url: string) => {
    event.stopPropagation();
    await copyText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(current => (current === url ? '' : current)), 1600);
  };

  const handleCopyFromKeyboard = async (url: string) => {
    await copyText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(current => (current === url ? '' : current)), 1600);
  };

  const handleKeyActivate = (event: ReactKeyboardEvent, action: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    action();
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={rootRef}
      className="r2-picker"
      aria-label={title}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="r2-picker__panel">
        <div className="r2-picker__head">
          <div>
            <strong>{title}</strong>
            <span>点击缩略图即可填入当前字段，不会单独保存或发布。</span>
          </div>
          <span className="r2-picker__control" role="button" tabIndex={0} onClick={onClose} onKeyDown={event => handleKeyActivate(event, onClose)}>
            关闭
          </span>
        </div>

        <div className="r2-picker__pathbar">
          <div className="r2-picker__path">
            <span className="r2-picker__control" role="button" tabIndex={0} onClick={() => openFolder('')} onKeyDown={event => handleKeyActivate(event, () => openFolder(''))} title="Bucket root">
              Bucket root
            </span>
            {breadcrumbs.map(crumb => (
              <span
                key={crumb.prefix}
                className="r2-picker__control"
                role="button"
                tabIndex={0}
                onClick={() => openFolder(crumb.prefix)}
                onKeyDown={event => handleKeyActivate(event, () => openFolder(crumb.prefix))}
                title={crumb.prefix}
              >
                {crumb.name}
              </span>
            ))}
          </div>
          {prefix ? (
            <span className="r2-picker__control" role="button" tabIndex={0} onClick={() => openFolder(parentPrefix)} onKeyDown={event => handleKeyActivate(event, () => openFolder(parentPrefix))}>
              上一级
            </span>
          ) : null}
        </div>

        {state.kind === 'loading' ? <div className="r2-picker__notice">正在加载图片...</div> : null}
        {state.kind === 'error' ? <div className="r2-picker__notice r2-picker__notice--error">{state.message}</div> : null}

        {state.kind === 'ready' ? (
          <>
            <div className="r2-picker__grid" aria-label="R2 图片文件夹和图片">
              {folders.map(folder => (
                <span
                  key={folder.prefix}
                  className="r2-picker__tile r2-picker__tile--folder"
                  role="button"
                  tabIndex={0}
                  onClick={() => openFolder(folder.prefix)}
                  onKeyDown={event => handleKeyActivate(event, () => openFolder(folder.prefix))}
                >
                  <span className="r2-picker__folder-icon" aria-hidden="true" />
                  <span className="r2-picker__tile-name" title={folder.prefix}>
                    {folder.name}
                  </span>
                  <span className="r2-picker__tile-meta">文件夹</span>
                </span>
              ))}

              {files.map(file => (
                <span
                  key={file.key}
                  className="r2-picker__tile r2-picker__tile--file"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(file.url)}
                  onKeyDown={event => handleKeyActivate(event, () => onSelect(file.url))}
                >
                  {isDocumentPicker ? (
                    <span className="r2-picker__pdf-icon" aria-hidden="true">PDF</span>
                  ) : (
                    <span className="r2-picker__thumb">
                      <img src={file.url} alt="" loading="lazy" />
                    </span>
                  )}
                  <span className="r2-picker__tile-name" title={file.name}>
                    {file.name}
                  </span>
                  <span className="r2-picker__tile-meta">{formatBytes(file.size)}</span>
                  <span className="r2-picker__tile-actions">
                    <span>选用</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={event => handleCopy(event, file.url)}
                      onKeyDown={event => {
                        event.stopPropagation();
                        handleKeyActivate(event, () => void handleCopyFromKeyboard(file.url));
                      }}
                    >
                      {copiedUrl === file.url ? '已复制' : '复制链接'}
                    </span>
                  </span>
                </span>
              ))}
            </div>

            {!folders.length && !files.length ? <div className="r2-picker__empty">当前文件夹没有可选图片。</div> : null}

            {hasMore ? (
              <span className="r2-picker__control r2-picker__more" role="button" tabIndex={0} onClick={() => loadAssets(prefix, cursor, true)} onKeyDown={event => handleKeyActivate(event, () => void loadAssets(prefix, cursor, true))}>
                加载更多
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <style>{`
        .r2-picker {
          --r2-bg: #ffffff;
          --r2-panel: #ffffff;
          --r2-muted-bg: #f6f7f9;
          --r2-hover: #f8fafc;
          --r2-thumb: #f2f4f7;
          --r2-border: #d9dee7;
          --r2-border-soft: #e1e4e8;
          --r2-text: #172033;
          --r2-muted: #667085;
          align-items: center;
          background: rgba(15, 23, 42, 0.64);
          border: 0;
          box-sizing: border-box;
          color: var(--r2-text);
          display: flex;
          height: 100vh;
          inset: 0;
          justify-content: center;
          margin: 0;
          max-height: none;
          max-width: none;
          overflow: hidden;
          padding: 22px;
          position: fixed;
          width: 100vw;
          z-index: 10000;
        }

        .r2-picker::backdrop {
          background: transparent;
        }

        .r2-picker__control {
          border: 1px solid var(--r2-border);
          border-radius: 6px;
          background: var(--r2-panel);
          color: var(--r2-text);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font: inherit;
          min-height: 34px;
          padding: 6px 10px;
          user-select: none;
        }

        .r2-picker__control:hover {
          border-color: #0e7490;
          color: #155e75;
        }

        .r2-picker__panel {
          background: var(--r2-bg);
          border: 1px solid var(--r2-border);
          border-radius: 10px;
          box-shadow: 0 26px 80px rgba(15, 23, 42, 0.38);
          display: grid;
          gap: 10px;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          height: min(820px, calc(100vh - 32px));
          max-height: calc(100vh - 32px);
          max-width: min(1280px, calc(100vw - 32px));
          overflow: hidden;
          padding: 12px;
          width: min(1280px, calc(100vw - 32px));
        }

        .r2-picker__head,
        .r2-picker__pathbar {
          align-items: center;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .r2-picker__head {
          border-bottom: 1px solid var(--r2-border-soft);
          padding: 2px 2px 12px;
        }

        .r2-picker__head div {
          display: grid;
          gap: 3px;
        }

        .r2-picker__head strong {
          font-size: 16px;
        }

        .r2-picker__head span,
        .r2-picker__tile-meta,
        .r2-picker__notice,
        .r2-picker__empty {
          color: var(--r2-muted);
          font-size: 12px;
        }

        .r2-picker__pathbar {
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 8px;
          padding: 8px;
        }

        .r2-picker__path {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }

        .r2-picker__path .r2-picker__control {
          color: var(--r2-muted);
          font-size: 12px;
          max-width: 210px;
          min-height: 28px;
          overflow: hidden;
          padding: 4px 8px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .r2-picker__path .r2-picker__control::before {
          color: #94a3b8;
          content: '/';
          margin-right: 6px;
        }

        .r2-picker__path .r2-picker__control:first-child::before {
          content: '';
          margin: 0;
        }

        .r2-picker__notice,
        .r2-picker__empty {
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 8px;
          padding: 12px 14px;
        }

        .r2-picker__notice--error {
          background: color-mix(in srgb, #ef4444 14%, var(--r2-bg));
          border-color: color-mix(in srgb, #ef4444 38%, var(--r2-border));
          color: color-mix(in srgb, #ef4444 82%, var(--r2-text));
        }

        .r2-picker__grid {
          align-content: start;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fill, minmax(142px, 142px));
          justify-content: start;
          max-height: none;
          min-height: 0;
          overflow: auto;
          padding: 2px;
        }

        .r2-picker__tile {
          align-content: start;
          align-items: center;
          display: grid;
          gap: 6px;
          grid-template-rows: 94px 18px 17px 32px;
          height: 202px;
          justify-items: center;
          min-width: 0;
          padding: 8px;
          text-align: center;
          width: 142px;
          cursor: pointer;
          user-select: none;
        }

        .r2-picker__tile:hover {
          background: var(--r2-hover);
        }

        .r2-picker__tile-name {
          display: block;
          font-size: 12px;
          font-weight: 650;
          height: 18px;
          line-height: 18px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .r2-picker__tile-meta {
          height: 17px;
          line-height: 1.2;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .r2-picker__thumb {
          align-items: center;
          aspect-ratio: 1;
          background: var(--r2-thumb);
          border: 1px solid var(--r2-border-soft);
          border-radius: 7px;
          display: flex;
          height: 94px;
          justify-content: center;
          overflow: hidden;
          width: 94px;
        }

        .r2-picker__thumb img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }
        .r2-picker__pdf-icon {
          align-items: center;
          background: #0f766e;
          border-radius: 6px;
          color: #fff;
          display: inline-flex;
          font-size: 13px;
          font-weight: 800;
          height: 94px;
          justify-content: center;
          width: 94px;
        }

        .r2-picker__folder-icon {
          background: linear-gradient(180deg, #fde68a, #facc15);
          border-radius: 6px;
          box-shadow: inset 0 -1px 0 rgba(120, 53, 15, 0.18);
          display: inline-block;
          height: 54px;
          margin-top: 28px;
          position: relative;
          width: 76px;
        }

        .r2-picker__folder-icon::before {
          background: #fef3c7;
          border-radius: 6px 6px 0 0;
          content: '';
          height: 16px;
          left: 7px;
          position: absolute;
          top: -10px;
          width: 35px;
        }

        .r2-picker__tile-actions {
          align-items: center;
          display: flex;
          gap: 6px;
          height: 32px;
          justify-content: center;
        }

        .r2-picker__tile-actions span {
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 999px;
          color: var(--r2-text);
          font-size: 11px;
          line-height: 1;
          padding: 4px 7px;
          white-space: nowrap;
        }

        .r2-picker__more {
          justify-self: start;
        }

        @media (max-width: 760px) {
          .r2-picker {
            padding: 10px;
          }

          .r2-picker__head,
          .r2-picker__pathbar {
            align-items: stretch;
            flex-direction: column;
          }

          .r2-picker__grid {
            grid-template-columns: repeat(auto-fill, minmax(132px, 132px));
            max-height: 66vh;
          }

          .r2-picker__tile {
            width: 132px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .r2-picker {
            --r2-bg: #242424;
            --r2-panel: #2a2a2a;
            --r2-muted-bg: #2f2f2f;
            --r2-hover: #333333;
            --r2-thumb: #303030;
            --r2-border: #464646;
            --r2-border-soft: #3a3a3a;
            --r2-text: #f2f2f2;
            --r2-muted: #b8b8b8;
          }
        }
      `}</style>
    </dialog>
  );
}
