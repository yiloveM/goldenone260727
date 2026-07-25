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

const toSortOrder = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 9999;
  return parsed;
};

function ProductOrderInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle', message: '' });

  useSyncedSurfaceTheme(rootRef, 'po');

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

  const saveWeight = useCallback(async (productId: string, sortOrder: number) => {
    try {
      const response = await fetch('/api/products/manager', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sortOrders: [{ id: productId, sortOrder }],
        }),
      });

      if (!response.ok) {
        throw new Error('weight save failed');
      }
    } catch {
      setSaveState({ kind: 'error', message: '权重保存失败，请稍后重试。' });
    }
  }, []);

  const commitWeight = (product: ProductSummary, draft: string) => {
    const sortOrder = toSortOrder(draft);

    if (sortOrder === product.sortOrder) return;

    setSaveState({ kind: 'idle', message: '' });
    setProducts(current => current.map(item => (item.id === product.id ? { ...item, sortOrder } : item)));
    saveQueueRef.current = saveQueueRef.current.then(() => saveWeight(product.id, sortOrder));
    void saveQueueRef.current;
  };

  return (
    <div ref={rootRef} className="product-order">
      <div className="product-order__toolbar">
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

      {state.kind === 'loading' ? <div className="product-order__notice">正在加载产品...</div> : null}
      {state.kind === 'error' ? <div className="product-order__notice product-order__notice--error">{state.message}</div> : null}
      {saveState.kind !== 'idle' ? <div className="product-order__notice product-order__notice--error">{saveState.message}</div> : null}

      <div className="product-order__meta">
        <strong>{category || '全部分类'}</strong>
        <span>{sortedProducts.length} 个产品</span>
      </div>

      <section className="product-order__explorer" aria-label="产品排序">
        {sortedProducts.map(product => (
          <article key={product.id} className={`product-order__tile${product.published ? '' : ' is-unpublished'}`}>
            <div className="product-order__thumb">
              <img src={product.image || fallbackImage} alt="" loading="lazy" />
            </div>
            <strong title={product.title}>{product.title}</strong>
            <span>{product.category}</span>
            <label>
              <span>权重</span>
              <input
                type="number"
                min="1"
                step="1"
                defaultValue={String(product.sortOrder)}
                onInput={event => event.stopPropagation()}
                onChange={event => event.stopPropagation()}
                onBlur={event => commitWeight(product, event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
              />
            </label>
          </article>
        ))}
      </section>

      {!sortedProducts.length && state.kind === 'ready' ? <div className="product-order__notice">没有匹配的产品。</div> : null}

      <style>{`
        .product-order {
          --po-bg: #ffffff;
          --po-panel: #ffffff;
          --po-muted-bg: #f6f7f9;
          --po-hover: #f8fafc;
          --po-thumb: #f2f4f7;
          --po-border: #d1d7e0;
          --po-border-soft: #e1e4e8;
          --po-text: #172033;
          --po-muted: #667085;
          color: var(--po-text);
          display: grid;
          gap: 12px;
          max-width: calc(100vw - 330px);
          width: calc(100vw - 330px);
        }

        .product-order button,
        .product-order input,
        .product-order select {
          background: var(--po-panel);
          border: 1px solid var(--po-border);
          border-radius: 6px;
          color: var(--po-text);
          font: inherit;
          min-height: 36px;
          padding: 7px 10px;
        }

        .product-order__toolbar {
          align-items: end;
          background: var(--po-muted-bg);
          border: 1px solid var(--po-border-soft);
          border-radius: 8px;
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(220px, 0.7fr) minmax(300px, 1fr);
          padding: 10px;
        }

        .product-order label {
          display: grid;
          gap: 5px;
        }

        .product-order label span,
        .product-order__meta span,
        .product-order__tile > span {
          color: var(--po-muted);
          font-size: 12px;
        }

        .product-order__notice {
          background: var(--po-muted-bg);
          border: 1px solid var(--po-border-soft);
          border-radius: 8px;
          color: var(--po-muted);
          padding: 12px;
        }

        .product-order__notice--error {
          background: color-mix(in srgb, #ef4444 14%, var(--po-bg));
          border-color: color-mix(in srgb, #ef4444 38%, var(--po-border));
          color: color-mix(in srgb, #ef4444 82%, var(--po-text));
        }

        .product-order__meta {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
        }

        .product-order__explorer {
          align-content: start;
          background: var(--po-bg);
          border: 1px solid var(--po-border-soft);
          border-radius: 8px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fill, minmax(150px, 150px));
          justify-content: start;
          min-height: calc(100vh - 260px);
          padding: 10px;
        }

        .product-order__tile {
          align-content: start;
          border: 1px solid transparent;
          border-radius: 8px;
          display: grid;
          gap: 7px;
          grid-template-rows: 96px 18px 18px 32px;
          height: 202px;
          justify-items: center;
          min-width: 0;
          padding: 8px;
          text-align: center;
          width: 150px;
        }

        .product-order__tile:hover {
          background: var(--po-hover);
          border-color: var(--po-border);
        }

        .product-order__tile.is-unpublished {
          opacity: 0.55;
        }

        .product-order__thumb {
          aspect-ratio: 1;
          background: var(--po-thumb);
          border: 1px solid var(--po-border-soft);
          border-radius: 6px;
          height: 96px;
          overflow: hidden;
          width: 96px;
        }

        .product-order__thumb img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .product-order__tile strong {
          display: block;
          font-size: 12px;
          height: 18px;
          line-height: 18px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .product-order__tile label {
          align-items: center;
          grid-template-columns: auto 72px;
        }

        .product-order__tile input {
          min-height: 30px;
          padding: 4px 6px;
          text-align: center;
        }

        @media (max-width: 900px) {
          .product-order {
            max-width: 100%;
            width: 100%;
          }

          .product-order__toolbar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export const productOrderField = ({ label = '产品排序' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: ProductOrderInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
