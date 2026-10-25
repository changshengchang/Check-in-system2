import { useEffect, useState } from 'react';
import { SubmitWindow } from '../types';

/**
 * 開放時段判斷
 *   unrestricted : 未啟用限制，隨時可送出
 *   not_started  : 尚未開放
 *   open         : 開放中
 *   closed       : 已截止
 */
export type WindowState = 'unrestricted' | 'not_started' | 'open' | 'closed';

export interface WindowStatus {
  state: WindowState;
  canSubmit: boolean;
  startMs?: number;
  endMs?: number;
  /** not_started: 距離開放的毫秒數；open: 距離截止的毫秒數 (無截止則 undefined) */
  remainingMs?: number;
}

export function getWindowStatus(w: SubmitWindow | undefined, now: number): WindowStatus {
  if (!w || !w.enabled) return { state: 'unrestricted', canSubmit: true };
  const startMs = typeof w.startMs === 'number' ? w.startMs : undefined;
  const endMs = typeof w.endMs === 'number' ? w.endMs : undefined;

  if (startMs !== undefined && now < startMs) {
    return { state: 'not_started', canSubmit: false, startMs, endMs, remainingMs: startMs - now };
  }
  // 截止時間當下即不可送出 (與雲端安全規則的判斷一致：now < endMs 才可送出)
  if (endMs !== undefined && now >= endMs) {
    return { state: 'closed', canSubmit: false, startMs, endMs };
  }
  return { state: 'open', canSubmit: true, startMs, endMs, remainingMs: endMs !== undefined ? endMs - now : undefined };
}

/** 例：1 小時 5 分、12 分 30 秒、45 秒 */
export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days} 天 ${hours} 小時`;
  if (hours > 0) return `${hours} 小時 ${mins} 分`;
  if (mins > 0) return `${mins} 分 ${secs} 秒`;
  return `${secs} 秒`;
}

/*
 * 所有時段一律以台灣時間 (UTC+8) 輸入與顯示，不受裝置時區設定影響。
 * 台灣沒有日光節約時間，固定 +8 小時即可精確換算。
 */
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000;

function taiwanParts(ms: number) {
  const d = new Date(ms + TAIWAN_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** 同一天只顯示時間 (09:30)，不同天加上日期 (10/25 09:30)；台灣時間 */
export function formatWindowTime(ms: number, now: number = serverNow()): string {
  const t = taiwanParts(ms);
  const n = taiwanParts(now);
  const hhmm = `${pad(t.h)}:${pad(t.mi)}`;
  const sameDay = t.y === n.y && t.mo === n.mo && t.d === n.d;
  return sameDay ? hhmm : `${t.mo}/${t.d} ${hhmm}`;
}

/** 毫秒時間戳 → <input type="datetime-local"> 的值 (台灣時間) */
export function toDateTimeInputValue(ms?: number): string {
  if (typeof ms !== 'number') return '';
  const t = taiwanParts(ms);
  return `${t.y}-${pad(t.mo)}-${pad(t.d)}T${pad(t.h)}:${pad(t.mi)}`;
}

/** <input type="datetime-local"> 的值 (視為台灣時間) → 毫秒時間戳；空白或格式錯誤回傳 undefined */
export function fromDateTimeInputValue(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - TAIWAN_OFFSET_MS;
  return isNaN(ms) ? undefined : ms;
}

/* ------------------------------------------------------------------ */
/* 伺服器時間校正：學員手機時鐘可能不準，以網站伺服器回應的時間為準       */
/* ------------------------------------------------------------------ */

let clockOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

/** 讀取網站伺服器回應標頭的時間，算出本機時鐘的誤差 (失敗就沿用本機時間) */
export async function syncServerClock(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch(`/?clock=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const header = res.headers.get('date');
    if (!header) return;
    const serverMs = new Date(header).getTime();
    if (isNaN(serverMs)) return;
    // Date 標頭只到秒，補 500ms 取中間值
    const offset = serverMs + 500 - (t0 + t1) / 2;
    // 誤差小於 2 秒視為正常，避免網路抖動造成不必要的校正
    clockOffsetMs = Math.abs(offset) > 2000 ? offset : 0;
  } catch {
    // 離線時沿用本機時間
  }
}

/** 取得開放時段狀態；啟用限制時每秒更新 (倒數與自動開放/截止) */
export function useSubmitWindow(w: SubmitWindow | undefined): WindowStatus {
  const [now, setNow] = useState(() => serverNow());
  const enabled = Boolean(w?.enabled);
  useEffect(() => {
    if (!enabled) return;
    setNow(serverNow());
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return getWindowStatus(w, enabled ? now : serverNow());
}
