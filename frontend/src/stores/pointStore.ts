import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { AccessPoint, AccessPointDraft } from '../types/point';
import type { Inspection, InspectionDraft } from '../types/inspection';
import type {
  RectifyPlan,
  RectifyPlanDraft,
  RecheckDraft,
  RecheckRecord,
} from '../types/rectify';
import { deriveRectifyStatus, isSameRecheck, sortRechecksAsc } from '../types/rectify';
import { makeId, toPlain, todayStr } from '../utils/format';

export interface AddRecheckResult {
  record: RecheckRecord;
  /** 是否与已有记录重复（重复时不新增，返回已存在的第一条） */
  duplicated: boolean;
}

interface PointState {
  points: AccessPoint[];
  inspections: Inspection[];
  rectifies: RectifyPlan[];
  rechecks: RecheckRecord[];
  loading: boolean;
  loaded: boolean;
  error: string;
  load: () => Promise<void>;
  addPoint: (draft: AccessPointDraft) => Promise<AccessPoint>;
  addInspection: (draft: InspectionDraft) => Promise<Inspection>;
  addRectify: (draft: RectifyPlanDraft) => Promise<RectifyPlan>;
  addRecheck: (rectifyId: string, draft: RecheckDraft) => Promise<AddRecheckResult>;
  getPoint: (id: string) => AccessPoint | undefined;
  inspectionsOf: (pointId: string) => Inspection[];
  rectifiesOf: (pointId: string) => RectifyPlan[];
  rechecksOf: (rectifyId: string) => RecheckRecord[];
}

export const usePointStore = create<PointState>((set, get) => ({
  points: [],
  inspections: [],
  rectifies: [],
  rechecks: [],
  loading: false,
  loaded: false,
  error: '',

  load: async () => {
    set({ loading: true, error: '' });
    try {
      await ensureSeed();
      const [points, inspections, rectifies, rechecks] = await Promise.all([
        db.points.toArray(),
        db.inspections.toArray(),
        db.rectifies.toArray(),
        db.rechecks.toArray(),
      ]);
      set({
        points: points.sort((a, b) => a.code.localeCompare(b.code)),
        inspections: inspections.sort((a, b) => (a.date < b.date ? 1 : -1)),
        rectifies: [...rectifies].sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
        rechecks: sortRechecksAsc(rechecks),
        loading: false,
        loaded: true,
      });
    } catch (e) {
      set({ loading: false, loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  addPoint: async (draft) => {
    const now = new Date().toISOString();
    const point: AccessPoint = toPlain({
      ...draft,
      id: makeId('pt'),
      createdAt: now,
      updatedAt: now,
    });
    await db.points.put(point);
    set((s) => ({ points: [...s.points, point].sort((a, b) => a.code.localeCompare(b.code)) }));
    return point;
  },

  addInspection: async (draft) => {
    const inspection: Inspection = toPlain({
      ...draft,
      id: makeId('ins'),
      createdAt: new Date().toISOString(),
    });
    await db.inspections.put(inspection);
    set((s) => ({
      inspections: [inspection, ...s.inspections].sort((a, b) => (a.date < b.date ? 1 : -1)),
    }));
    // 结论为不合格时自动生成整改条目，形成闭环
    if (inspection.conclusion === '不合格') {
      const exists = get().rectifies.some(
        (r) => r.pointId === inspection.pointId && r.status !== '已整改',
      );
      if (!exists) {
        await get().addRectify({
          pointId: inspection.pointId,
          requirement: `按 ${inspection.date} 核验结论整改：${inspection.problem || '坡度、净宽或占用问题'}`,
          unit: '待指派责任单位',
          deadline: todayStr(),
          recheckDate: '',
          status: '待整改',
        });
      }
    }
    return inspection;
  },

  addRectify: async (draft) => {
    const plan: RectifyPlan = toPlain({
      ...draft,
      id: makeId('rct'),
      createdAt: new Date().toISOString(),
    });
    await db.rectifies.put(plan);
    set((s) => ({
      rectifies: [...s.rectifies, plan].sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
    }));
    return plan;
  },

  addRecheck: async (rectifyId, draft) => {
    const plan = get().rectifies.find((r) => r.id === rectifyId);
    if (!plan) throw new Error('整改条目不存在');

    const normalized: RecheckDraft = {
      result: draft.result,
      date: draft.date || todayStr(),
      note: draft.note.trim(),
      inspector: draft.inspector.trim() || '未署名检查人',
    };

    const history = get().rechecks.filter((r) => r.rectifyId === rectifyId);

    // 同一条目重复登记（结论/日期/说明/检查人全相同）只保留第一条
    const duplicate = history.find((r) => isSameRecheck(normalized, r));
    if (duplicate) {
      return { record: duplicate, duplicated: true };
    }

    const record: RecheckRecord = toPlain({
      ...normalized,
      id: makeId('rck'),
      rectifyId,
      createdAt: new Date().toISOString(),
    });

    // 旧记录保留，仅追加新记录；最新记录决定条目状态与复检日期
    const nextHistory = sortRechecksAsc([...history, record]);
    const nextPlan: RectifyPlan = {
      ...plan,
      status: deriveRectifyStatus(nextHistory),
      recheckDate: normalized.date,
    };

    await db.transaction('rw', db.rechecks, db.rectifies, async () => {
      await db.rechecks.put(record);
      await db.rectifies.update(rectifyId, {
        status: nextPlan.status,
        recheckDate: nextPlan.recheckDate,
      });
    });

    set((s) => ({
      rechecks: sortRechecksAsc([...s.rechecks, record]),
      rectifies: s.rectifies.map((r) =>
        r.id === rectifyId
          ? { ...r, status: nextPlan.status, recheckDate: nextPlan.recheckDate }
          : r,
      ),
    }));
    return { record, duplicated: false };
  },

  getPoint: (id) => get().points.find((p) => p.id === id),

  inspectionsOf: (pointId) =>
    get()
      .inspections.filter((i) => i.pointId === pointId)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),

  rectifiesOf: (pointId) =>
    get()
      .rectifies.filter((r) => r.pointId === pointId)
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),

  /** 某条整改条目的历次复检，按时间正序（早 → 晚） */
  rechecksOf: (rectifyId) =>
    sortRechecksAsc(get().rechecks.filter((r) => r.rectifyId === rectifyId)),
}));
