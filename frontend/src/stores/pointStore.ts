import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { AccessPoint, AccessPointDraft } from '../types/point';
import type { Inspection, InspectionDraft } from '../types/inspection';
import {
  sortRechecksDesc,
  type RecheckDraft,
  type RecheckRecord,
  type RectifyPlan,
  type RectifyPlanDraft,
} from '../types/rectify';
import { makeId, toPlain, todayStr } from '../utils/format';

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
  updateRectify: (id: string, patch: Partial<RectifyPlan>) => Promise<void>;
  addRecheck: (draft: RecheckDraft) => Promise<RecheckRecord>;
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
        rechecks: [...rechecks].sort(sortRechecksDesc),
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

  updateRectify: async (id, patch) => {
    const plain = toPlain(patch);
    await db.rectifies.update(id, plain);
    set((s) => ({
      rectifies: s.rectifies.map((r) => (r.id === id ? { ...r, ...plain } : r)),
    }));
  },

  addRecheck: async (draft) => {
    const clean: RecheckDraft = {
      ...draft,
      note: draft.note.trim(),
      inspector: draft.inspector.trim() || '未署名检查人',
    };
    // 同一条目重复提交（结论、日期、说明、检查人完全一致）只留第一条
    const dup = get().rechecks.find(
      (r) =>
        r.rectifyId === clean.rectifyId &&
        r.date === clean.date &&
        r.conclusion === clean.conclusion &&
        r.note === clean.note &&
        r.inspector === clean.inspector,
    );
    if (dup) return dup;
    const plan = get().rectifies.find((r) => r.id === clean.rectifyId);
    if (!plan) throw new Error(`整改条目不存在：${clean.rectifyId}`);
    const record: RecheckRecord = toPlain({
      ...clean,
      id: makeId('rck'),
      createdAt: new Date().toISOString(),
    });
    // 最新一条复检记录决定条目状态与复检日期；复发或继续整改时旧记录保留，
    // 已整改完成后再次复发也会随新记录重新打开。
    const latest = [...get().rechecks, record]
      .filter((r) => r.rectifyId === plan.id)
      .sort(sortRechecksDesc)[0];
    const patch: Partial<RectifyPlan> = { status: latest.conclusion, recheckDate: latest.date };
    await db.transaction('rw', db.rechecks, db.rectifies, async () => {
      await db.rechecks.put(record);
      await db.rectifies.update(plan.id, patch);
    });
    set((s) => ({
      rechecks: [...s.rechecks, record].sort(sortRechecksDesc),
      rectifies: s.rectifies.map((r) => (r.id === plan.id ? { ...r, ...patch } : r)),
    }));
    return record;
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

  rechecksOf: (rectifyId) =>
    get()
      .rechecks.filter((r) => r.rectifyId === rectifyId)
      .sort(sortRechecksDesc),
}));
