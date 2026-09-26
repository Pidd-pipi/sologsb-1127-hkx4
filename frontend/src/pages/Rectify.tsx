import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import { useInspectionFilter } from '../hooks/useInspectionFilter';
import { usePointStore } from '../stores/pointStore';
import { DISTRICTS, FACILITY_TYPES } from '../types/point';
import {
  RECTIFY_STATUSES,
  RECHECK_RESULTS,
  latestRecheck,
  type RecheckRecord,
  type RecheckResult,
  type RectifyPlan,
  type RectifyStatus,
} from '../types/rectify';
import { isOverdue, todayStr } from '../utils/format';

interface RecheckFormDraft {
  result: RecheckResult;
  date: string;
  note: string;
  inspector: string;
}

const DEFAULT_INSPECTOR = '督导员 李维';

export default function Rectify() {
  const { message } = App.useApp();
  const { filter, setFilter, resetFilter, pendingRectifies, pointMap } = useInspectionFilter();
  const rectifies = usePointStore((s) => s.rectifies);
  const rechecks = usePointStore((s) => s.rechecks);
  const addRecheck = usePointStore((s) => s.addRecheck);
  const [statusFilter, setStatusFilter] = useState<RectifyStatus | ''>('');
  const [editing, setEditing] = useState<RectifyPlan | null>(null);
  const [draft, setDraft] = useState<RecheckFormDraft>({
    result: '已整改',
    date: todayStr(),
    note: '',
    inspector: DEFAULT_INSPECTOR,
  });
  const [saving, setSaving] = useState(false);

  const historyMap = useMemo(() => {
    const map = new Map<string, RecheckRecord[]>();
    for (const r of rechecks) {
      const list = map.get(r.rectifyId);
      if (list) list.push(r);
      else map.set(r.rectifyId, [r]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      });
    }
    return map;
  }, [rechecks]);

  const scoped = useMemo(
    () => rectifies.filter((r) => pointMap.has(r.pointId)),
    [rectifies, pointMap],
  );

  const visible = useMemo(
    () => (statusFilter ? scoped.filter((r) => r.status === statusFilter) : scoped),
    [scoped, statusFilter],
  );

  const groups = useMemo(() => {
    const overdue = visible
      .filter((r) => isOverdue(r.deadline, r.status))
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const pending = visible
      .filter((r) => r.status === '待整改' && !isOverdue(r.deadline, r.status))
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const relapse = visible.filter((r) => r.status === '复发');
    const done = visible
      .filter((r) => r.status === '已整改')
      .sort((a, b) => (a.recheckDate < b.recheckDate ? 1 : -1));
    return [
      { key: 'overdue', title: '逾期未整改（置顶）', items: overdue, danger: true },
      { key: 'pending', title: '整改期限内', items: pending, danger: false },
      { key: 'relapse', title: '复检复发', items: relapse, danger: true },
      { key: 'done', title: '已整改完成', items: done, danger: false },
    ].filter((g) => g.items.length > 0);
  }, [visible]);

  const openRecheck = (row: RectifyPlan) => {
    setEditing(row);
    setDraft({ result: '已整改', date: todayStr(), note: '', inspector: DEFAULT_INSPECTOR });
  };

  const handleRecheck = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { duplicated } = await addRecheck(editing.id, {
        result: draft.result,
        date: draft.date || todayStr(),
        note: draft.note,
        inspector: draft.inspector,
      });
      if (duplicated) {
        message.warning('与该条目已有复检登记完全相同，已保留第一条，不再重复登记');
      } else {
        message.success(
          draft.result === '已整改'
            ? '复检结果已登记，条目状态更新为已整改'
            : draft.result === '复发'
              ? '复检结果已登记，复发问题已重新打开条目'
              : '复检结果已登记，条目继续整改',
        );
      }
      setEditing(null);
    } catch (e) {
      message.error(`复检登记失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const renderRecheckHistory = (row: RectifyPlan) => {
    const history = historyMap.get(row.id) ?? [];
    if (!history.length) {
      return (
        <Typography.Text type="secondary" className="gb-muted">
          暂无复检记录
        </Typography.Text>
      );
    }
    return (
      <Timeline
        items={history.map((r) => ({
          color: r.result === '已整改' ? 'green' : r.result === '复发' ? 'red' : 'orange',
          children: (
            <Space size={8} wrap style={{ rowGap: 2 }}>
              <Typography.Text strong>{r.date}</Typography.Text>
              <StatusBadge value={r.result} kind="rectify" />
              <Typography.Text type="secondary" className="gb-muted">
                检查人：{r.inspector || '未记录'}
              </Typography.Text>
              <Typography.Text>{r.note || '（未填写说明）'}</Typography.Text>
            </Space>
          ),
        }))}
      />
    );
  };

  const columns: ColumnsType<RectifyPlan> = [
    {
      title: '点位',
      width: 200,
      render: (_, row) => {
        const p = pointMap.get(row.pointId);
        return p ? <Link to={`/points/${p.id}`}>{p.name}</Link> : row.pointId;
      },
    },
    {
      title: '行政区',
      width: 90,
      render: (_, row) => pointMap.get(row.pointId)?.district ?? '—',
    },
    { title: '整改要求', dataIndex: 'requirement', ellipsis: true, width: 220 },
    { title: '责任单位', dataIndex: 'unit', width: 150 },
    {
      title: '整改期限',
      dataIndex: 'deadline',
      width: 120,
      sorter: (a, b) => (a.deadline < b.deadline ? -1 : 1),
      render: (d: string, row) =>
        isOverdue(d, row.status) ? (
          <Space size={4}>
            {d}
            <Tag color="error">逾期</Tag>
          </Space>
        ) : (
          d
        ),
    },
    {
      title: '复检日期',
      dataIndex: 'recheckDate',
      width: 110,
      render: (v: string) => v || <Typography.Text type="secondary">未复检</Typography.Text>,
    },
    {
      title: '最新复检说明',
      width: 260,
      render: (_, row) => {
        const history = historyMap.get(row.id) ?? [];
        const latest = latestRecheck(history);
        if (!latest) {
          return <Typography.Text type="secondary">未复检</Typography.Text>;
        }
        return (
          <Space size={4} wrap style={{ rowGap: 2 }}>
            <Typography.Text ellipsis style={{ maxWidth: 180 }} title={latest.note}>
              {latest.note || '（未填写说明）'}
            </Typography.Text>
            <Typography.Text type="secondary" className="gb-muted">
              {latest.inspector || '未记录检查人'}
            </Typography.Text>
            {history.length > 1 ? <Tag>共 {history.length} 次复检</Tag> : null}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <StatusBadge value={v} kind="rectify" />,
    },
    {
      title: '操作',
      width: 110,
      render: (_, row) => (
        <Button size="small" type="primary" ghost onClick={() => openRecheck(row)} data-testid={`recheck-${row.id}`}>
          登记复检
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="gb-page-head">
        <div>
          <h1 className="gb-page-title">整改清单</h1>
          <Typography.Text type="secondary">
            按状态与期限分组，逾期条目置顶；每次复检单独登记留痕，最新记录决定条目状态，展开可查看历次复检。
          </Typography.Text>
        </div>
        <Space wrap>
          <Select
            placeholder="行政区"
            style={{ width: 130 }}
            allowClear
            value={filter.district || undefined}
            onChange={(v) => setFilter({ district: v ?? '' })}
            options={DISTRICTS.map((d) => ({ value: d, label: d }))}
          />
          <Select
            placeholder="设施类型"
            style={{ width: 150 }}
            allowClear
            value={filter.facilityType || undefined}
            onChange={(v) => setFilter({ facilityType: v ?? '' })}
            options={FACILITY_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <Select
            placeholder="整改状态"
            style={{ width: 140 }}
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter((v as RectifyStatus) ?? '')}
            options={RECTIFY_STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              resetFilter();
              setStatusFilter('');
            }}
          >
            重置
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">整改条目总数</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600 }} data-testid="rectify-total">
              {scoped.length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">待整改（含逾期）</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#d46b08' }} data-testid="rectify-pending">
              {pendingRectifies.length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">已整改</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#389e0d' }}>
              {scoped.filter((r) => r.status === '已整改').length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">逾期条目</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#cf1322' }} data-testid="rectify-overdue">
              {scoped.filter((r) => isOverdue(r.deadline, r.status)).length}
            </div>
          </Card>
        </Col>
      </Row>

      {groups.length ? (
        groups.map((g) => (
          <Card
            key={g.key}
            size="small"
            style={{ marginTop: 16 }}
            title={
              <Space size={8}>
                <span>{g.title}</span>
                <Tag color={g.danger ? 'error' : 'default'}>{g.items.length}</Tag>
              </Space>
            }
            data-testid={`group-${g.key}`}
          >
            <Table<RectifyPlan>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={g.items}
              columns={columns}
              rowClassName={(row) => (isOverdue(row.deadline, row.status) ? 'gb-overdue-row' : '')}
              expandable={{
                expandedRowRender: (row) => (
                  <div style={{ padding: '4px 0 4px 8px' }}>
                    <Typography.Text strong>历次复检（按时间排列）</Typography.Text>
                    <div style={{ marginTop: 8 }}>{renderRecheckHistory(row)}</div>
                  </div>
                ),
                rowExpandable: (row) => (historyMap.get(row.id)?.length ?? 0) > 0,
              }}
            />
          </Card>
        ))
      ) : (
        <EmptyState
          title="没有匹配的整改条目"
          description="调整行政区、设施类型或状态筛选后再试"
          extra={
            <Button onClick={() => { resetFilter(); setStatusFilter(''); }}>
              <CheckOutlined /> 清空筛选
            </Button>
          }
        />
      )}

      <Modal
        title={editing ? `登记复检 · ${pointMap.get(editing.pointId)?.name ?? editing.pointId}` : '登记复检'}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={handleRecheck}
        confirmLoading={saving}
        okText="保存复检结果"
        destroyOnClose
      >
        {editing ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              整改要求：{editing.requirement}
              <br />
              责任单位：{editing.unit} · 期限：{editing.deadline}
            </Typography.Text>
            <div>
              <Typography.Text>复检结论</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={draft.result}
                onChange={(v) => setDraft((c) => ({ ...c, result: v }))}
                options={RECHECK_RESULTS.map((r) => ({
                  value: r,
                  label:
                    r === '已整改'
                      ? '已整改（达标）'
                      : r === '复发'
                        ? '复发（再次不达标，重新打开条目）'
                        : '待整改（继续跟踪）',
                }))}
              />
            </div>
            <div>
              <Typography.Text>复检日期</Typography.Text>
              <DatePicker
                style={{ width: '100%', marginTop: 4 }}
                value={draft.date ? dayjs(draft.date) : null}
                onChange={(d) => setDraft((c) => ({ ...c, date: d ? d.format('YYYY-MM-DD') : todayStr() }))}
              />
            </div>
            <div>
              <Typography.Text>检查人</Typography.Text>
              <Input
                style={{ marginTop: 4 }}
                value={draft.inspector}
                onChange={(e) => setDraft((c) => ({ ...c, inspector: e.target.value }))}
                placeholder="执行本次复检的督导员或检查人"
                data-testid="recheck-inspector"
              />
            </div>
            <div>
              <Typography.Text>复检说明</Typography.Text>
              <Input.TextArea
                rows={3}
                style={{ marginTop: 4 }}
                value={draft.note}
                onChange={(e) => setDraft((c) => ({ ...c, note: e.target.value }))}
                placeholder="如：已清退占用、坡道重做完成，实测坡度 4.2%；不达标时写明退回原因"
                data-testid="recheck-note"
              />
            </div>
          </Space>
        ) : (
          <Empty />
        )}
      </Modal>
    </div>
  );
}
