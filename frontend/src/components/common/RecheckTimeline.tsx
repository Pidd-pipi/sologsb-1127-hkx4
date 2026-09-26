import { Space, Timeline, Typography } from 'antd';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';
import type { RecheckRecord } from '../../types/rectify';

const DOT_COLORS: Record<string, string> = {
  已整改: 'green',
  复发: 'red',
  待整改: 'orange',
};

interface RecheckTimelineProps {
  /** 复检记录，调用方需已按时间倒序排列 */
  records: RecheckRecord[];
}

/** 复检记录时间线：按时间展示历次复检的结论、日期、说明与检查人 */
export default function RecheckTimeline({ records }: RecheckTimelineProps) {
  if (!records.length) {
    return <EmptyState title="暂无复检记录" description="登记复检后在此按时间展示历次记录" compact />;
  }
  return (
    <Timeline
      style={{ marginTop: 8 }}
      items={records.map((r) => ({
        key: r.id,
        color: DOT_COLORS[r.conclusion] ?? 'blue',
        children: (
          <Space direction="vertical" size={2} data-testid={`recheck-item-${r.id}`}>
            <Space size={8} wrap>
              <Typography.Text strong>{r.date}</Typography.Text>
              <StatusBadge value={r.conclusion} kind="rectify" />
              <Typography.Text type="secondary" className="gb-muted">
                检查人：{r.inspector}
              </Typography.Text>
            </Space>
            {r.note ? (
              <Typography.Text>{r.note}</Typography.Text>
            ) : (
              <Typography.Text type="secondary" className="gb-muted">
                未填写复检说明
              </Typography.Text>
            )}
          </Space>
        ),
      }))}
    />
  );
}
