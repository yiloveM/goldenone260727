import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type ProductSummary = {
  id: string;
  slug: string;
  title: string;
  series: string;
  category: string;
  image: string;
  sortOrder: number;
  published: boolean;
};

type ProductManagerResponse = {
  products: ProductSummary[];
  categories: string[];
};

type LoadState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; data: ProductManagerResponse }
  | { kind: 'error'; message: string };

type SaveState = {
  kind: 'idle' | 'error';
  message: string;
};

const fallbackImage = 'https://cdn.example.com/logo1.svg';
const pageSize = 12;

const getProductEditUrl = (slug: string) => {
  if (typeof window === 'undefined') return `/keystatic/collection/products/item/${slug}`;

  const match = window.location.pathname.match(/^(.*?\/keystatic(?:\/branch\/[^/]+)?)/);
  const basePath = match?.[1] || '/keystatic';
  return `${basePath}/collection/products/item/${encodeURIComponent(slug)}`;
};

function ProductManagerInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle', message: '' });

  useSyncedSurfaceTheme(rootRef, 'pm');

  const loadProducts = useCallback(async () => {
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/products/manager');
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as ProductManagerResponse;
      setProducts(data.products);
      setState({ kind: 'ready', data });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : '无法加载产品列表。',
      });
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [category, query]);

  const categories = state.kind === 'ready' ? state.data.categories : [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(
    () =>
      products.filter(product => {
        const categoryMatches = !category || product.category === category;
        if (!categoryMatches) return false;
        if (!normalizedQuery) return true;
        return [product.title, product.series, product.category].some(value => value.toLowerCase().includes(normalizedQuery));
      }),
    [category, normalizedQuery, products]
  );
  const sortedProducts = useMemo(
    () => [...filteredProducts].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    [filteredProducts]
  );
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageProducts = sortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const onlineCount = products.filter(product => product.published).length;
  const offlineCount = Math.max(0, products.length - onlineCount);

  const savePublication = useCallback(async (productId: string, published: boolean) => {
    try {
      const response = await fetch('/api/products/manager', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          publications: [{ id: productId, published }],
        }),
      });

      if (!response.ok) {
        throw new Error('publication save failed');
      }
    } catch {
      setProducts(current => current.map(product => (product.id === productId ? { ...product, published: !published } : product)));
      setSaveState({ kind: 'error', message: '产品状态保存失败，请稍后重试。' });
    }
  }, []);

  const updatePublication = (productId: string, published: boolean) => {
    setProducts(current => current.map(product => (product.id === productId ? { ...product, published } : product)));
    setSaveState({ kind: 'idle', message: '' });
    saveQueueRef.current = saveQueueRef.current.then(() => savePublication(productId, published));
    void saveQueueRef.current;
  };

  const deleteProduct = async (product: ProductSummary) => {
    const confirmed = window.confirm(`确定删除产品“${product.title}”吗？此操作会删除该产品内容。`);
    if (!confirmed) return;

    setSaveState({ kind: 'idle', message: '' });

    try {
      const response = await fetch('/api/products/manager', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id: product.id }),
      });

      if (!response.ok) {
        throw new Error('delete failed');
      }

      setProducts(current => current.filter(item => item.id !== product.id));
    } catch {
      setSaveState({ kind: 'error', message: '删除产品失败，请稍后重试。' });
    }
  };

  return (
    <div ref={rootRef} className="product-manager">
      <header className="product-manager__header">
        <div>
          <span className="product-manager__eyebrow">产品管理</span>
          <h2>产品内容工作台</h2>
          <p>按分类和关键词快速找到产品；点击产品图或产品名称进入编辑，右侧只处理预览、上线状态和删除。</p>
        </div>
        <div className="product-manager__summary" aria-label="产品状态概览">
          <span><strong>{products.length}</strong><small>全部产品</small></span>
          <span><strong>{onlineCount}</strong><small>已上线</small></span>
          <span><strong>{offlineCount}</strong><small>已下线</small></span>
        </div>
      </header>

      <div className="product-manager__toolbar">
        <label>
          <span>产品分类</span>
          <select value={category} onChange={event => setCategory(event.currentTarget.value)}>
            <option value="">全部分类</option>
            {categories.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>产品名称关键词</span>
          <input
            value={query}
            type="search"
            placeholder="输入产品名称或系列"
            onChange={event => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>

      {state.kind === 'loading' ? <div className="product-manager__notice">正在加载产品...</div> : null}
      {state.kind === 'error' ? <div className="product-manager__notice product-manager__notice--error">{state.message}</div> : null}
      {saveState.kind !== 'idle' ? (
        <div className={`product-manager__notice product-manager__notice--${saveState.kind}`}>{saveState.message}</div>
      ) : null}

      <div className="product-manager__meta">
        <strong>{category || '全部分类'}</strong>
        <span>
          当前筛选 {sortedProducts.length} 个产品 / 第 {currentPage} 页，共 {totalPages} 页
        </span>
      </div>

      <section className="product-manager__table" aria-label="产品管理列表">
        <div className="product-manager__table-head">
          <span>产品图</span>
          <span>产品名称</span>
          <span>产品分类</span>
          <span>操作</span>
        </div>
        {pageProducts.map(product => {
          const editUrl = getProductEditUrl(product.slug);

          return (
            <div key={product.id} className="product-manager__row">
              <a className="product-manager__image-link" href={editUrl} aria-label={`编辑 ${product.title}`}>
                <img src={product.image || fallbackImage} alt="" loading="lazy" />
              </a>
              <div className="product-manager__row-main">
                <a className="product-manager__edit-link" href={editUrl}>
                  {product.title}
                </a>
                <span>{product.series || '-'}</span>
              </div>
              <span className="product-manager__category">{product.category}</span>
              <span className="product-manager__actions">
                <label className={`product-manager__publish-check product-manager__publish-check--${product.published ? 'on' : 'off'}`}>
                  <input
                    type="checkbox"
                    checked={product.published}
                    onChange={event => updatePublication(product.id, event.currentTarget.checked)}
                  />
                  <span>{product.published ? '已上线' : '已下线'}</span>
                </label>
                <a href={`/products/${product.slug}/`} target="_blank" rel="noreferrer">
                  前端查看
                </a>
                <button type="button" className="product-manager__danger" onClick={() => deleteProduct(product)}>
                  删除
                </button>
              </span>
            </div>
          );
        })}
      </section>

      <div className="product-manager__pager">
        <button type="button" onClick={() => setPage(1)} disabled={currentPage <= 1}>
          首页
        </button>
        <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
          上一页
        </button>
        <span>
          {currentPage} / {totalPages}
        </span>
        <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
          下一页
        </button>
        <button type="button" onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages}>
          末页
        </button>
      </div>

      {!pageProducts.length && state.kind === 'ready' ? <div className="product-manager__notice">没有匹配的产品。</div> : null}

      <style>{`
        .product-manager {
          --pm-table-columns: 104px minmax(320px, 1fr) minmax(180px, 0.42fr) minmax(252px, max-content);
          --pm-bg: #ffffff;
          --pm-panel: #ffffff;
          --pm-muted-bg: #f6f7f9;
          --pm-hover: #f8fafc;
          --pm-thumb: #f2f4f7;
          --pm-border: #d1d7e0;
          --pm-border-soft: #e1e4e8;
          --pm-text: #172033;
          --pm-muted: #667085;
          color: var(--pm-text);
          display: grid;
          gap: 14px;
          max-width: calc(100vw - 330px);
          width: calc(100vw - 330px);
        }

        .product-manager__header {
          align-items: end;
          background:
            radial-gradient(circle at 90% 8%, rgba(34, 211, 238, 0.13), transparent 34%),
            linear-gradient(135deg, color-mix(in srgb, var(--pm-panel) 88%, #e0f7fb), var(--pm-muted-bg));
          border: 1px solid var(--pm-border-soft);
          border-radius: 10px;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 18px;
        }

        .product-manager__eyebrow {
          color: #0e7490;
          display: block;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.13em;
          margin-bottom: 7px;
          text-transform: uppercase;
        }

        .product-manager h2 {
          font-size: clamp(22px, 2vw, 30px);
          line-height: 1.12;
          margin: 0 0 8px;
        }

        .product-manager p {
          color: var(--pm-muted);
          line-height: 1.6;
          margin: 0;
          max-width: 760px;
        }

        .product-manager__summary {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(94px, 1fr));
        }

        .product-manager__summary span {
          background: color-mix(in srgb, var(--pm-panel) 76%, transparent);
          border: 1px solid var(--pm-border-soft);
          border-radius: 8px;
          display: grid;
          gap: 3px;
          padding: 10px 12px;
        }

        .product-manager__summary strong {
          font-size: 21px;
          line-height: 1;
        }

        .product-manager__summary small {
          color: var(--pm-muted);
          font-size: 11px;
        }

        .product-manager button,
        .product-manager input,
        .product-manager select,
        .product-manager a {
          background: var(--pm-panel);
          border: 1px solid var(--pm-border);
          border-radius: 6px;
          color: var(--pm-text);
          font: inherit;
          min-height: 36px;
          padding: 7px 10px;
        }

        .product-manager button,
        .product-manager a {
          align-items: center;
          cursor: pointer;
          display: inline-flex;
          justify-content: center;
          text-decoration: none;
        }

        .product-manager button:hover,
        .product-manager a:hover {
          border-color: #476582;
        }

        .product-manager button:disabled {
          background: var(--pm-muted-bg);
          color: var(--pm-muted);
          cursor: not-allowed;
        }

        .product-manager__toolbar {
          align-items: end;
          background: color-mix(in srgb, var(--pm-muted-bg) 82%, var(--pm-panel));
          border: 1px solid var(--pm-border-soft);
          border-radius: 8px;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(220px, 0.7fr) minmax(300px, 1fr);
          padding: 12px;
        }

        .product-manager label {
          display: grid;
          gap: 5px;
        }

        .product-manager label span,
        .product-manager__meta span {
          color: var(--pm-muted);
          font-size: 12px;
        }

        .product-manager__notice {
          background: var(--pm-muted-bg);
          border: 1px solid var(--pm-border-soft);
          border-radius: 8px;
          color: var(--pm-muted);
          padding: 12px;
        }

        .product-manager__notice--error {
          background: color-mix(in srgb, #ef4444 14%, var(--pm-bg));
          border-color: color-mix(in srgb, #ef4444 38%, var(--pm-border));
          color: color-mix(in srgb, #ef4444 82%, var(--pm-text));
        }

        .product-manager__meta {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          justify-content: space-between;
        }

        .product-manager__pager {
          align-items: center;
          background: var(--pm-muted-bg);
          border: 1px solid var(--pm-border-soft);
          border-radius: 8px;
          display: inline-flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          justify-self: center;
          padding: 5px;
          width: fit-content;
        }

        .product-manager__meta strong {
          background: var(--pm-muted-bg);
          border: 1px solid var(--pm-border-soft);
          border-radius: 999px;
          padding: 5px 10px;
        }

        .product-manager__table {
          background: var(--pm-bg);
          border: 1px solid var(--pm-border-soft);
          border-radius: 8px;
          display: grid;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
        }

        .product-manager__table-head,
        .product-manager__row {
          align-items: center;
          display: grid;
          gap: 12px;
          grid-template-columns: var(--pm-table-columns);
          padding: 10px 16px;
        }

        .product-manager__table-head {
          background: color-mix(in srgb, var(--pm-muted-bg) 88%, var(--pm-panel));
          border-bottom: 1px solid var(--pm-border-soft);
          color: var(--pm-muted);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .product-manager__table-head span {
          min-width: 0;
        }

        .product-manager__table-head span:nth-child(1),
        .product-manager__image-link {
          justify-self: center;
        }

        .product-manager__table-head span:nth-child(2),
        .product-manager__table-head span:nth-child(3) {
          justify-self: start;
        }

        .product-manager__table-head span:nth-child(4) {
          justify-self: end;
        }

        .product-manager__row {
          border-top: 1px solid var(--pm-border-soft);
          min-height: 106px;
        }

        .product-manager__table-head + .product-manager__row {
          border-top: 0;
        }

        .product-manager__row:hover {
          background: var(--pm-hover);
        }

        .product-manager__image-link {
          aspect-ratio: 1;
          background: var(--pm-thumb);
          border-color: var(--pm-border-soft);
          border-radius: 8px;
          display: block;
          height: 82px;
          overflow: hidden;
          padding: 0;
          width: 82px;
        }

        .product-manager__image-link img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .product-manager__row-main {
          align-self: stretch;
          display: grid;
          gap: 7px;
          justify-content: start;
          place-content: center start;
          min-width: 0;
        }

        .product-manager__edit-link {
          background: transparent;
          border: 0;
          border-radius: 0;
          display: inline;
          font-weight: 700;
          justify-content: start;
          line-height: 1.35;
          min-height: 0;
          overflow-wrap: anywhere;
          padding: 0;
          text-align: left;
        }

        .product-manager__edit-link:hover {
          color: #0e7490;
          text-decoration: underline;
        }

        .product-manager__row-main span,
        .product-manager__category {
          color: var(--pm-muted);
          font-size: 13px;
        }

        .product-manager__row-main span {
          background: color-mix(in srgb, var(--pm-muted-bg) 78%, var(--pm-panel));
          border: 1px solid var(--pm-border-soft);
          border-radius: 999px;
          display: inline-flex;
          line-height: 1.35;
          max-width: 100%;
          overflow-wrap: anywhere;
          padding: 4px 9px;
          width: fit-content;
        }

        .product-manager__category {
          background: color-mix(in srgb, var(--pm-muted-bg) 64%, var(--pm-panel));
          border: 1px solid var(--pm-border-soft);
          border-radius: 999px;
          justify-self: start;
          line-height: 1.35;
          max-width: 100%;
          overflow-wrap: anywhere;
          padding: 5px 10px;
        }

        .product-manager__actions {
          align-items: center;
          display: grid;
          grid-template-columns: 86px 78px 58px;
          gap: 8px;
          justify-content: end;
          justify-self: end;
          width: max-content;
        }

        .product-manager__actions a,
        .product-manager__actions button,
        .product-manager__publish-check {
          font-size: 12px;
          min-height: 32px;
          padding: 5px 8px;
          white-space: nowrap;
        }

        .product-manager__publish-check {
          align-items: center;
          background: var(--pm-panel);
          border: 1px solid var(--pm-border);
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          gap: 6px;
          justify-content: center;
        }

        .product-manager__publish-check input {
          accent-color: #0e7490;
          background: transparent;
          border: 0;
          border-radius: 3px;
          height: 14px;
          margin: 0;
          min-height: 0;
          padding: 0;
          width: 14px;
        }

        .product-manager__publish-check span {
          color: inherit;
          font-size: 12px;
        }

        .product-manager__publish-check--on {
          background: color-mix(in srgb, #0e7490 12%, var(--pm-panel));
          border-color: color-mix(in srgb, #0e7490 42%, var(--pm-border));
          color: #0f6674;
        }

        .product-manager__publish-check--off {
          background: color-mix(in srgb, var(--pm-muted-bg) 74%, var(--pm-panel));
          border-color: var(--pm-border-soft);
          color: var(--pm-muted);
        }

        .product-manager .product-manager__danger {
          border-color: #ffc9c7;
          color: #a61b1b;
        }

        .product-manager .product-manager__danger:hover {
          background: #fff1f0;
          border-color: #ff7875;
        }

        .product-manager__pager button,
        .product-manager__pager span {
          min-height: 32px;
        }

        .product-manager__pager span {
          align-items: center;
          color: var(--pm-muted);
          display: inline-flex;
          font-size: 12px;
          padding: 0 6px;
        }

        @media (max-width: 900px) {
          .product-manager {
            max-width: 100%;
            width: 100%;
          }

          .product-manager__header,
          .product-manager__toolbar,
          .product-manager__table-head,
          .product-manager__row {
            grid-template-columns: 1fr;
          }

          .product-manager__summary {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .product-manager__actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-start;
            justify-self: start;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}

export const productManagerField = ({ label = '产品管理' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: ProductManagerInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
