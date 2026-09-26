/** 整改状态 */
export type RectifyStatus = '待整改' | '已整改' | '复发';

export const RECTIFY_STATUSES: RectifyStatus[] = ['待整改', '已整改', '复发'];

/** 整改跟踪条目 */
export interface RectifyPlan {
  id: string;
  pointId: string;
  /** 整改要求 */
  requirement: string;
  /** 责任单位 */
  unit: string;
  /** 整改期限 YYYY-MM-DD */
  deadline: string;
  /** 最新复检记录的日期 YYYY-MM-DD，未复检为空字符串（由复检记录联动更新） */
  recheckDate: string;
  /** 最新复检记录的结论（由复检记录联动更新） */
  status: RectifyStatus;
  createdAt: string;
}

export type RectifyPlanDraft = Omit<RectifyPlan, 'id' | 'createdAt'>;

/** 复检记录：每次登记单独一条，最新一条决定整改条目状态 */
export interface RecheckRecord {
  id: string;
  /** 所属整改条目 */
  rectifyId: string;
  /** 复检结论 */
  conclusion: RectifyStatus;
  /** 复检日期 YYYY-MM-DD */
  date: string;
  /** 复检说明 */
  note: string;
  /** 检查人 */
  inspector: string;
  createdAt: string;
}

export type RecheckDraft = Omit<RecheckRecord, 'id' | 'createdAt'>;

/** 复检记录按时间倒序（新→旧），同日期按创建时间倒序 */
export function sortRechecksDesc(a: RecheckRecord, b: RecheckRecord): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

/** 按状态与期限分组后的清单结构 */
export interface RectifyGroup {
  key: string;
  title: string;
  items: RectifyPlan[];
}
