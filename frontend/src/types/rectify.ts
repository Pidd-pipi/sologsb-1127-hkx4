/** 整改状态 */
export type RectifyStatus = '待整改' | '已整改' | '复发';

export const RECTIFY_STATUSES: RectifyStatus[] = ['待整改', '已整改', '复发'];

/** 复检结论：已整改达标 / 复发再次不达标 / 待整改继续跟踪 */
export type RecheckResult = RectifyStatus;

export const RECHECK_RESULTS: RecheckResult[] = ['已整改', '复发', '待整改'];

/**
 * 复检记录：每次登记单独存一条，不再拼进整改要求。
 * 同一条整改条目的全部记录按时间留存，最新一条决定条目状态。
 */
export interface RecheckRecord {
  id: string;
  /** 所属整改条目 */
  rectifyId: string;
  /** 复检结论 */
  result: RecheckResult;
  /** 复检日期 YYYY-MM-DD */
  date: string;
  /** 复检说明 / 退回原因 */
  note: string;
  /** 检查人 */
  inspector: string;
  /** 登记时间（ISO） */
  createdAt: string;
}

export type RecheckDraft = Pick<RecheckRecord, 'result' | 'date' | 'note' | 'inspector'>;

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
  /**
   * 最近一次复检日期 YYYY-MM-DD，未复检为空字符串。
   * 由最新复检记录回填，仅用于列表排序与展示。
   */
  recheckDate: string;
  /** 当前状态：无复检记录时为待整改，否则取最新复检记录结论 */
  status: RectifyStatus;
  createdAt: string;
}

export type RectifyPlanDraft = Omit<RectifyPlan, 'id' | 'createdAt'>;

/** 按状态与期限分组后的清单结构 */
export interface RectifyGroup {
  key: string;
  title: string;
  items: RectifyPlan[];
}

/** 按时间正序排列复检记录（早 → 晚）；同日期按登记时间先后 */
export function sortRechecksAsc(records: RecheckRecord[]): RecheckRecord[] {
  return [...records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/** 最新一条复检记录；没有记录时返回 null */
export function latestRecheck(records: RecheckRecord[]): RecheckRecord | null {
  if (!records.length) return null;
  return sortRechecksAsc(records)[records.length - 1];
}

/**
 * 由历次复检记录推导条目状态：
 * 无记录视为待整改；否则最新记录的结论即为当前状态，
 * 因此完成后再次复发会重新打开条目。
 */
export function deriveRectifyStatus(records: RecheckRecord[]): RectifyStatus {
  return latestRecheck(records)?.result ?? '待整改';
}

/** 两条复检记录是否为同一条目上的重复登记（结论、日期、说明、检查人全相同） */
export function isSameRecheck(a: RecheckDraft, b: RecheckRecord): boolean {
  return (
    a.result === b.result &&
    a.date === b.date &&
    a.note.trim() === b.note.trim() &&
    a.inspector.trim() === b.inspector.trim()
  );
}
