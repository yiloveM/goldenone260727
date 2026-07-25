import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type DraftType = 'product' | 'blog';

type TranslationDraft = {
  type: DraftType;
  typeLabel: string;
  draftSlug: string;
  title: string;
  sourceSlug: string;
  sourceTitle: string;
  locale: string;
  published: boolean;
  generatedAt: string;
  previewUrl: string;
  editPath: string;
};

type DraftResponse = {
  drafts: TranslationDraft[];
  counts: {
    total: number;
    pending: number;
    published: number;
    visible: number;
  };
};

type LoadState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; data: DraftResponse }
  | { kind: 'error'; message: string };

const localeName = (locale: string) => ({
  zh: '简体中文',
  ar: 'Arabic',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  bn: 'Bengali',
  pt: 'Portuguese',
  ru: 'Russian',
  ur: 'Urdu',
  de: 'German',
  tr: 'Turkish',
  fil: 'Filipino',
  ko: 'Korean',
  uz: 'Uzbek',
}[locale] || locale);

const keystaticBasePath = () => {
  if (typeof window === 'undefined') return '/keystatic';
  const match = window.location.pathname.match(/^(.*?\/keystatic(?:\/branch\/[^/]+)?)/);
  return match?.[1] || '/keystatic';
};

function TranslationDraftReviewInput({ type }: { type: DraftType }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [includePublished, setIncludePublished] = useState(false);
  const [query, setQuery] = useState('');
  const [locale, setLocale] = useState('');
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(new Set());
  const [approveState, setApproveState] = useState<{ kind: 'idle' | 'loading' | 'error'; message: string }>({ kind: 'idle', message: '' });

  useSyncedSurfaceTheme(rootRef, 'tr');

  const title = type === 'product' ? '产品翻译草稿' : '文章翻译草稿';
  const loadDrafts = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const params = new URLSearchParams({ type, includePublished: String(includePublished) });
      const response = await fetch(`/api/ai/drafts?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      setState({ kind: 'ready', data: await response.json() as DraftResponse });
      setSelectedDrafts(new Set());
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : '无法加载翻译草稿。',
      });
    }
  }, [includePublished, type]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const drafts = state.kind === 'ready' ? state.data.drafts : [];
  const locales = useMemo(() => [...new Set(drafts.map(draft => draft.locale).filter(Boolean))], [drafts]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleDrafts = drafts.filter(draft => {
    if (locale && draft.locale !== locale) return false;
    if (!normalizedQuery) return true;
    return [draft.title, draft.sourceTitle, draft.sourceSlug, draft.draftSlug, draft.locale].some(value =>
      String(value || '').toLowerCase().includes(normalizedQuery)
    );
  });
  const selectableDrafts = visibleDrafts.filter(draft => !draft.published);
  const selectedVisibleCount = selectableDrafts.filter(draft => selectedDrafts.has(draft.draftSlug)).length;
  const allVisibleSelected = selectableDrafts.length > 0 && selectedVisibleCount === selectableDrafts.length;

  const editHref = (draft: TranslationDraft) => `${keystaticBasePath()}${draft.editPath}`;
  const toggleDraft = (draftSlug: string, checked: boolean) => {
    setSelectedDrafts(current => {
      const next = new Set(current);
      if (checked) next.add(draftSlug);
      else next.delete(draftSlug);
      return next;
    });
  };
  const toggleVisibleDrafts = (checked: boolean) => {
    setSelectedDrafts(current => {
      const next = new Set(current);
      selectableDrafts.forEach(draft => {
        if (checked) next.add(draft.draftSlug);
        else next.delete(draft.draftSlug);
      });
      return next;
    });
  };
  const approveSelectedDrafts = async () => {
    const draftsToApprove = [...selectedDrafts].filter(draftSlug => selectableDrafts.some(draft => draft.draftSlug === draftSlug));
    if (!draftsToApprove.length) return;

    setApproveState({ kind: 'loading', message: '' });
    try {
      const response = await fetch('/api/ai/drafts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, drafts: draftsToApprove }),
      });
      const responseText = await response.text();
      let data: { errors?: Array<{ draftSlug: string; message: string }> } | null = null;
      try {
        data = responseText ? JSON.parse(responseText) as { errors?: Array<{ draftSlug: string; message: string }> } : null;
      } catch {
        data = null;
      }
      if (!response.ok || data?.errors?.length) {
        throw new Error(data?.errors?.map(error => `${error.draftSlug}: ${error.message}`).join('\n') || responseText);
      }
      setApproveState({ kind: 'idle', message: '' });
      await loadDrafts();
    } catch (error) {
      setApproveState({
        kind: 'error',
        message: error instanceof Error ? error.message : '一键审核失败，请稍后重试。',
      });
    }
  };

  return (
    <div ref={rootRef} className="translation-review">
      <div className="translation-review__header">
        <div>
          <span className="translation-review__eyebrow">待审核内容</span>
          <h2>{title}</h2>
          <p>默认只显示还没有打开“审核后发布”的草稿。审核完成并保存发布开关后，该草稿会从当前列表隐藏。</p>
        </div>
        <button type="button" onClick={loadDrafts}>刷新</button>
      </div>

      {state.kind === 'ready' ? (
        <div className="translation-review__stats">
          <span>待审核：{state.data.counts.pending}</span>
          <span>已审核：{state.data.counts.published}</span>
          <span>当前显示：{state.data.counts.visible}</span>
        </div>
      ) : null}

      <div className="translation-review__toolbar">
        <label>
          <span>语言</span>
          <select value={locale} onChange={event => setLocale(event.currentTarget.value)}>
            <option value="">全部语言</option>
            {locales.map(item => <option key={item} value={item}>{localeName(item)}</option>)}
          </select>
        </label>
        <label>
          <span>搜索</span>
          <input value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="搜索标题或 slug" />
        </label>
        <label className="translation-review__toggle">
          <input type="checkbox" checked={includePublished} onChange={event => setIncludePublished(event.currentTarget.checked)} />
          <span>显示已审核发布</span>
        </label>
      </div>

      {selectableDrafts.length ? (
        <div className="translation-review__bulk">
          <label>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={event => toggleVisibleDrafts(event.currentTarget.checked)}
            />
            <span>选择当前筛选结果</span>
          </label>
          <button type="button" disabled={!selectedVisibleCount || approveState.kind === 'loading'} onClick={approveSelectedDrafts}>
            {approveState.kind === 'loading' ? '正在审核...' : '一键审核选中草稿'}
          </button>
          <small>已选 {selectedVisibleCount} 条</small>
        </div>
      ) : null}

      {state.kind === 'loading' ? <p className="translation-review__notice">正在加载草稿...</p> : null}
      {state.kind === 'error' ? <p className="translation-review__notice is-error">{state.message}</p> : null}
      {approveState.kind === 'error' ? <p className="translation-review__notice is-error">{approveState.message}</p> : null}
      {state.kind === 'ready' && !visibleDrafts.length ? (
        <p className="translation-review__notice">当前没有需要审核的{title}。</p>
      ) : null}

      {visibleDrafts.length ? (
        <div className="translation-review__table-wrap">
          <table className="translation-review__table">
            <thead>
              <tr>
                <th className="translation-review__select-col">
                  <input
                    type="checkbox"
                    aria-label="选择当前筛选结果"
                    checked={allVisibleSelected}
                    disabled={!selectableDrafts.length}
                    onChange={event => toggleVisibleDrafts(event.currentTarget.checked)}
                  />
                </th>
                <th>状态</th>
                <th>语言</th>
                <th>草稿标题</th>
                <th>英文源页面</th>
                <th>生成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleDrafts.map(draft => (
                <tr key={draft.draftSlug} className={draft.published ? 'is-published' : ''}>
                  <td className="translation-review__select-col">
                    {!draft.published ? (
                      <input
                        type="checkbox"
                        checked={selectedDrafts.has(draft.draftSlug)}
                        aria-label={`选择 ${draft.title}`}
                        onChange={event => toggleDraft(draft.draftSlug, event.currentTarget.checked)}
                      />
                    ) : <span>-</span>}
                  </td>
                  <td>
                    <span className={`translation-review__status${draft.published ? ' is-published' : ''}`}>
                      {draft.published ? '已审核发布' : '待审核'}
                    </span>
                  </td>
                  <td>{localeName(draft.locale)}</td>
                  <td>
                    <strong>{draft.title}</strong>
                    <small>{draft.draftSlug}</small>
                  </td>
                  <td>
                    <span>{draft.sourceTitle || draft.sourceSlug}</span>
                    <small>{draft.sourceSlug}</small>
                  </td>
                  <td>{draft.generatedAt ? new Date(draft.generatedAt).toLocaleString() : '-'}</td>
                  <td>
                    <div className="translation-review__actions">
                      <a href={draft.previewUrl} target="_blank" rel="noreferrer">预览</a>
                      <a href={editHref(draft)}>审核编辑</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <style>{`
        .translation-review {
          min-height: 72vh;
          width: calc(100vw - 330px);
          max-width: calc(100vw - 330px);
          margin: 0;
          padding: 30px;
          color: var(--tr-text);
          background: var(--tr-bg);
          border-radius: 8px;
          box-sizing: border-box;
        }
        .translation-review__header,
        .translation-review__toolbar,
        .translation-review__bulk,
        .translation-review__stats,
        .translation-review__table-wrap,
        .translation-review__notice {
          border: 1px solid var(--tr-border-soft);
          border-radius: 8px;
          background: var(--tr-panel);
          box-shadow: 0 18px 54px rgba(10, 70, 90, .08);
        }
        .translation-review__header {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          justify-content: space-between;
          padding: 30px 34px;
          background:
            radial-gradient(circle at 92% 8%, rgba(47, 191, 211, .16), transparent 34%),
            linear-gradient(135deg, var(--tr-panel), var(--tr-muted-bg));
        }
        .translation-review__eyebrow {
          color: var(--tr-accent, #078aa2);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .translation-review h2 {
          margin: 4px 0 8px;
          font-size: clamp(24px, 2.3vw, 34px);
          line-height: 1.08;
        }
        .translation-review p,
        .translation-review small {
          color: var(--tr-muted);
        }
        .translation-review button,
        .translation-review__actions a {
          border: 1px solid var(--tr-border-soft);
          border-radius: 8px;
          padding: 8px 12px;
          color: var(--tr-text);
          background: var(--tr-muted-bg);
          font-weight: 800;
          text-decoration: none;
        }
        .translation-review__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
          padding: 16px;
        }
        .translation-review__stats span {
          border-radius: 999px;
          padding: 7px 12px;
          background: var(--tr-muted-bg);
          font-weight: 800;
        }
        .translation-review__toolbar {
          display: grid;
          grid-template-columns: minmax(220px, .36fr) minmax(420px, 1fr) auto;
          gap: 16px;
          align-items: end;
          margin-top: 14px;
          padding: 18px;
        }
        .translation-review__bulk {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
          padding: 12px 16px;
        }
        .translation-review__bulk label {
          align-items: center;
          color: var(--tr-muted);
          display: inline-flex;
          font-size: 12px;
          gap: 7px;
        }
        .translation-review__bulk input,
        .translation-review__select-col input {
          height: 14px;
          margin: 0;
          min-height: 0;
          padding: 0;
          width: 14px;
        }
        .translation-review__bulk button {
          color: #0e98b9;
          font-size: 12px;
          font-weight: 700;
          min-height: 30px;
          padding: 5px 10px;
        }
        .translation-review__bulk button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }
        .translation-review__toolbar label {
          display: grid;
          gap: 6px;
          font-weight: 800;
        }
        .translation-review__toolbar input,
        .translation-review__toolbar select {
          width: 100%;
          height: 42px;
          min-height: 42px;
          box-sizing: border-box;
          border: 1px solid var(--tr-border-soft);
          border-radius: 8px;
          padding: 8px 10px;
          color: var(--tr-text);
          background: var(--tr-panel);
        }
        .translation-review__toggle {
          display: flex !important;
          grid-template-columns: none;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          height: 42px;
          min-height: 42px;
        }
        .translation-review__toggle input {
          flex: 0 0 auto;
          height: 14px;
          min-height: 0;
          padding: 0;
          width: 14px;
        }
        .translation-review__toggle span {
          color: var(--tr-muted);
          font-size: 12px;
          font-weight: 400;
          line-height: 1.3;
        }
        .translation-review__notice {
          margin-top: 12px;
          padding: 14px;
        }
        .translation-review__notice.is-error {
          color: #b42318;
        }
        .translation-review__table-wrap {
          margin-top: 14px;
          overflow-x: auto;
        }
        .translation-review__table {
          width: 100%;
          min-width: 1240px;
          border-collapse: collapse;
        }
        .translation-review__table th,
        .translation-review__table td {
          border-bottom: 1px solid var(--tr-border-soft);
          padding: 14px 16px;
          text-align: left;
          vertical-align: middle;
        }
        .translation-review__table th:last-child,
        .translation-review__table td:last-child {
          min-width: 152px;
          padding-right: 34px;
          width: 152px;
        }
        .translation-review__table th.translation-review__select-col,
        .translation-review__table td.translation-review__select-col {
          min-width: 44px;
          padding-left: 14px;
          padding-right: 6px;
          text-align: center;
          width: 44px;
        }
        .translation-review__table th {
          color: var(--tr-muted);
          font-size: 12px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .translation-review__table strong,
        .translation-review__table small {
          display: block;
        }
        .translation-review__status {
          display: inline-flex;
          padding: 0;
          color: #0e98b9;
          background: transparent;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .translation-review__status.is-published {
          color: #067647;
          background: transparent;
        }
        .translation-review__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-start;
        }
        .translation-review__actions a {
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          min-height: 28px;
          padding: 5px 8px;
        }
        @media (max-width: 760px) {
          .translation-review {
            width: 100%;
            max-width: 100%;
            padding: 14px;
          }
          .translation-review__header,
          .translation-review__toolbar {
            grid-template-columns: 1fr;
            display: grid;
          }
          .translation-review__toggle {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

export const translationDraftReviewField = ({ label = '翻译草稿审核', type = 'product' as DraftType } = {}) => ({
  kind: 'form' as const,
  label,
  Input: () => <TranslationDraftReviewInput type={type} />,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
