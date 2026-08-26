import { useRef } from 'react';
import AnalyticsDashboard from '../components/admin/AnalyticsDashboard';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

function AnalyticsDashboardInput() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSyncedSurfaceTheme(rootRef, 'wa');

  return (
    <div ref={rootRef} style={{ width: '100%', minWidth: 0, padding: '8px 0 24px' }}>
      <AnalyticsDashboard surface="keystatic" />
    </div>
  );
}

export const analyticsDashboardField = ({ label = '网站访问分析' } = {}) => ({
  kind: 'form' as const,
  label,
  Input: AnalyticsDashboardInput,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: (value: string) => value,
  reader: {
    parse: () => '',
  },
});
