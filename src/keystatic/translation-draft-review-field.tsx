import { confirmDialog } from '../lib/admin-dialog.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getKeystaticBasePath } from './keystatic-path';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';
type DraftType = 'product' | 'blog';
type Draft = { draftSlug:string; title:string; sourceTitle:string; sourceSlug:string; locale:string; published:boolean; sourceSha:string; deleteAction:string; generatedAt:string; previewUrl:string; editPath:string };
function TranslationDraftReviewInput({ type }: { type: DraftType }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLInputElement | null>(null);
  const serial = useRef(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [includePublished, setIncludePublished] = useState(false);
  const [query, setQuery] = useState('');
  const [locale, setLocale] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [counts, setCounts] = useState({pending:0, published:0, live:0});
  useSyncedSurfaceTheme(rootRef, 'tr');
  const loadDrafts = useCallback(async () => {
    const requestId = ++serial.current;
    setLoading(true); setSelected(new Set());
    try {
      const response = await fetch(`/api/ai/drafts?type=${type}&includePublished=${includePublished}`, {cache:'no-store'});
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      if (requestId !== serial.current) return;
      setDrafts(data.drafts || []); setCounts(data.counts); setMessage(data.warning || '');
    } catch(error) { if (requestId === serial.current) { setDrafts([]); setMessage(error instanceof Error ? error.message : '加载失败。'); } }
    finally { if (requestId === serial.current) setLoading(false); }
  }, [type, includePublished]);
  useEffect(() => { void loadDrafts(); return () => { serial.current++; }; }, [loadDrafts]);
  useEffect(() => { const refresh = () => void loadDrafts(); window.addEventListener('businessweb:published', refresh); return () => window.removeEventListener('businessweb:published', refresh); }, [loadDrafts]);
  const visible = drafts.filter(draft => (!locale || draft.locale === locale) && `${draft.title} ${draft.sourceSlug} ${draft.sourceTitle} ${draft.locale}`.toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = visible.filter(draft => selected.has(draft.draftSlug));
  const all = visible.length > 0 && chosen.length === visible.length;
  useEffect(() => { if (selectRef.current) selectRef.current.indeterminate = chosen.length > 0 && !all; }, [chosen.length, all]);
  const changeFilter = (setter: (value:string)=>void, value:string) => { setter(value); setSelected(new Set()); };
  const mutate = async (action:'approve'|'delete', rows = chosen) => {
    const targets = action === 'approve' ? rows.filter(draft => !draft.published) : rows;
    if (!targets.length || busy) return;
    if (action === 'delete' && !await confirmDialog(`请确认以下 ${targets.length} 项：\n${targets.map(draft => `${draft.locale} · ${draft.title} (${draft.draftSlug})：${draft.deleteAction === 'restore' ? '撤销未上线修改，恢复线上版本' : '删除未上线新稿'}`).join('\n')}\n正式线上内容及共享媒体保持。`)) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ai/drafts', {method:action === 'delete' ? 'DELETE' : 'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({type, confirmed:action === 'delete', drafts:targets.map(({draftSlug,sourceSha}) => ({draftSlug,sourceSha}))})});
      if (!response.ok) throw new Error(await response.text());
      await loadDrafts();
    } catch(error) { setMessage(error instanceof Error ? error.message : '操作失败，请刷新。'); }
    finally { setBusy(false); }
  };
  const title = type === 'product' ? '产品翻译草稿' : '文章翻译草稿';
  return (<div ref={rootRef} className="translation-review">
    <div className="translation-review__header"><div><h2>{title}</h2><p>这里只处理待审核和已审核待发布内容。发布成功后自动移出待办；正式内容请在{type === 'product' ? '产品管理' : '所有文章'}按语言筛选编辑。</p></div><button type="button" disabled={busy || loading} onClick={() => void loadDrafts()}>刷新</button></div>
    <div className="translation-review__stats"><span>待审核：{counts.pending}</span><span>已审核待发布：{counts.published}</span><span>已上线：{counts.live}（在正式内容管理）</span></div>
    <div className="translation-review__toolbar">
      <label>语言<select disabled={busy || loading} value={locale} onChange={event => changeFilter(setLocale,event.target.value)}><option value="">全部语言</option>{[...new Set(drafts.map(draft => draft.locale))].map(code => <option key={code}>{code}</option>)}</select></label>
      <label>搜索<input type="search" disabled={busy} value={query} onChange={event => changeFilter(setQuery,event.target.value)} /></label>
      <label className="translation-review__toggle"><input type="checkbox" disabled={busy || loading} checked={includePublished} onChange={event => { setSelected(new Set()); setIncludePublished(event.target.checked); }} />显示已审核</label>
      <label className="translation-review__toggle"><input ref={selectRef} type="checkbox" disabled={busy || loading || !visible.length} checked={all} onChange={event => setSelected(new Set(event.target.checked ? visible.map(draft => draft.draftSlug) : []))} />全选当前筛选（{visible.length}）</label>
    </div>
    <div className="translation-review__bulk"><button type="button" disabled={busy || loading || !chosen.some(draft => !draft.published)} onClick={() => void mutate('approve')}>一键审核选中草稿</button><button type="button" className="draft-delete" disabled={busy || loading || !chosen.length || chosen.some(draft => !draft.deleteAction)} onClick={() => void mutate('delete')}>一键删除选中草稿</button><small>已选 {chosen.length} 条；已有线上版本的改稿会恢复线上版本。</small></div>
    {message && <p className="translation-review__notice" role="status">{message}</p>}
    {loading ? <p role="status">正在加载…</p> : !visible.length ? <p>当前没有草稿待办。</p> : <div className="translation-review__table-wrap"><table className="translation-review__table"><thead><tr><th>选择</th><th>状态</th><th>语言</th><th>标题</th><th>英文源页面</th><th>生成时间</th><th>操作</th></tr></thead><tbody>{visible.map(draft => <tr key={draft.draftSlug}>
      <td><input type="checkbox" disabled={busy} aria-label={`选择 ${draft.title}`} checked={selected.has(draft.draftSlug)} onChange={event => { const checked = event.target.checked; setSelected(current => { const next = new Set(current); if(checked) next.add(draft.draftSlug); else next.delete(draft.draftSlug); return next; }); }} /></td>
      <td>{draft.published ? '已审核 · 待发布' : '待审核'}</td><td>{draft.locale}</td><td><strong>{draft.title}</strong><small>{draft.draftSlug}</small></td><td>{draft.sourceTitle || draft.sourceSlug}</td><td>{draft.generatedAt ? new Date(draft.generatedAt).toLocaleString() : '—'}</td>
      <td><div className="translation-review__actions"><a href={draft.previewUrl} target="_blank" rel="noreferrer">预览</a><a href={`${getKeystaticBasePath().split('/branch/')[0]}${draft.editPath}`}>审核编辑</a><button type="button" className="draft-delete" disabled={busy || !draft.deleteAction} onClick={() => void mutate('delete',[draft])}>{draft.deleteAction === 'restore' ? '撤销改稿' : '删除'}</button></div></td>
    </tr>)}</tbody></table></div>}
      <style>{`
        .translation-review .draft-delete { color: light-dark(#b42318,#fda29b); border-color: currentColor; }
        .translation-review button:disabled { opacity: .5; cursor: not-allowed; }
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
