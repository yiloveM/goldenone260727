import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApiUrl, readAdminJson } from '../lib/admin-client';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type SourceType = 'all' | 'products' | 'blog';

type LocaleOption = {
  value: string;
  label: string;
};

type TranslationResult = {
  queued?: boolean;
  requestId?: string;
  actionsUrl?: string;
  generated: Array<{ type: string; locale: string; slug: string; path: string; keySlot?: number; attempts?: number }>;
  skipped: Array<{ type: string; locale: string; slug: string; reason: string }>;
  errors: Array<{ type: string; locale: string; slug: string; message: string; attempts?: number; keySlots?: number[]; failureKind?: string }>;
  resultStatus?: 'success' | 'partial_success' | 'failure';
  resultStatusLabel?: string;
  apiKeyCount?: number;
  workflow?: {
    branch: string;
    sourceType: SourceType;
    locales: string[];
    sourceSlug?: string;
    requestId?: string;
  };
  previews?: Array<{
    type: string;
    locale: string;
    slug: string;
    title: string;
    description: string;
    contentExcerpt: string;
    specPreview?: Array<{ label: string; value: string }>;
    tablePreview?: {
      title: string;
      columns: string[];
      firstRow: string[];
    };
  }>;
  commit?: string;
};

type WorkflowStatus = {
  requestId: string;
  found: boolean;
  status: string;
  conclusion?: string;
  label: string;
  message?: string;
  actionsUrl?: string;
  run?: {
    id: number;
    title: string;
    htmlUrl: string;
    createdAt: string;
    startedAt: string;
    updatedAt: string;
  };
  jobs?: Array<{
    name: string;
    status: string;
    conclusion: string;
    htmlUrl: string;
    startedAt: string;
    completedAt: string;
  }>;
  result?: {
    requestId: string;
    sourceType?: string;
    sourceSlug?: string;
    locales?: string[];
    generatedAt?: string;
    htmlUrl?: string;
    resultStatus?: 'success' | 'partial_success' | 'failure';
    resultStatusLabel?: string;
    generated?: Array<{ type: string; locale: string; slug: string; path: string; keySlot?: number; attempts?: number }>;
    skipped?: Array<{ type: string; locale: string; slug: string; reason: string }>;
    errors?: Array<{ type: string; locale: string; slug: string; message: string; friendlyMessage?: string; attempts?: number; keySlots?: number[]; failureKind?: string }>;
  } | null;
};

const sourceTypeOptions: Array<{ value: SourceType; label: string }> = [
  { value: 'all', label: '不填 slug 时：批量翻译产品和文章' },
  { value: 'products', label: '不填 slug 时：只批量翻译产品' },
  { value: 'blog', label: '不填 slug 时：只批量翻译文章' },
];
const apiKeyOffsetStorageKey = 'businessweb-ai-translation-api-key-offset';

const nextApiKeyOffset = () => {
  if (typeof window === 'undefined') return Date.now();
  try {
    const current = Number(window.localStorage.getItem(apiKeyOffsetStorageKey) || '0');
    const next = Number.isFinite(current) ? Math.trunc(current) + 1 : Date.now();
    window.localStorage.setItem(apiKeyOffsetStorageKey, String(next));
    return next;
  } catch {
    return Date.now();
  }
};

type TranslationResultSummary = NonNullable<WorkflowStatus['result']>;

const translationOutcomeTone = (result?: TranslationResultSummary | null, fallback = 'unknown') => {
  if (!result) return fallback;
  const generated = result.generated?.length || 0;
  const skipped = result.skipped?.length || 0;
  const errors = result.errors?.length || 0;
  if (errors && (generated || skipped)) return 'partial';
  if (errors) return 'failure';
  return 'success';
};

const translationOutcomeMessage = (result: TranslationResultSummary) => {
  const generated = result.generated?.length || 0;
  const skipped = result.skipped?.length || 0;
  const errors = result.errors?.length || 0;
  if (errors && generated) return '任务部分成功：已生成的草稿可以继续审核，失败的语言已列在下面，可稍后只重试失败项。';
  if (errors && skipped) return '任务部分完成：已有草稿被跳过，失败的语言已列在下面，可稍后只重试失败项。';
  if (errors) return '任务没有生成可用草稿。请查看失败明细，更换可用 AI Key 后重试。';
  if (generated) return '翻译任务已完成。请打开“产品翻译草稿”或“文章翻译草稿”审核。';
  if (skipped) return '任务已完成，没有新增草稿；本次目标草稿已经存在。';
  return '任务已结束，但没有产生新草稿、跳过项或错误。请打开任务记录确认输入范围。';
};

const translationOutcomeLabel = (result?: TranslationResultSummary | null) => {
  if (!result) return '';
  if (result.resultStatusLabel) return result.resultStatusLabel;
  const generated = result.generated?.length || 0;
  const skipped = result.skipped?.length || 0;
  const errors = result.errors?.length || 0;
  if (errors && (generated || skipped)) return '部分成功';
  if (errors) return '全部失败';
  return '全部成功';
};

function AiTranslatorInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('all');
  const [availableLocaleOptions, setAvailableLocaleOptions] = useState<LocaleOption[]>([]);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [sourceSlug, setSourceSlug] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [running, setRunning] = useState<'idle' | 'generate'>('idle');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [error, setError] = useState('');

  useSyncedSurfaceTheme(rootRef, 'ai');

  useEffect(() => {
    let disposed = false;
    fetch(adminApiUrl('ai/translation-locales'), { headers: { accept: 'application/json' } })
      .then(async response => {
        return readAdminJson<{ locales?: LocaleOption[] }>(response, '无法读取网站语言设置。');
      })
      .then(result => {
        if (disposed) return;
        const next = Array.isArray(result.locales) ? result.locales.filter(item => item?.value && item?.label) : [];
        setAvailableLocaleOptions(next);
        setSelectedLocales(next.map(item => item.value));
      })
      .catch(() => {
        if (!disposed) setError('无法读取已启用的目标语言。请先在“网站语言”页面勾选并保存目标语言。');
      });
    return () => { disposed = true; };
  }, []);

  const localeLabel = useMemo(() => {
    if (!availableLocaleOptions.length) return '尚未配置目标语言';
    if (selectedLocales.length === availableLocaleOptions.length) return '全部已启用语言';
    if (!selectedLocales.length) return '未选择语言';
    return availableLocaleOptions
      .filter(option => selectedLocales.includes(option.value))
      .map(option => option.label)
      .join(', ');
  }, [availableLocaleOptions, selectedLocales]);

  const toggleLocale = (value: string) => {
    setSelectedLocales(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  };

  const runTranslation = useCallback(async () => {
    if (!selectedLocales.length) {
      setError('请至少选择一种目标语言。');
      return;
    }

    setRunning('generate');
    setError('');
    setStatusError('');
    setResult(null);
    setWorkflowStatus(null);

    try {
      const response = await fetch(adminApiUrl('ai/translations'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          locales: selectedLocales,
          sourceSlug: sourceSlug.trim() || undefined,
          overwrite,
          apiKeyOffset: nextApiKeyOffset(),
        }),
      });

      setResult(await readAdminJson<TranslationResult>(response, 'AI 翻译任务提交失败。'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 翻译任务失败，请稍后重试。');
    } finally {
      setRunning('idle');
    }
  }, [overwrite, selectedLocales, sourceSlug, sourceType]);

  useEffect(() => {
    const requestId = result?.requestId;
    if (!requestId) return;

    let disposed = false;
    let timer: number | undefined;

    const pollStatus = async () => {
      try {
        const response = await fetch(adminApiUrl(`ai/translation-status?requestId=${encodeURIComponent(requestId)}`), {
          headers: { accept: 'application/json' },
        });
        const nextStatus = await readAdminJson<WorkflowStatus>(response, '读取后台任务状态失败。');
        if (disposed) return;
        setWorkflowStatus(nextStatus);
        setStatusError('');

        if (nextStatus.status !== 'completed') {
          timer = window.setTimeout(pollStatus, nextStatus.found ? 10000 : 6000);
        }
      } catch (err) {
        if (disposed) return;
        setStatusError(err instanceof Error ? err.message : '读取后台任务状态失败，请稍后刷新。');
        timer = window.setTimeout(pollStatus, 15000);
      }
    };

    pollStatus();

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [result?.requestId]);

  const workflowTone = workflowStatus
    ? translationOutcomeTone(workflowStatus.result, workflowStatus.conclusion || workflowStatus.status)
    : 'waiting';

  return (
    <div ref={rootRef} className="ai-translator">
      <div className="ai-translator__header">
        <div>
          <span className="ai-translator__eyebrow">AI 处理</span>
          <h2>AI 自动翻译助手</h2>
          <p>把英文产品详情页和英文技术文章翻译成其它语言。AI 会在后台生成待审核草稿，不会直接上线；管理员审核后打开“审核后发布”才会显示到前台。</p>
        </div>
      </div>

      <div className="ai-translator__guide">
        <strong>管理员按这个顺序操作：</strong>
        <ol>
          <li>先选“要翻译什么内容”和“目标语言”。</li>
          <li>不填 slug 时，会按“要翻译什么内容”批量生成草稿。</li>
          <li>填写 slug 时，只翻译这个 slug 对应的一个页面；选“产品和文章”会自动判断它是产品还是文章。</li>
          <li>点击“提交后台 AI 翻译任务”。任务提交后可以关闭当前页面，后台会继续处理。</li>
          <li>AI 处理通道必须由站长提前配置好；后台这里只负责提交任务，不需要管理员填写密钥。</li>
          <li>如果站长配置了多个 AI 处理通道，后台会自动轮换，避免单个通道额度不够。</li>
          <li>等待后台任务完成后，到“产品翻译草稿”或“文章翻译草稿”逐个检查，确认后打开“审核后发布”并保存。</li>
        </ol>
      </div>

      <div className="ai-translator__grid">
        <label className="ai-translator__field">
          <span>要翻译什么内容（只在不填 slug 时用于批量生成）</span>
          <select value={sourceType} onChange={event => setSourceType(event.currentTarget.value as SourceType)}>
            {sourceTypeOptions.map(option => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="ai-translator__field">
          <span>只翻译某一个页面的 slug（留空就是批量生成）</span>
          <input
            value={sourceSlug}
            onChange={event => setSourceSlug(event.currentTarget.value)}
            placeholder="产品或文章网址最后一段，例如 xxx"
          />
          <small>例：填产品详情页 slug，就只生成该产品的翻译；填文章 slug，就只生成该文章的翻译。</small>
        </label>
      </div>

      <div className="ai-translator__locale-panel">
        <div className="ai-translator__locale-head">
          <strong>要生成哪些语言</strong>
          <span>{localeLabel}</span>
          <button type="button" onClick={() => setSelectedLocales(availableLocaleOptions.map(option => option.value))} disabled={!availableLocaleOptions.length}>全选</button>
          <button type="button" onClick={() => setSelectedLocales([])}>清空</button>
        </div>
        <div className="ai-translator__locale-grid">
          {availableLocaleOptions.map(option => (
            <label key={option.value} className="ai-translator__check">
              <input
                type="checkbox"
                checked={selectedLocales.includes(option.value)}
                onChange={() => toggleLocale(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {!availableLocaleOptions.length && <p>请由站长先在“网站语言”页面勾选并保存目标语言，然后刷新此页面。</p>}
        </div>
      </div>

      <label className="ai-translator__overwrite">
        <input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.currentTarget.checked)} />
        <span>重新翻译并覆盖已有草稿（一般不要勾选）</span>
      </label>

      <div className="ai-translator__actions">
        <button type="button" disabled={running !== 'idle'} onClick={() => runTranslation()}>
          {running === 'generate' ? '正在提交后台任务...' : '提交后台 AI 翻译任务'}
        </button>
      </div>

      {error ? <div className="ai-translator__notice ai-translator__notice--error">{error}</div> : null}

      {result ? (
        <div className="ai-translator__result">
          {result.queued ? (
            <div className="ai-translator__queued">
              <strong>后台任务已提交</strong>
              <span>任务编号：{result.requestId || '等待生成'}。页面会自动刷新任务状态；也可以打开后台任务链接查看详细记录。</span>
            </div>
          ) : (
            <>
              <div>
                <strong>{result.generated.length}</strong>
                <span>生成草稿</span>
              </div>
              <div>
                <strong>{result.skipped.length}</strong>
                <span>跳过已有草稿</span>
              </div>
              <div>
                <strong>{result.errors.length}</strong>
                <span>生成失败</span>
              </div>
            </>
          )}
          {result.errors.length ? (
            <ul>
              {result.errors.slice(0, 8).map(item => (
                <li key={`${item.type}-${item.locale}-${item.slug}`}>{item.type} / {item.locale} / {item.slug}: {item.message}</li>
              ))}
            </ul>
          ) : null}
          {result.previews?.length ? (
            <div className="ai-translator__previews">
              <h3>本次生成的草稿预览</h3>
              {result.previews.map(item => (
                <article key={`${item.type}-${item.locale}-${item.slug}`}>
                  <span>{item.type === 'product' ? '产品' : '文章'} / {item.locale} / {item.slug}</span>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  {item.specPreview?.length ? (
                    <ul>
                      {item.specPreview.map(spec => <li key={spec.label}><strong>{spec.label}</strong>: {spec.value}</li>)}
                    </ul>
                  ) : null}
                  {item.tablePreview ? (
                    <p><strong>{item.tablePreview.title}</strong>: {item.tablePreview.columns.join(' | ')} / {item.tablePreview.firstRow.join(' | ')}</p>
                  ) : null}
                  <p>{item.contentExcerpt}</p>
                </article>
              ))}
            </div>
          ) : null}
          {result.apiKeyCount && result.apiKeyCount > 1 ? <p>本次任务已启用 {result.apiKeyCount} 个 AI 处理通道轮询。</p> : null}
          {result.commit ? <p>草稿已保存到后台。请到“产品翻译草稿”或“文章翻译草稿”审核，确认后打开“审核后发布”。版本号：{result.commit.slice(0, 7)}</p> : null}
          {result.workflow ? <p>任务范围：{result.workflow.sourceSlug || '批量生成'} / {result.workflow.locales.join(', ')}</p> : null}
          {result.actionsUrl ? <p><a href={result.actionsUrl} target="_blank" rel="noreferrer">打开后台任务列表</a></p> : null}
          {statusError ? <div className="ai-translator__notice ai-translator__notice--error">{statusError}</div> : null}
          {workflowStatus ? (
            <div className={`ai-translator__workflow ai-translator__workflow--${workflowTone}`}>
              <div>
                <strong>{translationOutcomeLabel(workflowStatus.result) || workflowStatus.label}</strong>
                <span>{workflowStatus.found ? `后台任务状态：${workflowStatus.status}${workflowStatus.conclusion ? ` / ${workflowStatus.conclusion}` : ''}` : workflowStatus.message}</span>
              </div>
              {workflowStatus.run?.htmlUrl ? <a href={workflowStatus.run.htmlUrl} target="_blank" rel="noreferrer">查看本次任务记录</a> : null}
              {workflowStatus.status === 'completed' && workflowStatus.result ? (
                <p>{translationOutcomeMessage(workflowStatus.result)}</p>
              ) : null}
              {workflowStatus.status === 'completed' && !workflowStatus.result && workflowStatus.conclusion === 'success' ? (
                <p>翻译任务已完成。请打开“产品翻译草稿”或“文章翻译草稿”审核；如果没有新增草稿，请查看下面的“跳过草稿”。</p>
              ) : null}
              {workflowStatus.status === 'completed' && !workflowStatus.result && workflowStatus.conclusion && workflowStatus.conclusion !== 'success' ? (
                <p>任务未成功完成。请打开记录查看具体原因，常见原因包括 AI 处理通道未配置、AI 额度不足、后台任务权限不足或某个内容处理失败。</p>
              ) : null}
              {workflowStatus.jobs?.length ? (
                <ul>
                  {workflowStatus.jobs.map(job => (
                    <li key={job.name}>
                      {job.name}: {job.status}{job.conclusion ? ` / ${job.conclusion}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              {workflowStatus.result ? (
                <div className="ai-translator__task-result">
                  <strong>本次任务结果</strong>
                  <div className="ai-translator__result-counts">
                    <span>生成：{workflowStatus.result.generated?.length || 0}</span>
                    <span>跳过：{workflowStatus.result.skipped?.length || 0}</span>
                    <span className="is-failure">失败：{workflowStatus.result.errors?.length || 0}</span>
                  </div>
                  {workflowStatus.result.htmlUrl ? <a href={workflowStatus.result.htmlUrl} target="_blank" rel="noreferrer">查看结果记录文件</a> : null}
                  {workflowStatus.result.generated?.length ? (
                    <div>
                      <strong>已生成草稿</strong>
                      <ul>
                        {workflowStatus.result.generated.slice(0, 12).map(item => {
                          const previewType = item.type === 'blog' ? 'blog' : 'product';
                          const previewHref = adminApiUrl(`ai/draft-preview?type=${previewType}&draft=${encodeURIComponent(`${item.locale}--${item.slug}`)}`);
                          return (
                            <li key={`${item.type}-${item.locale}-${item.slug}`}>
                              {item.type} / {item.locale} / {item.slug}
                              {item.keySlot ? ` / AI 通道 ${item.keySlot}` : ''}
                              {item.attempts && item.attempts > 1 ? ` / 重试 ${item.attempts - 1} 次` : ''}
                              {' '}<a href={previewHref} target="_blank" rel="noreferrer">预览</a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {workflowStatus.result.skipped?.length ? (
                    <div>
                      <strong>跳过草稿</strong>
                      <p>这些草稿文件已经存在，本次没有覆盖。需要重新生成时，请勾选“重新翻译并覆盖已有草稿”后再提交。</p>
                      <ul>
                        {workflowStatus.result.skipped.slice(0, 12).map(item => (
                          <li key={`${item.type}-${item.locale}-${item.slug}`}>{item.type} / {item.locale} / {item.slug}: {item.reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {workflowStatus.result.errors?.length ? (
                    <div className="ai-translator__failure-list">
                      <strong>失败明细</strong>
                      <ul>
                        {workflowStatus.result.errors.slice(0, 12).map(item => (
                          <li key={`${item.type}-${item.locale}-${item.slug}`}>
                            {item.type} / {item.locale} / {item.slug}: {item.friendlyMessage || item.message}
                            {item.attempts && item.attempts > 1 ? ` / 已重试 ${item.attempts - 1} 次` : ''}
                            {item.keySlots?.length ? ` / 通道 ${item.keySlots.join(' -> ')}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {workflowStatus.result.generated?.length === 0 && workflowStatus.result.skipped?.length === 0 && workflowStatus.result.errors?.length === 0 ? (
                    <p>本次任务没有产生新草稿、跳过项或错误。请打开任务记录确认输入范围是否正确。</p>
                  ) : null}
                </div>
              ) : workflowStatus.status === 'completed' ? (
                <p>暂时没有读取到结果记录。请打开本次任务记录查看生成、跳过和错误输出。</p>
              ) : null}
            </div>
          ) : result.queued ? (
            <div className="ai-translator__workflow">
              <strong>正在连接后台任务状态...</strong>
              <span>如果 30 秒内仍无状态，请打开后台任务列表确认任务是否已启动。</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <style>{`
        .ai-translator {
          min-height: 72vh;
          width: calc(100vw - 330px);
          max-width: calc(100vw - 330px);
          margin: 0;
          padding: 30px;
          color: var(--ai-text);
          background: var(--ai-bg);
          border-radius: 8px;
          box-sizing: border-box;
        }
        .ai-translator__header,
        .ai-translator__guide,
        .ai-translator__locale-panel,
        .ai-translator__result {
          border: 1px solid var(--ai-border-soft);
          background: var(--ai-panel);
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 18px 54px rgba(10, 70, 90, .08);
        }
        .ai-translator__header {
          padding: 30px 34px;
          background:
            radial-gradient(circle at 88% 12%, rgba(47, 191, 211, .16), transparent 34%),
            linear-gradient(135deg, var(--ai-panel), var(--ai-muted-bg));
        }
        .ai-translator__header h2 {
          margin: 4px 0 8px;
          max-width: 980px;
          font-size: clamp(24px, 2.4vw, 34px);
          line-height: 1.08;
        }
        .ai-translator__header p,
        .ai-translator__guide li,
        .ai-translator__locale-head span,
        .ai-translator__result span {
          color: var(--ai-muted);
        }
        .ai-translator__queued {
          grid-column: 1 / -1;
          display: grid;
          gap: 8px;
        }
        .ai-translator__workflow {
          grid-column: 1 / -1;
          display: grid;
          gap: 10px;
          padding: 14px;
          border-radius: 8px;
          border: 1px solid var(--ai-border-soft);
          background: color-mix(in srgb, var(--ai-panel) 82%, #0e9fbd 18%);
        }
        .ai-translator__workflow--success {
          border-color: color-mix(in srgb, #20b486 55%, var(--ai-border-soft));
          background: color-mix(in srgb, var(--ai-panel) 78%, #20b486 22%);
        }
        .ai-translator__workflow--partial {
          border-color: color-mix(in srgb, #d89b22 55%, var(--ai-border-soft));
          background: color-mix(in srgb, var(--ai-panel) 80%, #d89b22 20%);
        }
        .ai-translator__workflow--failure,
        .ai-translator__workflow--timed_out,
        .ai-translator__workflow--cancelled {
          border-color: color-mix(in srgb, #d64545 55%, var(--ai-border-soft));
          background: color-mix(in srgb, var(--ai-panel) 80%, #d64545 20%);
        }
        .ai-translator__workflow--failure > div > strong,
        .ai-translator__result-counts .is-failure,
        .ai-translator__failure-list strong,
        .ai-translator__failure-list li {
          color: #b42318;
        }
        .ai-translator__workflow a {
          width: fit-content;
          color: #05748d;
          font-weight: 800;
        }
        .ai-translator__workflow p {
          margin: 0;
          color: var(--ai-muted);
          line-height: 1.55;
        }
        .ai-translator__workflow ul {
          margin: 0;
          padding-left: 20px;
          color: var(--ai-muted);
        }
        .ai-translator__task-result {
          display: grid;
          gap: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--ai-border-soft);
        }
        .ai-translator__result-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ai-translator__result-counts span {
          border: 1px solid var(--ai-border-soft);
          border-radius: 999px;
          padding: 5px 10px;
          color: var(--ai-text);
          background: var(--ai-panel);
          font-size: 12px;
          font-weight: 800;
        }
        .ai-translator__guide {
          margin-top: 14px;
          padding: 24px 30px;
        }
        .ai-translator__guide strong {
          display: block;
          margin-bottom: 8px;
          color: var(--ai-text);
        }
        .ai-translator__guide ol {
          margin: 0;
          padding-left: 22px;
        }
        .ai-translator__guide li {
          margin: 6px 0;
          line-height: 1.55;
        }
        .ai-translator__eyebrow {
          color: #0789a6;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .ai-translator__grid {
          display: grid;
          grid-template-columns: minmax(320px, .82fr) minmax(520px, 1.18fr);
          gap: 18px;
          margin: 18px 0;
        }
        .ai-translator__field {
          display: grid;
          gap: 8px;
          font-weight: 700;
        }
        .ai-translator select,
        .ai-translator input[type='text'],
        .ai-translator input:not([type]),
        .ai-translator__field input {
          min-height: 40px;
          border: 1px solid var(--ai-border);
          border-radius: 6px;
          padding: 0 12px;
          color: var(--ai-text);
          background: var(--ai-muted-bg);
        }
        .ai-translator__locale-head {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
        }
        .ai-translator__locale-head strong {
          margin-right: auto;
        }
        .ai-translator__locale-head button,
        .ai-translator__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .ai-translator__actions button {
          border: 1px solid rgba(6, 142, 172, .28);
          border-radius: 6px;
          background: linear-gradient(135deg, #0e98b9, #33d0ca);
          color: #fff;
          font-weight: 800;
          min-height: 38px;
          padding: 0 14px;
          cursor: pointer;
        }
        .ai-translator__locale-head button {
          min-height: 30px;
          padding: 0 10px;
          background: var(--ai-muted-bg);
          color: var(--ai-text);
        }
        .ai-translator__locale-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
          gap: 8px;
        }
        .ai-translator__check,
        .ai-translator__overwrite {
          display: flex;
          gap: 8px;
          align-items: center;
          border: 1px solid var(--ai-border-soft);
          background: var(--ai-muted-bg);
          border-radius: 6px;
          padding: 9px 10px;
        }
        .ai-translator__overwrite {
          margin: 16px 0;
        }
        .ai-translator__actions button:disabled {
          opacity: .58;
          cursor: wait;
        }
        .ai-translator__notice {
          margin-top: 14px;
          border-radius: 6px;
          padding: 12px 14px;
        }
        .ai-translator__notice--error {
          border: 1px solid rgba(220, 38, 38, .34);
          background: rgba(220, 38, 38, .11);
          color: #dc2626;
        }
        .ai-translator__result {
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .ai-translator__result div {
          border: 1px solid var(--ai-border-soft);
          border-radius: 6px;
          padding: 12px;
          background: var(--ai-muted-bg);
        }
        .ai-translator__result strong {
          display: block;
          font-size: 24px;
        }
        .ai-translator__result ul,
        .ai-translator__result p {
          grid-column: 1 / -1;
          margin: 0;
        }
        .ai-translator__previews {
          grid-column: 1 / -1;
          display: grid;
          gap: 12px;
        }
        .ai-translator__previews h3 {
          margin: 0;
          font-size: 16px;
        }
        .ai-translator__previews article {
          border: 1px solid var(--ai-border-soft);
          border-radius: 8px;
          padding: 14px;
          background: var(--ai-muted-bg);
        }
        .ai-translator__previews article span {
          display: block;
          margin-bottom: 6px;
          color: var(--ai-muted);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ai-translator__previews h4 {
          margin: 0 0 8px;
          font-size: 16px;
        }
        .ai-translator__previews ul {
          margin: 8px 0;
          padding-left: 18px;
        }
        @media (max-width: 760px) {
          .ai-translator {
            width: 100%;
            max-width: 100%;
            padding: 14px;
          }
          .ai-translator__grid,
          .ai-translator__result {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export const aiTranslatorField = ({ label = 'AI 翻译助手' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: AiTranslatorInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
