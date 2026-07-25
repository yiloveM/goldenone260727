import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type PublishStage =
  | 'idle'
  | 'submitting'
  | 'waiting'
  | 'queued'
  | 'building'
  | 'uploading'
  | 'success'
  | 'failed'
  | 'error'
  | 'unknown';

type PublishState = {
  stage: PublishStage;
  label: string;
  message: string;
  requestId?: string;
  statusUrl?: string;
  actionsUrl?: string;
};

type PublishResponse = {
  ok?: boolean;
  requestId?: string;
  stage?: PublishStage;
  label?: string;
  message?: string;
  statusUrl?: string;
  actionsUrl?: string;
};

type PublishStatusResponse = {
  requestId: string;
  found: boolean;
  stage: PublishStage;
  label: string;
  status: string;
  conclusion?: string;
  message?: string;
  actionsUrl?: string;
  run?: {
    htmlUrl: string;
  };
};

type PublishRecord = {
  id: number;
  requestId: string;
  runNumber: number;
  title: string;
  stage: PublishStage;
  label: string;
  status: string;
  conclusion: string;
  message: string;
  submittedAt: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string;
  htmlUrl: string;
  branch: string;
  sha: string;
  actor: string;
  activeStep: string;
};

type PublishHistoryResponse = {
  records: PublishRecord[];
  limit: number;
  actionsUrl?: string;
};

const terminalStages: PublishStage[] = ['success', 'failed', 'error'];

const initialState: PublishState = {
  stage: 'idle',
  label: '准备发布',
  message: '内容全部检查完成后，再一次性提交发布。',
};

const stageTone = (stage: PublishStage) => {
  if (stage === 'success') return 'success';
  if (stage === 'failed' || stage === 'error') return 'error';
  if (stage === 'building' || stage === 'uploading') return 'active';
  return 'neutral';
};

const formatTime = (value: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortSha = (value: string) => value ? value.slice(0, 7) : '-';

function SitePublisherInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<PublishState>(initialState);
  const [history, setHistory] = useState<PublishRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [deleteState, setDeleteState] = useState<{ kind: 'idle' | 'loading' | 'error'; message: string }>({
    kind: 'idle',
    message: '',
  });

  useSyncedSurfaceTheme(rootRef, 'sp');

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch('/api/deploy/site', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as PublishHistoryResponse;
      setHistory(data.records || []);
      setSelectedRecords(current => new Set([...current].filter(id => (data.records || []).some(record => record.id === id))));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '读取发布记录失败。');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const publishSite = async () => {
    setState({
      stage: 'submitting',
      label: '提交中',
      message: '正在提交后台发布任务...',
    });

    try {
      const response = await fetch('/api/deploy/site', { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as PublishResponse;
      setState({
        stage: data.stage || 'queued',
        label: data.label || '排队中',
        message: data.message || '后台发布任务已提交，请等待构建和上传完成。',
        requestId: data.requestId,
        statusUrl: data.statusUrl,
        actionsUrl: data.actionsUrl,
      });
      window.setTimeout(() => void loadHistory(), 2500);
    } catch (error) {
      setState({
        stage: 'error',
        label: '提交失败',
        message: error instanceof Error ? error.message : '发布任务提交失败，请稍后重试。',
      });
    }
  };

  useEffect(() => {
    if (!state.requestId || terminalStages.includes(state.stage)) return;

    let disposed = false;
    let timer: number | undefined;

    const pollStatus = async () => {
      try {
        const statusUrl = state.statusUrl || `/api/deploy/site?requestId=${encodeURIComponent(state.requestId || '')}`;
        const response = await fetch(statusUrl, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(await response.text());
        const data = (await response.json()) as PublishStatusResponse;
        if (disposed) return;

        setState(current => ({
          ...current,
          stage: data.stage || current.stage,
          label: data.label || current.label,
          message: data.message || current.message,
          actionsUrl: data.run?.htmlUrl || data.actionsUrl || current.actionsUrl,
        }));

        void loadHistory();

        if (!terminalStages.includes(data.stage)) {
          timer = window.setTimeout(pollStatus, data.stage === 'waiting' || data.stage === 'queued' ? 6000 : 10000);
        }
      } catch (error) {
        if (disposed) return;
        setState(current => ({
          ...current,
          stage: 'error',
          label: '状态读取失败',
          message: error instanceof Error ? error.message : '读取发布状态失败，请稍后刷新页面查看。',
        }));
      }
    };

    pollStatus();

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loadHistory, state.requestId, state.stage, state.statusUrl]);

  const busy = ['submitting', 'waiting', 'queued', 'building', 'uploading'].includes(state.stage);
  const stepState = {
    queued: ['submitting', 'waiting', 'queued', 'building', 'uploading', 'success'].includes(state.stage),
    building: ['building', 'uploading', 'success'].includes(state.stage),
    uploading: ['uploading', 'success'].includes(state.stage),
  };
  const allVisibleSelected = history.length > 0 && history.every(record => selectedRecords.has(record.id));
  const selectedCount = selectedRecords.size;
  const latestRecord = useMemo(() => history[0], [history]);

  const toggleRecord = (id: number, checked: boolean) => {
    setSelectedRecords(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllRecords = (checked: boolean) => {
    setSelectedRecords(checked ? new Set(history.map(record => record.id)) : new Set());
  };

  const deleteSelectedRecords = async () => {
    const runIds = [...selectedRecords];
    if (!runIds.length) return;
    const confirmed = window.confirm(`确定删除选中的 ${runIds.length} 条发布记录吗？`);
    if (!confirmed) return;

    setDeleteState({ kind: 'loading', message: '' });
    try {
      const response = await fetch('/api/deploy/site', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runIds }),
      });
      const text = await response.text();
      let data: { deleted?: number[]; errors?: Array<{ runId: number; message: string }> } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!response.ok || data?.errors?.length) {
        throw new Error(data?.errors?.map(error => `${error.runId}: ${error.message}`).join('\n') || text);
      }
      setDeleteState({ kind: 'idle', message: '' });
      setSelectedRecords(new Set());
      await loadHistory();
    } catch (error) {
      setDeleteState({
        kind: 'error',
        message: error instanceof Error ? error.message : '删除发布记录失败，请稍后重试。',
      });
    }
  };

  return (
    <div ref={rootRef} className="site-publisher">
      <section className="site-publisher__panel">
        <div className="site-publisher__copy">
          <span className="site-publisher__eyebrow">集中发布</span>
          <h2>确认内容后，一次上线。</h2>
          <p>产品、文章、图片链接和翻译草稿都检查完成后，再提交前台更新。后台会依次完成排队、构建和上传，并在这里显示进度。</p>
        </div>

        <div className="site-publisher__steps" aria-label="发布进度">
          <div className={stepState.queued ? 'is-active' : ''}><strong>01</strong><span>排队中</span></div>
          <div className={stepState.building ? 'is-active' : ''}><strong>02</strong><span>构建中</span></div>
          <div className={stepState.uploading ? 'is-active' : ''}><strong>03</strong><span>上传中</span></div>
        </div>

        <button type="button" disabled={busy} onClick={publishSite}>
          {busy ? state.label : '发布网站更新'}
        </button>

        <div className={`site-publisher__notice site-publisher__notice--${state.stage}`} role="status">
          <span>{state.label}</span>
          <p>{state.message}</p>
          {state.actionsUrl ? (
            <a href={state.actionsUrl} target="_blank" rel="noreferrer">
              查看后台运行记录
            </a>
          ) : null}
        </div>
      </section>

      <section className="site-publisher__history" aria-label="最近发布记录">
        <div className="site-publisher__history-head">
          <div>
            <span className="site-publisher__eyebrow">最近记录</span>
            <h3>最近 20 次网站发布</h3>
            <p>记录来自后台发布任务，所有管理员看到的是同一份记录。</p>
          </div>
          <div className="site-publisher__history-actions">
            <button type="button" className="site-publisher__small-button" onClick={loadHistory} disabled={historyLoading}>
              {historyLoading ? '刷新中...' : '刷新记录'}
            </button>
            <button
              type="button"
              className="site-publisher__small-button site-publisher__small-button--danger"
              onClick={deleteSelectedRecords}
              disabled={!selectedCount || deleteState.kind === 'loading'}
            >
              {deleteState.kind === 'loading' ? '删除中...' : `删除选中${selectedCount ? ` (${selectedCount})` : ''}`}
            </button>
          </div>
        </div>

        {latestRecord ? (
          <div className="site-publisher__latest">
            <span className={`site-publisher__badge site-publisher__badge--${stageTone(latestRecord.stage)}`}>{latestRecord.label}</span>
            <strong>最近一次：{formatTime(latestRecord.submittedAt)}</strong>
            <small>{latestRecord.message}</small>
          </div>
        ) : null}

        {historyError ? <p className="site-publisher__history-message is-error">{historyError}</p> : null}
        {deleteState.kind === 'error' ? <p className="site-publisher__history-message is-error">{deleteState.message}</p> : null}
        {!historyLoading && !history.length ? <p className="site-publisher__history-message">暂无发布记录。</p> : null}

        {history.length ? (
          <div className="site-publisher__history-table-wrap">
            <table className="site-publisher__history-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={event => toggleAllRecords(event.currentTarget.checked)}
                      aria-label="选择全部发布记录"
                    />
                  </th>
                  <th>提交时间</th>
                  <th>结果</th>
                  <th>当前步骤</th>
                  <th>提交人</th>
                  <th>分支 / 版本</th>
                  <th>记录</th>
                </tr>
              </thead>
              <tbody>
                {history.map(record => (
                  <tr key={record.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={event => toggleRecord(record.id, event.currentTarget.checked)}
                        aria-label={`选择 ${record.title || record.id}`}
                      />
                    </td>
                    <td>
                      <strong>{formatTime(record.submittedAt)}</strong>
                      <small>完成：{formatTime(record.completedAt || record.updatedAt)}</small>
                    </td>
                    <td>
                      <span className={`site-publisher__badge site-publisher__badge--${stageTone(record.stage)}`}>{record.label}</span>
                      <small>{record.conclusion || record.status}</small>
                    </td>
                    <td>
                      <span>{record.activeStep || record.message || '-'}</span>
                    </td>
                    <td>{record.actor || '-'}</td>
                    <td>
                      <strong>{record.branch || '-'}</strong>
                      <small>{shortSha(record.sha)}</small>
                    </td>
                    <td>
                      {record.htmlUrl ? (
                        <a href={record.htmlUrl} target="_blank" rel="noreferrer">
                          查看
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <style>{`
        .site-publisher {
          --sp-action-gradient: linear-gradient(135deg, #0e98b9, #33d0ca);
          min-height: 68vh;
          width: calc(100vw - 330px);
          max-width: calc(100vw - 330px);
          margin: 0;
          padding: 0;
          color: var(--sp-text);
          box-sizing: border-box;
        }
        .site-publisher__panel,
        .site-publisher__history {
          border: 1px solid var(--sp-border-soft);
          border-radius: 6px;
          background:
            radial-gradient(circle at 88% 8%, rgba(47, 191, 211, .13), transparent 34%),
            radial-gradient(circle at 8% 100%, rgba(14, 152, 185, .12), transparent 36%),
            linear-gradient(135deg, var(--sp-panel), var(--sp-muted-bg));
          box-shadow: 0 22px 68px rgba(10, 70, 90, .1);
        }
        .site-publisher__panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(300px, 0.56fr);
          gap: 22px;
          max-width: none;
          padding: clamp(22px, 3vw, 36px);
        }
        .site-publisher__history {
          display: grid;
          gap: 16px;
          margin-top: 18px;
          padding: clamp(18px, 2.4vw, 28px);
        }
        .site-publisher__copy,
        .site-publisher__history-head > div:first-child {
          display: grid;
          gap: 12px;
        }
        .site-publisher__eyebrow {
          background: var(--sp-action-gradient);
          background-clip: text;
          color: transparent;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
          -webkit-background-clip: text;
        }
        .site-publisher h2,
        .site-publisher h3 {
          margin: 0;
          line-height: 1.05;
          max-width: 780px;
        }
        .site-publisher h2 {
          font-size: clamp(24px, 2.3vw, 36px);
        }
        .site-publisher h3 {
          font-size: clamp(20px, 1.6vw, 28px);
        }
        .site-publisher p {
          margin: 0;
          color: var(--sp-muted);
          line-height: 1.7;
          max-width: 760px;
        }
        .site-publisher__steps {
          display: grid;
          gap: 10px;
          align-self: start;
          grid-column: 2;
          grid-row: 1 / span 2;
        }
        .site-publisher__steps div {
          display: flex;
          gap: 10px;
          align-items: center;
          border: 1px solid var(--sp-border-soft);
          border-radius: 8px;
          padding: 14px;
          background: color-mix(in srgb, var(--sp-panel) 68%, var(--sp-muted-bg));
          opacity: .72;
          transition: transform .2s ease, border-color .2s ease, opacity .2s ease;
        }
        .site-publisher__steps div.is-active {
          border-color: rgba(14, 152, 185, .34);
          opacity: 1;
          transform: translateY(-1px);
        }
        .site-publisher__steps strong {
          background: var(--sp-action-gradient);
          background-clip: text;
          color: transparent;
          font-size: 12px;
          letter-spacing: 0.08em;
          min-width: 28px;
          -webkit-background-clip: text;
        }
        .site-publisher button {
          font-family: inherit;
        }
        .site-publisher__panel > button {
          grid-column: 1;
          width: min(100%, 520px);
          border: 1px solid rgba(6, 142, 172, .28);
          border-radius: 10px;
          padding: 18px 26px;
          color: #fff;
          background: var(--sp-action-gradient);
          font-size: clamp(30px, 3.2vw, 52px);
          font-weight: 800;
          line-height: 1.05;
          cursor: pointer;
          box-shadow: 0 18px 42px rgba(14, 152, 185, .22);
        }
        .site-publisher button:hover {
          filter: saturate(1.06) brightness(1.02);
          transform: translateY(-1px);
        }
        .site-publisher button:disabled {
          cursor: wait;
          opacity: .76;
          transform: none;
        }
        .site-publisher__notice {
          display: grid;
          gap: 8px;
          border: 1px solid var(--sp-border-soft);
          border-radius: 8px;
          padding: 14px 16px;
          background: var(--sp-muted-bg);
          grid-column: 1 / -1;
        }
        .site-publisher__notice > span {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .site-publisher__notice p {
          max-width: none;
        }
        .site-publisher__notice a,
        .site-publisher__history-table a {
          width: fit-content;
          color: #0786a4;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }
        .site-publisher__notice--success {
          border-color: rgba(5, 112, 95, .28);
          color: #05705f;
        }
        .site-publisher__notice--failed,
        .site-publisher__notice--error {
          border-color: rgba(180, 35, 24, .3);
          color: #b42318;
        }
        .site-publisher__history-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }
        .site-publisher__history-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .site-publisher__small-button {
          border: 1px solid rgba(6, 142, 172, .28);
          border-radius: 8px;
          padding: 9px 13px;
          color: #087b96;
          background: color-mix(in srgb, var(--sp-panel) 80%, rgba(51, 208, 202, .12));
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .site-publisher__small-button--danger {
          border-color: rgba(180, 35, 24, .26);
          color: #b42318;
          background: color-mix(in srgb, var(--sp-panel) 85%, rgba(180, 35, 24, .08));
        }
        .site-publisher__latest {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 6px 12px;
          align-items: center;
          border: 1px solid var(--sp-border-soft);
          border-radius: 8px;
          padding: 12px 14px;
          background: color-mix(in srgb, var(--sp-panel) 72%, var(--sp-muted-bg));
        }
        .site-publisher__latest small {
          grid-column: 2;
          color: var(--sp-muted);
        }
        .site-publisher__badge {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }
        .site-publisher__badge--success {
          color: #05705f;
          background: rgba(5, 112, 95, .12);
        }
        .site-publisher__badge--error {
          color: #b42318;
          background: rgba(180, 35, 24, .12);
        }
        .site-publisher__badge--active {
          color: #087b96;
          background: rgba(14, 152, 185, .14);
        }
        .site-publisher__badge--neutral {
          color: var(--sp-muted);
          background: var(--sp-muted-bg);
        }
        .site-publisher__history-message {
          margin: 0;
          border-radius: 8px;
          padding: 12px 14px;
          background: var(--sp-muted-bg);
        }
        .site-publisher__history-message.is-error {
          color: #b42318;
        }
        .site-publisher__history-table-wrap {
          overflow-x: auto;
        }
        .site-publisher__history-table {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
          font-size: 13px;
        }
        .site-publisher__history-table th,
        .site-publisher__history-table td {
          border-bottom: 1px solid var(--sp-border-soft);
          padding: 11px 10px;
          text-align: left;
          vertical-align: top;
        }
        .site-publisher__history-table th {
          color: var(--sp-muted);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .site-publisher__history-table td {
          color: var(--sp-text);
        }
        .site-publisher__history-table td strong,
        .site-publisher__history-table td small,
        .site-publisher__history-table td span {
          display: block;
        }
        .site-publisher__history-table td small {
          margin-top: 4px;
          color: var(--sp-muted);
        }
        .site-publisher__history-table input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #0e98b9;
        }
        @media (max-width: 980px) {
          .site-publisher__panel {
            grid-template-columns: 1fr;
          }
          .site-publisher__steps {
            grid-column: auto;
            grid-row: auto;
          }
          .site-publisher__panel > button {
            width: 100%;
          }
        }
        @media (max-width: 760px) {
          .site-publisher {
            width: 100%;
            max-width: 100%;
            padding: 14px;
          }
          .site-publisher__panel,
          .site-publisher__history {
            padding: 20px;
          }
          .site-publisher__history-head {
            display: grid;
          }
          .site-publisher__history-actions {
            justify-content: start;
          }
        }
      `}</style>
    </div>
  );
}

export const sitePublisherField = ({ label = '发布网站更新' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: SitePublisherInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
