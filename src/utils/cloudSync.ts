import { EventInfo, RegisteredParticipant, CheckInRecord } from '../types';

/**
 * 跨裝置同步已改用 Firebase Firestore (見 ./firebase.ts)。
 * 這個檔案只保留：
 *   1. 裝置代號 (顯示「最新更新來自 手機端-XXXX」)
 *   2. 讀取舊系統 kvdb.io 的最後一份資料，只在 Firebase 第一次建立資料時用來搬移舊紀錄
 */

export function getDeviceId(): string {
  try {
    const existing = sessionStorage.getItem('app_device_id');
    if (existing) return existing;
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768;
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const id = `${isMobile ? '手機端' : '電腦端'}-${randomHex}`;
    sessionStorage.setItem('app_device_id', id);
    return id;
  } catch {
    return '客戶端';
  }
}

export interface LegacyCloudData {
  eventInfo: EventInfo;
  roster: RegisteredParticipant[];
  checkIns: CheckInRecord[];
}

const LEGACY_KVDB_URL = 'https://kvdb.io/CrJjmEhDSTVdfJwSimtxNm/training-event-4820472b';

/** 讀取舊 kvdb 雲端資料 (只讀一次，失敗就回傳 null) */
export async function fetchLegacyCloudData(): Promise<LegacyCloudData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${LEGACY_KVDB_URL}?t=${Date.now()}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object' || !data.eventInfo) return null;
    return {
      eventInfo: data.eventInfo,
      roster: Array.isArray(data.roster) ? data.roster : [],
      checkIns: Array.isArray(data.checkIns) ? data.checkIns : []
    };
  } catch {
    return null;
  }
}
