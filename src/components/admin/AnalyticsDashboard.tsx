import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiUrl, adminRequestHeaders, readAdminJson } from '../../lib/admin-client';
import './analytics-dashboard.css';

type RankedRow = {
  label: string;
  secondary: string;
  value: number;
  visitors: number;
};

type AdjustmentMetric = 'pageviews' | 'visitors' | 'landings';

type AnalyticsAdjustment = {
  id: string;
  day: string;
  metric: AdjustmentMetric;
  delta: number;
  source: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};

type AnalyticsPayload = {
  ok: boolean;
  role: 'keystatic' | 'manager';
  status: {
    enabled: boolean;
    databaseBound: boolean;
    ipMode: 'none' | 'network' | 'full';
    retentionDays: number;
    visitorIdentity: 'hmac' | 'disabled';
  };
  analytics: {
    generatedAt: string;
    range: { days: number; start: string; end: string };
    summary: {
      pageviews: number;
      visitors: number;
      landings: number;
      pagesPerVisitor: number;
      previous: { pageviews: number; visitors: number; landings: number };
      raw: {
        pageviews: number;
        visitors: number;
        landings: number;
        previous: { pageviews: number; visitors: number; landings: number };
      };
      adjustments: {
        pageviews: number;
        visitors: number;
        landings: number;
        previous: { pageviews: number; visitors: number; landings: number };
      };
    };
    timeseries: Array<{
      day: string;
      pageviews: number;
      visitors: number;
      landings: number;
    }>;
    topPages: RankedRow[];
    landingPages: RankedRow[];
    sources: RankedRow[];
    keywords: RankedRow[];
    countries: RankedRow[];
    devices: RankedRow[];
    locales: RankedRow[];
    referrers: RankedRow[];
    campaigns: RankedRow[];
    recent: Array<{
      occurredAt: number;
      path: string;
      source: string;
      medium: string;
      campaign: string;
      ipAddress: string;
      country: string;
      region: string;
      city: string;
      device: string;
      browser: string;
      visitorKey: string;
    }>;
  };
  searchConsole: {
    configured: boolean;
    available: boolean;
    cached?: boolean;
    stale?: boolean;
    property?: string;
    range?: { start: string; end: string };
    totals?: {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };
    timeseries?: Array<{
      day: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    queries?: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    pages?: Array<{
      page: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    message?: string;
  };
  adjustments: AnalyticsAdjustment[];
  message?: string;
};

type AnalyticsDashboardProps = {
  surface: 'keystatic' | 'manager';
};

const dayOptions = [7, 30, 90, 180, 365] as const;
const numberFormatter = new Intl.NumberFormat('zh-CN');
const decimalFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const formatNumber = (value: number) => numberFormatter.format(Math.round(value || 0));
const formatDecimal = (value: number) => decimalFormatter.format(value || 0);
const formatPercent = (value: number) => `${formatDecimal((value || 0) * 100)}%`;
const signedNumber = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
const formatDateTime = (value: number | string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const deltaText = (current: number, previous: number) => {
  if (!previous) return current ? '上期无数据' : '与上期持平';
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? '+' : ''}${formatDecimal(change)}% 对比上期`;
};

const metricLabels: Record<AdjustmentMetric, string> = {
  pageviews: '页面浏览',
  visitors: '独立访客',
  landings: '落地访问',
};

const ipModeLabels: Record<AnalyticsPayload['status']['ipMode'], string> = {
  none: '不保存',
  network: '匿名网段',
  full: '完整地址',
};

const emptyAdjustmentForm = () => ({
  id: '',
  day: new Date().toISOString().slice(0, 10),
  metric: 'visitors' as AdjustmentMetric,
  delta: '',
  source: '',
  note: '',
});

const withAdjustment = (detail: string, delta: number) => (delta ? `${detail} · 校准 ${signedNumber(delta)}` : detail);

const shareOf = (value: number, total: number) => (total > 0 ? value / total : 0);

const isOrganicSource = (row: RankedRow) => {
  const value = `${row.label} ${row.secondary}`.toLowerCase();
  return /organic|google|bing|baidu|yahoo|duckduckgo|yandex|naver/.test(value);
};

const queryRecommendation = (row: NonNullable<AnalyticsPayload['searchConsole']['queries']>[number]) => {
  if (row.position > 10 && row.position <= 20) return '补强正文主题覆盖和站内链接，争取进入第一页。';
  if (row.position <= 10 && row.ctr < 0.03) return '优先优化 SEO 标题和摘要，提高搜索结果点击率。';
  if (row.position > 20) return '建立更匹配搜索意图的专题、产品或文章页面。';
  return '保持排名，并扩展相关长尾词与 FAQ。';
};

const pageRecommendation = (row: NonNullable<AnalyticsPayload['searchConsole']['pages']>[number]) => {
  if (row.position <= 10 && row.ctr < 0.03) return '优化标题、摘要和首屏卖点。';
  if (row.position > 10) return '增加主题深度、内链和匹配查询的内容。';
  return '扩展关联关键词并强化询盘路径。';
};

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="bw-analytics__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Empty({ children = '暂无数据' }: { children?: string }) {
  return <div className="bw-analytics__empty">{children}</div>;
}

function LineChart({
  rows,
  primaryKey,
  secondaryKey,
}: {
  rows: Array<Record<string, string | number>>;
  primaryKey: string;
  secondaryKey: string;
}) {
  if (!rows.length) return <Empty />;
  const width = 720;
  const height = 220;
  const values = rows.flatMap(row => [Number(row[primaryKey] || 0), Number(row[secondaryKey] || 0)]);
  const max = Math.max(1, ...values);
  const points = (key: string) =>
    rows
      .map((row, index) => {
        const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
        const y = height - (Number(row[key] || 0) / max) * (height - 24) - 12;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const labels = rows.length <= 8 ? rows : rows.filter((_row, index) => index % Math.ceil(rows.length / 7) === 0);

  return (
    <div className="bw-analytics__chart-wrap">
      <svg className="bw-analytics__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="访问趋势折线图">
        {[0.25, 0.5, 0.75].map(value => (
          <line
            key={value}
            x1="0"
            x2={width}
            y1={height * value}
            y2={height * value}
            className="bw-analytics__grid-line"
          />
        ))}
        <polyline points={points(primaryKey)} className="bw-analytics__line bw-analytics__line--primary" />
        <polyline points={points(secondaryKey)} className="bw-analytics__line bw-analytics__line--secondary" />
      </svg>
      <div className="bw-analytics__chart-labels">
        {labels.map(row => (
          <span key={String(row.day)}>{String(row.day).slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

function RankedList({
  rows,
  secondary = false,
  total = 0,
}: {
  rows: RankedRow[];
  secondary?: boolean;
  total?: number;
}) {
  if (!rows.length) return <Empty />;
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <ol className="bw-analytics__ranking">
      {rows.map(row => (
        <li key={`${row.label}-${row.secondary}`}>
          <div className="bw-analytics__ranking-copy">
            <span title={row.label}>{row.label || 'Unknown'}</span>
            <small>
              {[secondary ? row.secondary : '', row.visitors ? `${formatNumber(row.visitors)} 位访客` : '']
                .filter(Boolean)
                .join(' · ') || '访问分布'}
            </small>
          </div>
          <div className="bw-analytics__bar" aria-hidden="true">
            <span style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
          </div>
          <span className="bw-analytics__ranking-value">
            <strong>{formatNumber(row.value)}</strong>
            {total ? <small>{formatPercent(shareOf(row.value, total))}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function AnalyticsDashboard({ surface }: AnalyticsDashboardProps) {
  const [days, setDays] = useState<(typeof dayOptions)[number]>(30);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustmentForm);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(adminApiUrl(`analytics/summary?days=${days}&surface=${surface}`), {
        headers: adminRequestHeaders(surface, { accept: 'application/json' }),
      });
      const payload = await readAdminJson<AnalyticsPayload>(response, '分析数据读取失败。');
      if (!payload.ok) throw new Error(payload.message || '分析数据读取失败。');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '分析数据读取失败。');
    } finally {
      setLoading(false);
    }
  }, [days, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAdjustment = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setAdjustmentBusy(true);
    setAdjustmentMessage('');
    try {
      const response = await fetch(adminApiUrl(`analytics/adjustments?surface=${surface}`), {
        method: 'POST',
        headers: adminRequestHeaders(surface, {
          accept: 'application/json',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          ...adjustmentForm,
          delta: Number(adjustmentForm.delta),
        }),
      });
      const payload = await readAdminJson<{ ok?: boolean; message?: string }>(response, '校准项保存失败。');
      if (!payload.ok) throw new Error(payload.message || '校准项保存失败。');
      setAdjustmentForm(emptyAdjustmentForm());
      setAdjustmentMessage('校准项已保存并立即生效，无需发布网站更新。');
      await load();
    } catch (saveError) {
      setAdjustmentMessage(saveError instanceof Error ? saveError.message : '校准项保存失败。');
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const removeAdjustment = async (adjustment: AnalyticsAdjustment) => {
    if (!window.confirm(`删除 ${adjustment.day} 的${metricLabels[adjustment.metric]}校准项？`)) return;
    setAdjustmentBusy(true);
    setAdjustmentMessage('');
    try {
      const response = await fetch(adminApiUrl(`analytics/adjustments?surface=${surface}`), {
        method: 'DELETE',
        headers: adminRequestHeaders(surface, {
          accept: 'application/json',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({ id: adjustment.id }),
      });
      const payload = await readAdminJson<{ ok?: boolean; message?: string }>(response, '校准项删除失败。');
      if (!payload.ok) throw new Error(payload.message || '校准项删除失败。');
      if (adjustmentForm.id === adjustment.id) setAdjustmentForm(emptyAdjustmentForm());
      setAdjustmentMessage('校准项已删除。');
      await load();
    } catch (deleteError) {
      setAdjustmentMessage(deleteError instanceof Error ? deleteError.message : '校准项删除失败。');
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const visitorTrend = useMemo(() => {
    if (!data) return [];
    return data.analytics.timeseries.map(row => ({ ...row }));
  }, [data]);

  if (!data && loading) return <div className="bw-analytics__loading">正在读取访问数据...</div>;
  if (!data && error) {
    return (
      <div className="bw-analytics__error" role="alert">
        <strong>数据读取失败</strong>
        <span>{error}</span>
        <button type="button" onClick={() => void load()}>
          重试
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { analytics, searchConsole, status } = data;
  const summary = analytics.summary;
  const organicVisits = analytics.sources.filter(isOrganicSource).reduce((total, row) => total + row.value, 0);
  const organicShare = shareOf(organicVisits, summary.pageviews);
  const leadingLanding = analytics.landingPages[0];
  const landingShare = shareOf(leadingLanding?.value || 0, summary.landings);
  const leadingCountry = analytics.countries[0];
  const trafficChange = summary.previous.pageviews
    ? (summary.pageviews - summary.previous.pageviews) / summary.previous.pageviews
    : null;
  const queryOpportunities = (searchConsole.queries || [])
    .filter(row => row.impressions > 0)
    .sort((left, right) => {
      const leftScore = left.impressions * (1 - Math.min(left.ctr, 0.2)) * (1 + Math.min(left.position, 30) / 30);
      const rightScore = right.impressions * (1 - Math.min(right.ctr, 0.2)) * (1 + Math.min(right.position, 30) / 30);
      return rightScore - leftScore;
    })
    .slice(0, 8);
  const pageOpportunities = (searchConsole.pages || [])
    .filter(row => row.impressions > 0)
    .sort((left, right) => right.impressions * (1 - right.ctr) - left.impressions * (1 - left.ctr))
    .slice(0, 8);
  const seoInsights = [
    {
      label: '自然搜索占比',
      value: formatPercent(organicShare),
      detail: `${formatNumber(organicVisits)} 次访问来自可识别搜索来源`,
      action:
        organicShare < 0.3
          ? '优先扩展可索引的产品、文章、FAQ 与主题内链。'
          : '继续放大已带来搜索访问的关键词和落地页。',
    },
    {
      label: '人均浏览深度',
      value: formatDecimal(summary.pagesPerVisitor),
      detail: '每位日去重访客平均查看的页面数',
      action:
        summary.pagesPerVisitor < 1.5
          ? '在高流量落地页补充相关产品、文章和明确下一步入口。'
          : '页面串联已有基础，继续检查重点产品的询盘路径。',
    },
    {
      label: '首要落地页占比',
      value: leadingLanding ? formatPercent(landingShare) : '-',
      detail: leadingLanding?.label || '尚无落地页数据',
      action:
        landingShare > 0.6
          ? '流量较集中，需培育更多可独立获客的产品和文章页面。'
          : '持续比较不同落地页的搜索曝光和访问质量。',
    },
    {
      label: '访问趋势',
      value: trafficChange === null ? '建立基线' : `${trafficChange > 0 ? '+' : ''}${formatPercent(trafficChange)}`,
      detail: leadingCountry ? `主要访问地区：${leadingCountry.label}` : '尚无地区数据',
      action:
        trafficChange !== null && trafficChange < 0
          ? '对照上期检查排名下降、内容更新和主要来源变化。'
          : '结合国家、语言和来源分布确定下一批内容主题。',
    },
  ];
  const setupNotices = [
    !status.enabled ? '访问采集当前已关闭。' : '',
    status.visitorIdentity !== 'hmac' ? '尚未设置独立访客哈希 Secret；页面浏览仍记录，但独立访客暂不计数。' : '',
  ].filter(Boolean);

  return (
    <div className="bw-analytics">
      <header className="bw-analytics__header">
        <div>
          <h1>网站访问分析</h1>
          <p>
            {analytics.range.start} 至 {analytics.range.end} · 数据按 UTC 统计
          </p>
        </div>
        <div className="bw-analytics__controls">
          <div className="bw-analytics__segments" aria-label="统计时间范围">
            {dayOptions.map(option => (
              <button
                type="button"
                key={option}
                className={option === days ? 'is-active' : ''}
                aria-pressed={option === days}
                onClick={() => setDays(option)}
              >
                {option} 天
              </button>
            ))}
          </div>
          <button className="bw-analytics__refresh" type="button" disabled={loading} onClick={() => void load()}>
            {loading ? '刷新中' : '刷新'}
          </button>
        </div>
      </header>

      {error ? <div className="bw-analytics__notice is-error">{error}</div> : null}
      {setupNotices.map(notice => (
        <div className="bw-analytics__notice" key={notice}>
          {notice}
        </div>
      ))}

      <section className="bw-analytics__metrics" aria-label="访问摘要">
        <Metric
          label="页面浏览"
          value={formatNumber(summary.pageviews)}
          detail={withAdjustment(
            deltaText(summary.pageviews, summary.previous.pageviews),
            summary.adjustments.pageviews,
          )}
        />
        <Metric
          label="日去重访客"
          value={formatNumber(summary.visitors)}
          detail={withAdjustment(deltaText(summary.visitors, summary.previous.visitors), summary.adjustments.visitors)}
        />
        <Metric
          label="落地访问"
          value={formatNumber(summary.landings)}
          detail={withAdjustment(deltaText(summary.landings, summary.previous.landings), summary.adjustments.landings)}
        />
        <Metric label="人均浏览" value={formatDecimal(summary.pagesPerVisitor)} detail="页面浏览 / 独立访客" />
      </section>

      <section className="bw-analytics__insights" aria-labelledby="seo-decision-heading">
        <div className="bw-analytics__panel-head">
          <div>
            <h2 id="seo-decision-heading">SEO 决策摘要</h2>
            <p>把访问、来源与落地页数据转换为本期优先检查项</p>
          </div>
        </div>
        <div className="bw-analytics__insight-grid">
          {seoInsights.map(insight => (
            <article className="bw-analytics__insight" key={insight.label}>
              <span>{insight.label}</span>
              <strong>{insight.value}</strong>
              <p>{insight.detail}</p>
              <small>{insight.action}</small>
            </article>
          ))}
        </div>
      </section>

      {surface === 'keystatic' ? (
        <section className="bw-analytics__panel bw-analytics__adjustments">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>付费数据校准</h2>
              <p>保存后立即写入 D1 并同步统计，无需发布网站更新</p>
            </div>
            <span className="bw-analytics__status">{data.adjustments.length} 项</span>
          </div>
          <form className="bw-analytics__adjustment-form" onSubmit={saveAdjustment}>
            <label>
              <span>日期</span>
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                required
                value={adjustmentForm.day}
                onChange={event =>
                  setAdjustmentForm(current => ({
                    ...current,
                    day: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>指标</span>
              <select
                value={adjustmentForm.metric}
                onChange={event =>
                  setAdjustmentForm(current => ({
                    ...current,
                    metric: event.target.value as AdjustmentMetric,
                  }))
                }
              >
                {Object.entries(metricLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>调整值（正/负）</span>
              <input
                type="number"
                step="1"
                min="-10000000"
                max="10000000"
                required
                value={adjustmentForm.delta}
                onChange={event =>
                  setAdjustmentForm(current => ({
                    ...current,
                    delta: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>数据来源</span>
              <input
                type="text"
                maxLength={80}
                required
                value={adjustmentForm.source}
                onChange={event =>
                  setAdjustmentForm(current => ({
                    ...current,
                    source: event.target.value,
                  }))
                }
              />
            </label>
            <label className="bw-analytics__adjustment-note">
              <span>校准原因</span>
              <input
                type="text"
                maxLength={240}
                required
                value={adjustmentForm.note}
                onChange={event =>
                  setAdjustmentForm(current => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
            <div className="bw-analytics__adjustment-actions">
              <button type="submit" disabled={adjustmentBusy}>
                {adjustmentForm.id ? '保存修改' : '新增校准'}
              </button>
              {adjustmentForm.id ? (
                <button
                  type="button"
                  disabled={adjustmentBusy}
                  onClick={() => setAdjustmentForm(emptyAdjustmentForm())}
                >
                  取消
                </button>
              ) : null}
            </div>
          </form>
          {adjustmentMessage ? (
            <div className="bw-analytics__inline-message" role="status">
              {adjustmentMessage}
            </div>
          ) : null}
          {data.adjustments.length ? (
            <div className="bw-analytics__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>指标</th>
                    <th>调整</th>
                    <th>来源</th>
                    <th>原因</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.adjustments.map(adjustment => (
                    <tr key={adjustment.id}>
                      <td>{adjustment.day}</td>
                      <td>{metricLabels[adjustment.metric]}</td>
                      <td>
                        <strong className={adjustment.delta > 0 ? 'is-positive' : 'is-negative'}>
                          {signedNumber(adjustment.delta)}
                        </strong>
                      </td>
                      <td title={adjustment.source}>{adjustment.source}</td>
                      <td title={adjustment.note}>{adjustment.note}</td>
                      <td>{formatDateTime(adjustment.updatedAt)}</td>
                      <td className="bw-analytics__row-actions">
                        <button
                          type="button"
                          disabled={adjustmentBusy}
                          onClick={() =>
                            setAdjustmentForm({
                              id: adjustment.id,
                              day: adjustment.day,
                              metric: adjustment.metric,
                              delta: String(adjustment.delta),
                              source: adjustment.source,
                              note: adjustment.note,
                            })
                          }
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={adjustmentBusy}
                          onClick={() => void removeAdjustment(adjustment)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>尚无人工校准项</Empty>
          )}
        </section>
      ) : null}

      <section className="bw-analytics__panel bw-analytics__trend">
        <div className="bw-analytics__panel-head">
          <div>
            <h2>访问趋势</h2>
            <p>每日页面浏览与独立访客，用于判断内容更新或排名变化后的整体走向</p>
          </div>
          <div className="bw-analytics__legend" aria-label="图例">
            <span>
              <i className="is-primary" />
              页面浏览
            </span>
            <span>
              <i className="is-secondary" />
              独立访客
            </span>
          </div>
        </div>
        <LineChart rows={visitorTrend} primaryKey="pageviews" secondaryKey="visitors" />
      </section>

      <div className="bw-analytics__grid bw-analytics__grid--two">
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>热门页面</h2>
              <p>比较访问量、独立访客和全站占比，识别应继续扩展的内容</p>
            </div>
          </div>
          <RankedList rows={analytics.topPages} total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>落地页</h2>
              <p>访客从外部或直接访问进入的首个页面，决定自然获客入口</p>
            </div>
          </div>
          <RankedList rows={analytics.landingPages} total={summary.landings} />
        </section>
      </div>

      <div className="bw-analytics__grid bw-analytics__grid--three">
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>访问来源</h2>
              <p>来源与媒介，判断自然搜索、直接访问和外部推荐的结构</p>
            </div>
          </div>
          <RankedList rows={analytics.sources} secondary total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>国家地区</h2>
              <p>Cloudflare 边缘地理信息，用于确定优先市场和本地化方向</p>
            </div>
          </div>
          <RankedList rows={analytics.countries} total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>设备浏览器</h2>
              <p>检查主要访问设备，决定移动端与兼容性优化优先级</p>
            </div>
          </div>
          <RankedList rows={analytics.devices} secondary total={summary.pageviews} />
        </section>
      </div>

      <div className="bw-analytics__grid bw-analytics__grid--three">
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>访问语言</h2>
              <p>实际访问的语言版本，和目标市场需求交叉判断翻译优先级</p>
            </div>
          </div>
          <RankedList rows={analytics.locales} total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>引荐域名</h2>
              <p>识别具体外链、平台和搜索引擎带来的访问</p>
            </div>
          </div>
          <RankedList rows={analytics.referrers} secondary total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>营销活动</h2>
              <p>按 UTM campaign 汇总；为空时说明链接尚未使用活动标记</p>
            </div>
          </div>
          <RankedList rows={analytics.campaigns} secondary total={summary.pageviews} />
        </section>
      </div>

      <section className="bw-analytics__section">
        <div className="bw-analytics__panel-head">
          <div>
            <h2>Google 搜索表现</h2>
            <p>
              {searchConsole.range
                ? `${searchConsole.range.start} 至 ${searchConsole.range.end}`
                : '连接 Search Console 后可分析曝光、点击、CTR 与排名机会'}
            </p>
          </div>
          {searchConsole.cached ? (
            <span className="bw-analytics__status">{searchConsole.stale ? '缓存数据' : '6 小时缓存'}</span>
          ) : null}
        </div>
        {!searchConsole.configured || !searchConsole.available ? (
          <Empty>{searchConsole.message || 'Search Console 暂无数据'}</Empty>
        ) : (
          <>
            <div className="bw-analytics__gsc-metrics">
              <Metric
                label="Google 点击"
                value={formatNumber(searchConsole.totals?.clicks || 0)}
                detail="从自然搜索结果进入网站"
              />
              <Metric
                label="搜索曝光"
                value={formatNumber(searchConsole.totals?.impressions || 0)}
                detail="网站出现在 Google 搜索结果的次数"
              />
              <Metric
                label="点击率"
                value={formatPercent(searchConsole.totals?.ctr || 0)}
                detail="点击 / 曝光，低值优先改标题与摘要"
              />
              <Metric
                label="平均排名"
                value={formatDecimal(searchConsole.totals?.position || 0)}
                detail="按曝光加权，数值越小越靠前"
              />
            </div>
            <div className="bw-analytics__table-grid">
              <div className="bw-analytics__table-wrap">
                <h3>搜索关键词</h3>
                <table>
                  <thead>
                    <tr>
                      <th>关键词</th>
                      <th>点击</th>
                      <th>曝光</th>
                      <th>CTR</th>
                      <th>排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(searchConsole.queries || []).slice(0, 20).map(row => (
                      <tr key={row.query}>
                        <td title={row.query}>{row.query}</td>
                        <td>{formatNumber(row.clicks)}</td>
                        <td>{formatNumber(row.impressions)}</td>
                        <td>{formatPercent(row.ctr)}</td>
                        <td>{formatDecimal(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bw-analytics__table-wrap">
                <h3>Google 落地页</h3>
                <table>
                  <thead>
                    <tr>
                      <th>页面</th>
                      <th>点击</th>
                      <th>曝光</th>
                      <th>CTR</th>
                      <th>排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(searchConsole.pages || []).slice(0, 20).map(row => (
                      <tr key={row.page}>
                        <td title={row.page}>{row.page}</td>
                        <td>{formatNumber(row.clicks)}</td>
                        <td>{formatNumber(row.impressions)}</td>
                        <td>{formatPercent(row.ctr)}</td>
                        <td>{formatDecimal(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bw-analytics__opportunity-grid">
              <div className="bw-analytics__table-wrap">
                <h3>关键词优先优化机会</h3>
                {queryOpportunities.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>关键词</th>
                        <th>曝光</th>
                        <th>CTR</th>
                        <th>排名</th>
                        <th>建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryOpportunities.map(row => (
                        <tr key={`opportunity-${row.query}`}>
                          <td title={row.query}>{row.query}</td>
                          <td>{formatNumber(row.impressions)}</td>
                          <td>{formatPercent(row.ctr)}</td>
                          <td>{formatDecimal(row.position)}</td>
                          <td className="bw-analytics__advice">{queryRecommendation(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>暂时没有可计算的关键词机会</Empty>
                )}
              </div>
              <div className="bw-analytics__table-wrap">
                <h3>页面优先优化机会</h3>
                {pageOpportunities.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>页面</th>
                        <th>曝光</th>
                        <th>CTR</th>
                        <th>排名</th>
                        <th>建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageOpportunities.map(row => (
                        <tr key={`opportunity-${row.page}`}>
                          <td title={row.page}>{row.page}</td>
                          <td>{formatNumber(row.impressions)}</td>
                          <td>{formatPercent(row.ctr)}</td>
                          <td>{formatDecimal(row.position)}</td>
                          <td className="bw-analytics__advice">{pageRecommendation(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>暂时没有可计算的页面机会</Empty>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <div className="bw-analytics__grid bw-analytics__grid--two">
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>可见关键词</h2>
              <p>来自 UTM term 或仍携带查询词的来源，用来补充 Search Console 数据</p>
            </div>
          </div>
          <RankedList rows={analytics.keywords} secondary total={summary.pageviews} />
        </section>
        <section className="bw-analytics__panel">
          <div className="bw-analytics__panel-head">
            <div>
              <h2>采集状态</h2>
              <p>确认数据口径、保留时间和当前后台权限</p>
            </div>
          </div>
          <dl className="bw-analytics__definition-list">
            <div>
              <dt>数据保留</dt>
              <dd>{status.retentionDays} 天</dd>
            </div>
            <div>
              <dt>IP 保存</dt>
              <dd>{ipModeLabels[status.ipMode]}</dd>
            </div>
            <div>
              <dt>访客标识</dt>
              <dd>{status.visitorIdentity === 'hmac' ? '已启用' : '未启用'}</dd>
            </div>
            <div>
              <dt>本期校准</dt>
              <dd>
                PV {signedNumber(summary.adjustments.pageviews)} / UV {signedNumber(summary.adjustments.visitors)}
              </dd>
            </div>
            <div>
              <dt>后台权限</dt>
              <dd>{data.role === 'keystatic' ? '站长级' : '内容管理员级'}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="bw-analytics__panel">
        <div className="bw-analytics__panel-head">
          <div>
            <h2>近期访问</h2>
            <p>最多显示 40 条公开 HTML 页面访问，用来抽查真实落地路径、来源和设备</p>
          </div>
        </div>
        <div className="bw-analytics__table-wrap">
          {analytics.recent.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>页面</th>
                  <th>来源</th>
                  <th>IP / 国家</th>
                  <th>城市 / 地区</th>
                  <th>设备</th>
                  <th>访客标识</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recent.map((row, index) => (
                  <tr key={`${row.occurredAt}-${row.visitorKey}-${index}`}>
                    <td>{formatDateTime(row.occurredAt)}</td>
                    <td title={row.path}>{row.path}</td>
                    <td>
                      {row.source}
                      {row.medium && row.medium !== 'none' ? ` / ${row.medium}` : ''}
                    </td>
                    <td>
                      <span className="bw-analytics__ip-country">
                        <strong>{row.ipAddress || '-'}</strong>
                        <small>{row.country || 'Unknown'}</small>
                      </span>
                    </td>
                    <td>{[row.city, row.region].filter(Boolean).join(', ') || '-'}</td>
                    <td>
                      {row.device} / {row.browser}
                    </td>
                    <td>{row.visitorKey || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </div>
      </section>
    </div>
  );
}

export default AnalyticsDashboard;
