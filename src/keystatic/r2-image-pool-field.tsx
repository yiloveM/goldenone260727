import { type ChangeEvent, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type MutationState = {
  kind: 'idle' | 'error';
  message: string;
};

const normalizeAdminPrefix = (value: string) => {
  const cleaned = value.trim().replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!cleaned) return '';
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
};

const normalizeFolderPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map(part =>
      part
        .trim()
        .replace(/[<>:"|?*\u0000-\u001f]+/g, '-')
        .replace(/^\.+$/, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('/');

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

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
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

const isAcceptedAsset = (file: File) =>
  file.type.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);

const getAcceptedFiles = (files: FileList | File[]) => Array.from(files).filter(isAcceptedAsset);

function R2ImagePoolInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prefix, setPrefix] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [selected, setSelected] = useState<R2File | null>(null);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const [cutKeys, setCutKeys] = useState<string[]>([]);
  const [mutation, setMutation] = useState<MutationState>({ kind: 'idle', message: '' });

  useSyncedSurfaceTheme(rootRef, 'r2');

  const loadAssets = useCallback(async (nextPrefix: string, nextCursor?: string, append = false) => {
    const normalizedPrefix = normalizeAdminPrefix(nextPrefix);
    setState(current => (append && current.kind === 'ready' ? current : { kind: 'loading' }));

    const params = new URLSearchParams();
    if (normalizedPrefix) params.set('prefix', normalizedPrefix);
    if (nextCursor) params.set('cursor', nextCursor);

    try {
      const response = await fetch(`/api/r2/assets?${params.toString()}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

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
        message: error instanceof Error ? error.message : '无法加载 R2 图片池。',
      });
    }
  }, []);

  useEffect(() => {
    void loadAssets('');
  }, [loadAssets]);

  const folders = state.kind === 'ready' ? state.data.folders : [];
  const files = state.kind === 'ready' ? state.data.files : [];
  const hasMore = state.kind === 'ready' && state.data.truncated && cursor;
  const parentPrefix = useMemo(() => getParentPrefix(prefix), [prefix]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(prefix), [prefix]);
  const currentLabel = prefix || 'Bucket root';

  const openFolder = (nextPrefix: string) => {
    setSelected(null);
    setCheckedKeys(new Set());
    setCursor(undefined);
    void loadAssets(nextPrefix);
  };

  const handleCopy = async (url: string) => {
    await copyText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(current => (current === url ? '' : current)), 1800);
  };

  const createFolder = async () => {
    const rawName = window.prompt('新建文件夹名称');
    if (rawName === null) return;

    const folderPath = normalizeFolderPath(rawName);
    if (!folderPath) {
      setMutation({ kind: 'error', message: '请输入有效的文件夹名称。' });
      return;
    }

    const folderPrefix = normalizeAdminPrefix(`${prefix}${folderPath}`);
    setMutation({ kind: 'idle', message: '' });

    try {
      const response = await fetch('/api/r2/assets', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prefix: folderPrefix }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await loadAssets(prefix);
    } catch (error) {
      setMutation({
        kind: 'error',
        message: error instanceof Error ? error.message : '创建文件夹失败。',
      });
    }
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    const acceptedFiles = getAcceptedFiles(fileList);

    if (!acceptedFiles.length) {
      setMutation({ kind: 'error', message: '请选择支持的图片文件。' });
      return;
    }

    const formData = new FormData();
    formData.set('prefix', prefix);
    acceptedFiles.forEach(file => formData.append('files', file));

    setMutation({ kind: 'idle', message: '' });

    try {
      const response = await fetch('/api/r2/assets', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadAssets(prefix);
    } catch (error) {
      setMutation({
        kind: 'error',
        message: error instanceof Error ? error.message : '上传失败。',
      });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) {
      void uploadFiles(event.currentTarget.files);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) {
      void uploadFiles(event.dataTransfer.files);
    }
  };

  const getDraggedKeys = (dataTransfer: DataTransfer) => {
    const raw = dataTransfer.getData('application/x-r2-keys');
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string' && key.length > 0) : [];
    } catch {
      return [];
    }
  };

  const moveFiles = async (keys: string[], targetPrefix: string) => {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    if (!uniqueKeys.length) return;

    setMutation({ kind: 'idle', message: '' });

    try {
      const response = await fetch('/api/r2/assets', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ keys: uniqueKeys, targetPrefix }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSelected(current => (current && uniqueKeys.includes(current.key) ? null : current));
      setCheckedKeys(current => {
        const next = new Set(current);
        uniqueKeys.forEach(key => next.delete(key));
        return next;
      });
      setCutKeys(current => current.filter(key => !uniqueKeys.includes(key)));
      await loadAssets(prefix);
    } catch (error) {
      setMutation({
        kind: 'error',
        message: error instanceof Error ? error.message : '移动失败。',
      });
    }
  };

  const toggleChecked = (key: string, checked: boolean) => {
    setCheckedKeys(current => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const cutSelected = () => {
    const keys = [...checkedKeys];
    if (!keys.length) return;
    setCutKeys(keys);
    setMutation({ kind: 'idle', message: '' });
  };

  const pasteCutFiles = () => {
    if (!cutKeys.length) return;
    void moveFiles(cutKeys, prefix);
  };

  const handleFileDragStart = (event: DragEvent<HTMLElement>, file: R2File) => {
    const keys = checkedKeys.has(file.key) ? [...checkedKeys] : [file.key];
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-r2-keys', JSON.stringify(keys));
  };

  const handleFolderDrop = (event: DragEvent<HTMLButtonElement>, folder: R2Folder) => {
    const keys = getDraggedKeys(event.dataTransfer);
    if (!keys.length) return;

    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void moveFiles(keys, folder.prefix);
  };

  const deleteFile = async (file: R2File) => {
    if (!window.confirm(`确定删除 ${file.key} 吗？`)) {
      return;
    }

    setMutation({ kind: 'idle', message: '' });

    try {
      const response = await fetch('/api/r2/assets', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: file.key }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSelected(current => (current?.key === file.key ? null : current));
      await loadAssets(prefix);
    } catch (error) {
      setMutation({
        kind: 'error',
        message: error instanceof Error ? error.message : '删除失败。',
      });
    }
  };

  return (
    <div ref={rootRef} className="r2-pool">
      {mutation.kind === 'error' ? <div className="r2-pool__notice r2-pool__notice--error">{mutation.message}</div> : null}
      {state.kind === 'loading' ? <div className="r2-pool__notice">正在加载 R2 对象...</div> : null}
      {state.kind === 'error' ? <div className="r2-pool__notice r2-pool__notice--error">{state.message}</div> : null}

      {state.kind === 'ready' ? (
        <div
          className={`r2-pool__browser${isDragging ? ' is-dragging' : ''}`}
          onDragOver={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="r2-pool__browser-head">
            <div className="r2-pool__path-group">
              <div className="r2-pool__path">
                <button type="button" onClick={() => openFolder('')} title="Bucket root">
                  Bucket root
                </button>
                {breadcrumbs.map(crumb => (
                  <button key={crumb.prefix} type="button" onClick={() => openFolder(crumb.prefix)} title={crumb.prefix}>
                    {crumb.name}
                  </button>
                ))}
              </div>
              <span>
                当前路径：{currentLabel} · {folders.length} 个文件夹 / {files.length} 个文件
              </span>
            </div>

            <div className="r2-pool__tools">
              {prefix ? (
                <button type="button" onClick={() => openFolder(parentPrefix)}>
                  上一级
                </button>
              ) : null}
              <button type="button" onClick={createFolder}>
                新建文件夹
              </button>
              <button type="button" onClick={cutSelected} disabled={!checkedKeys.size}>
                剪切
              </button>
              <button type="button" onClick={pasteCutFiles} disabled={!cutKeys.length}>
                粘贴
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"
                multiple
                onChange={handleFileChange}
              />
              <button type="button" className="r2-pool__primary" onClick={() => fileInputRef.current?.click()}>
                上传图片
              </button>
            </div>
          </div>

          <div className="r2-pool__explorer" aria-label="R2 文件夹和文件">
            {folders.map(folder => (
              <button
                key={folder.prefix}
                type="button"
                className="r2-pool__tile r2-pool__tile--folder"
                onClick={() => openFolder(folder.prefix)}
                onDragOver={event => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={event => handleFolderDrop(event, folder)}
              >
                <span className="r2-pool__folder-icon" aria-hidden="true" />
                <span className="r2-pool__tile-name" title={folder.prefix}>
                  {folder.name}
                </span>
                <span className="r2-pool__tile-meta">文件夹</span>
              </button>
            ))}

            {files.map(file => (
              <article
                key={file.key}
                className={`r2-pool__tile r2-pool__tile--file${cutKeys.includes(file.key) ? ' is-cut' : ''}`}
                draggable
                onDragStart={event => handleFileDragStart(event, file)}
              >
                <label className="r2-pool__tile-check" aria-label={`选择 ${file.name}`}>
                  <input
                    type="checkbox"
                    checked={checkedKeys.has(file.key)}
                    onChange={event => toggleChecked(file.key, event.currentTarget.checked)}
                  />
                </label>
                {file.isImage ? (
                  <button type="button" className="r2-pool__thumb" onClick={() => setSelected(file)}>
                    <img src={file.url} alt={file.name} loading="lazy" />
                  </button>
                ) : (
                  <span className="r2-pool__file-icon" aria-hidden="true" />
                )}
                <span className="r2-pool__tile-name" title={file.key}>
                  {file.name}
                </span>
                <span className="r2-pool__tile-meta">
                  {formatBytes(file.size)} / {formatDate(file.uploaded)}
                </span>
                <span className="r2-pool__tile-actions">
                  <button type="button" onClick={() => handleCopy(file.url)}>
                    {copiedUrl === file.url ? '已复制' : '复制链接'}
                  </button>
                  <button type="button" className="r2-pool__danger" onClick={() => deleteFile(file)}>
                    删除
                  </button>
                </span>
              </article>
            ))}
          </div>

          {!folders.length && !files.length ? (
            <div className="r2-pool__empty">当前文件夹没有文件。可以直接拖拽图片到这里，或点击“上传图片”。</div>
          ) : null}

          {hasMore ? (
            <button type="button" className="r2-pool__more" onClick={() => loadAssets(prefix, cursor, true)}>
              加载更多
            </button>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <div className="r2-pool__modal" role="dialog" aria-modal="true" aria-label={selected.name}>
          <div className="r2-pool__dialog">
            <div className="r2-pool__dialog-head">
              <div>
                <strong>{selected.name}</strong>
                <span>{selected.key}</span>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                关闭
              </button>
            </div>
            <img src={selected.url} alt={selected.name} />
            <div className="r2-pool__dialog-actions">
              <input value={selected.url} readOnly />
              <button type="button" onClick={() => handleCopy(selected.url)}>
                {copiedUrl === selected.url ? '已复制' : '复制链接'}
              </button>
              <button type="button" className="r2-pool__danger" onClick={() => deleteFile(selected)}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .r2-pool {
          --r2-bg: #ffffff;
          --r2-panel: #ffffff;
          --r2-muted-bg: #f6f7f9;
          --r2-hover: #f8fafc;
          --r2-thumb: #f2f4f7;
          --r2-border: #d9dee7;
          --r2-border-soft: #e1e4e8;
          --r2-text: #172033;
          --r2-muted: #667085;
          color: var(--r2-text);
          display: grid;
          gap: 10px;
          margin: 0;
          max-width: calc(100vw - 330px);
          width: calc(100vw - 330px);
        }

        .r2-pool button {
          border: 1px solid var(--r2-border);
          border-radius: 6px;
          background: var(--r2-panel);
          color: var(--r2-text);
          cursor: pointer;
          font: inherit;
          min-height: 34px;
          padding: 6px 10px;
        }

        .r2-pool button:hover {
          border-color: #0e7490;
          color: #155e75;
        }

        .r2-pool button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .r2-pool input {
          border: 1px solid var(--r2-border);
          border-radius: 6px;
          background: var(--r2-panel);
          color: var(--r2-text);
          font: inherit;
          min-height: 34px;
          min-width: 0;
          padding: 6px 10px;
        }

        .r2-pool__notice {
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 8px;
          color: var(--r2-muted);
          padding: 12px 14px;
        }

        .r2-pool__notice--error {
          background: color-mix(in srgb, #ef4444 14%, var(--r2-bg));
          border-color: color-mix(in srgb, #ef4444 38%, var(--r2-border));
          color: color-mix(in srgb, #ef4444 82%, var(--r2-text));
        }

        .r2-pool__browser {
          background: var(--r2-bg);
          border: 1px solid var(--r2-border);
          border-radius: 8px;
          display: grid;
          gap: 10px;
          min-height: calc(100vh - 190px);
          padding: 10px;
          width: 100%;
        }

        .r2-pool__browser.is-dragging {
          border-color: #0891b2;
          box-shadow: 0 0 0 4px rgba(8, 145, 178, 0.14);
        }

        .r2-pool__browser-head {
          align-items: center;
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 7px;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          padding: 8px;
        }

        .r2-pool__path-group {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .r2-pool__path {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }

        .r2-pool__path button {
          color: var(--r2-muted);
          font-size: 12px;
          max-width: 220px;
          min-height: 28px;
          overflow: hidden;
          padding: 4px 8px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .r2-pool__path button::before {
          color: #94a3b8;
          content: '/';
          margin-right: 6px;
        }

        .r2-pool__path button:first-child::before {
          content: '';
          margin: 0;
        }

        .r2-pool__path-group span {
          color: var(--r2-muted);
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .r2-pool__tools,
        .r2-pool__tile-actions,
        .r2-pool__dialog-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .r2-pool__tools {
          flex: 0 0 auto;
          justify-content: flex-end;
        }

        .r2-pool__tools input {
          display: none;
        }

        .r2-pool .r2-pool__primary {
          background: #155e75;
          border-color: #155e75;
          color: #fff;
        }

        .r2-pool .r2-pool__primary:hover {
          background: #164e63;
          border-color: #164e63;
          color: #fff;
        }

        .r2-pool__explorer {
          align-content: start;
          align-items: start;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fill, minmax(150px, 150px));
          justify-content: start;
          min-height: calc(100vh - 286px);
        }

        .r2-pool__tile {
          align-content: start;
          align-items: center;
          background: var(--r2-panel);
          border: 1px solid transparent;
          border-radius: 8px;
          color: var(--r2-text);
          display: grid;
          gap: 6px;
          grid-template-rows: 96px 18px 18px 32px;
          height: 202px;
          justify-items: center;
          min-width: 0;
          padding: 8px;
          position: relative;
          text-align: center;
          width: 150px;
        }

        button.r2-pool__tile {
          width: 150px;
        }

        .r2-pool__tile:hover {
          background: var(--r2-hover);
          border-color: var(--r2-border);
        }

        .r2-pool__tile.is-cut {
          opacity: 0.48;
        }

        .r2-pool__tile-name {
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

        .r2-pool__tile-meta {
          color: var(--r2-muted);
          display: block;
          font-size: 10px;
          height: 18px;
          line-height: 1.2;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .r2-pool__tile-actions {
          align-items: center;
          height: 32px;
          justify-content: center;
        }

        .r2-pool__tile-actions button {
          font-size: 11px;
          line-height: 1;
          min-height: 28px;
          padding: 4px 7px;
          white-space: nowrap;
        }

        .r2-pool__thumb {
          align-items: center;
          aspect-ratio: 1;
          background: var(--r2-thumb);
          border: 1px solid var(--r2-border-soft);
          border-radius: 6px;
          display: flex;
          height: 96px;
          justify-content: center;
          min-height: 96px;
          overflow: hidden;
          padding: 0;
          width: 96px;
        }

        .r2-pool__thumb img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .r2-pool__folder-icon,
        .r2-pool__file-icon {
          display: inline-block;
          position: relative;
        }

        .r2-pool__folder-icon {
          background: linear-gradient(180deg, #fde68a, #facc15);
          border-radius: 6px;
          box-shadow: inset 0 -1px 0 rgba(120, 53, 15, 0.18);
          height: 54px;
          margin-top: 28px;
          width: 76px;
        }

        .r2-pool__folder-icon::before {
          background: #fef3c7;
          border-radius: 6px 6px 0 0;
          content: '';
          height: 16px;
          left: 7px;
          position: absolute;
          top: -10px;
          width: 35px;
        }

        .r2-pool__file-icon {
          background: var(--r2-thumb);
          border-radius: 6px;
          height: 76px;
          margin-top: 10px;
          width: 58px;
        }

        .r2-pool__tile-check {
          align-items: center;
          background: color-mix(in srgb, var(--r2-panel) 88%, transparent);
          border: 1px solid var(--r2-border);
          border-radius: 5px;
          display: flex;
          height: 24px;
          justify-content: center;
          left: 7px;
          padding: 0;
          position: absolute;
          top: 7px;
          width: 24px;
          z-index: 1;
        }

        .r2-pool__tile-check input {
          height: 14px;
          min-height: 14px;
          padding: 0;
          width: 14px;
        }

        .r2-pool__file-icon::after {
          border-color: #cbd5e1 #fff #fff #cbd5e1;
          border-style: solid;
          border-width: 9px;
          content: '';
          position: absolute;
          right: 0;
          top: 0;
        }

        .r2-pool .r2-pool__danger {
          border-color: #fecaca;
          color: #b91c1c;
        }

        .r2-pool .r2-pool__danger:hover {
          background: #fef2f2;
          border-color: #ef4444;
          color: #991b1b;
        }

        .r2-pool__empty {
          align-self: start;
          background: var(--r2-muted-bg);
          border: 1px dashed var(--r2-border);
          border-radius: 8px;
          color: var(--r2-muted);
          padding: 18px;
          text-align: center;
        }

        .r2-pool__more {
          justify-self: start;
        }

        .r2-pool__modal {
          align-items: center;
          background: rgba(15, 23, 42, 0.72);
          display: flex;
          inset: 0;
          justify-content: center;
          padding: 28px;
          position: fixed;
          z-index: 9999;
        }

        .r2-pool__dialog {
          background: var(--r2-panel);
          border-radius: 8px;
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.36);
          display: grid;
          gap: 14px;
          max-height: 92vh;
          max-width: 1100px;
          padding: 16px;
          width: min(100%, 1100px);
        }

        .r2-pool__dialog-head {
          align-items: start;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .r2-pool__dialog-head div {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .r2-pool__dialog-head strong,
        .r2-pool__dialog-head span {
          overflow-wrap: anywhere;
        }

        .r2-pool__dialog-head span {
          color: var(--r2-muted);
          font-size: 12px;
        }

        .r2-pool__dialog > img {
          background: var(--r2-thumb);
          border-radius: 8px;
          display: block;
          max-height: 68vh;
          object-fit: contain;
          width: 100%;
        }

        .r2-pool__dialog-actions input {
          flex: 1 1 360px;
        }

        @media (max-width: 760px) {
          .r2-pool {
            max-width: 100%;
            width: 100%;
          }

          .r2-pool__browser-head,
          .r2-pool__dialog-head {
            align-items: stretch;
            flex-direction: column;
          }

          .r2-pool__tools {
            justify-content: flex-start;
          }

          .r2-pool__modal {
            padding: 12px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .r2-pool {
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

        [data-theme='dark'] .r2-pool,
        [data-color-scheme='dark'] .r2-pool,
        [data-mode='dark'] .r2-pool,
        .dark .r2-pool {
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

        [data-theme='light'] .r2-pool,
        [data-color-scheme='light'] .r2-pool,
        [data-mode='light'] .r2-pool,
        .light .r2-pool {
          --r2-bg: #ffffff;
          --r2-panel: #ffffff;
          --r2-muted-bg: #f6f7f9;
          --r2-hover: #f8fafc;
          --r2-thumb: #f2f4f7;
          --r2-border: #d9dee7;
          --r2-border-soft: #e1e4e8;
          --r2-text: #172033;
          --r2-muted: #667085;
        }
      `}</style>
    </div>
  );
}

export const r2ImagePoolField = ({ label = '图片池' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: R2ImagePoolInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
