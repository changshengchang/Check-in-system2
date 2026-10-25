import { CombinedAttendeeView, RegisteredParticipant } from '../types';

/**
 * 貴賓 (VIP) 標記
 * - 承辦人在後台逐一勾選 / 取消
 * - Excel 名冊可加「貴賓」欄位預先標記 (填 是 / V / Y / ✓ / 1 等)
 */

const VIP_COLUMNS = ['貴賓', 'vip', '重要貴賓', '貴賓標記'];
const TRUTHY = new Set(['是', 'v', 'y', 'yes', 'true', '1', 'o', '○', '●', '✓', '✔', '★', '☆', '貴賓', 'vip', '◎']);

/** Excel「貴賓」欄位的值是否代表「是貴賓」(空白、否、N、0 等都視為不是) */
export function parseVipFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

/** 從 Excel 列中找出貴賓欄位並判斷 */
export function vipFromRow(row: Record<string, unknown>): boolean {
  const key = Object.keys(row).find(k => VIP_COLUMNS.includes(k.trim().toLowerCase()));
  return key ? parseVipFlag(row[key]) : false;
}

/** 設定名冊中某人的貴賓標記 (寫入明確的值，不受其他裝置操作順序影響) */
export function setRosterVip(roster: RegisteredParticipant[], participantId: string, isVip: boolean): RegisteredParticipant[] {
  return roster.map(p => (p.id === participantId ? { ...p, isVip } : p));
}

export interface VipBoard {
  /** 在場中 (已報到、尚未簽退)：最早報到在最上面，最新報到在最下面 */
  present: CombinedAttendeeView[];
  /** 尚未報到：依序號 */
  notArrived: CombinedAttendeeView[];
  /** 已簽退：最早簽退在最上面，最新簽退在最下面 */
  checkedOut: CombinedAttendeeView[];
  counts: { total: number; present: number; notArrived: number; checkedOut: number };
}

const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const serialOf = (a: CombinedAttendeeView) => a.serialNo ?? Number.POSITIVE_INFINITY;

/** 依時間排序 (同時間依序號，再依原順序) */
function sortByTime(list: CombinedAttendeeView[], pick: (a: CombinedAttendeeView) => string | undefined) {
  return list
    .map((a, i) => ({ a, i, t: timeOf(pick(a)) }))
    .sort((x, y) => (x.t - y.t) || (serialOf(x.a) - serialOf(y.a)) || (x.i - y.i))
    .map(x => x.a);
}

/** 貴賓報到情形看板的資料：在場中 → 尚未報到 → 已簽退 */
export function buildVipBoard(attendees: CombinedAttendeeView[]): VipBoard {
  const vips = attendees.filter(a => a.isVip);
  const hasCheckedIn = (a: CombinedAttendeeView) =>
    (a.status === 'CHECKED_IN' || a.status === 'WALK_IN') && Boolean(a.checkInTime);

  const present = sortByTime(vips.filter(a => hasCheckedIn(a) && !a.checkOutTime), a => a.checkInTime);
  const checkedOut = sortByTime(vips.filter(a => hasCheckedIn(a) && Boolean(a.checkOutTime)), a => a.checkOutTime);
  const notArrived = vips
    .filter(a => !hasCheckedIn(a))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (serialOf(x.a) - serialOf(y.a)) || (x.i - y.i))
    .map(x => x.a);

  return {
    present,
    notArrived,
    checkedOut,
    counts: { total: vips.length, present: present.length, notArrived: notArrived.length, checkedOut: checkedOut.length }
  };
}

/** 只對「最近發生」的報到/簽退閃爍提示，避免剛標記為貴賓或重新整理時誤閃 */
export const RECENT_EVENT_MS = 5 * 60 * 1000;
export function isRecent(iso: string | undefined, now: number): boolean {
  const t = timeOf(iso);
  return !isNaN(t) && now - t <= RECENT_EVENT_MS && now - t >= -60_000;
}
