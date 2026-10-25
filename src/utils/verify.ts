import { CheckInRecord, EventInfo } from '../types';

/**
 * 簽到覆核期限
 * - 學員自行簽到時，紀錄帶有 verifyDeadlineMs = 簽到時間 + 期限 (伺服器時間)
 * - 期限前完成「簽到覆核」→ 正常；期限到仍未覆核 → 作廢 (所有畫面視同未報到，並自動刪除紀錄)
 * - 承辦人協助報到、人事直接覆核報到、舊資料沒有期限，不受影響
 */

export const DEFAULT_VERIFY_TIMEOUT_MIN = 15;
export const MAX_VERIFY_TIMEOUT_MIN = 240;

/** 目前設定的期限 (分鐘)；0 = 不作廢 */
export function verifyTimeoutMinutes(eventInfo: Pick<EventInfo, 'verifyTimeoutMinutes'>): number {
  const v = eventInfo.verifyTimeoutMinutes;
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_VERIFY_TIMEOUT_MIN;
  return Math.min(MAX_VERIFY_TIMEOUT_MIN, Math.max(0, Math.round(v)));
}

/** 學員送出簽到時要寫入的期限 (未啟用回傳 undefined) */
export function verifyDeadlineFor(eventInfo: Pick<EventInfo, 'verifyTimeoutMinutes'>, nowMs: number): number | undefined {
  const min = verifyTimeoutMinutes(eventInfo);
  return min > 0 ? nowMs + min * 60_000 : undefined;
}

export function isCheckInVerified(c: Pick<CheckInRecord, 'checkInHrVerified' | 'hrVerified'>): boolean {
  return Boolean(c.checkInHrVerified ?? c.hrVerified);
}

/** 有期限、尚未覆核、且期限已到 */
export function isVerifyExpired(c: Pick<CheckInRecord, 'verifyDeadlineMs' | 'checkInHrVerified' | 'hrVerified'>, nowMs: number): boolean {
  return typeof c.verifyDeadlineMs === 'number' && !isCheckInVerified(c) && nowMs >= c.verifyDeadlineMs;
}

/** 等待覆核中的剩餘毫秒數 (已覆核、無期限或已逾時回傳 undefined) */
export function verifyRemainingMs(c: Pick<CheckInRecord, 'verifyDeadlineMs' | 'checkInHrVerified' | 'hrVerified'>, nowMs: number): number | undefined {
  if (typeof c.verifyDeadlineMs !== 'number' || isCheckInVerified(c)) return undefined;
  const left = c.verifyDeadlineMs - nowMs;
  return left > 0 ? left : undefined;
}

/** 下一筆即將到期的時間 (用來在到期那一刻重新整理畫面) */
export function nextVerifyExpiry(checkIns: CheckInRecord[], nowMs: number): number | undefined {
  let next: number | undefined;
  for (const c of checkIns) {
    if (typeof c.verifyDeadlineMs !== 'number' || isCheckInVerified(c) || c.verifyDeadlineMs <= nowMs) continue;
    if (next === undefined || c.verifyDeadlineMs < next) next = c.verifyDeadlineMs;
  }
  return next;
}

export type SuccessState = 'verified' | 'pending' | 'expired' | 'cancelled' | 'no-deadline';

/**
 * 報到成功頁的狀態
 * @param local 送出時的紀錄 (含期限)
 * @param live  雲端目前的紀錄 (找不到 = 已作廢或被取消)
 */
export function successState(
  local: CheckInRecord,
  live: CheckInRecord | undefined,
  nowMs: number,
  /** 是否曾在雲端看到這筆紀錄 (剛送出還沒同步回來時，不要誤判為已取消) */
  seenLive = true
): SuccessState {
  if (live && isCheckInVerified(live)) return 'verified';
  // 雲端有紀錄就以雲端為準 (覆核後期限會被移除)；還沒同步回來時才用送出時的期限
  const deadline = live ? live.verifyDeadlineMs : local.verifyDeadlineMs;
  if (typeof deadline === 'number' && nowMs >= deadline) return 'expired';
  if (!live && seenLive) return 'cancelled';
  return typeof deadline === 'number' ? 'pending' : 'no-deadline';
}

/** 剩餘時間顯示，例：14:59、0:05 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
