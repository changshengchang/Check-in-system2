/**
 * 這支手機最近送出的報到 (存在瀏覽器)：
 * 不小心關掉報到成功頁時，「報到資訊查詢」頁可以直接找回自己的狀態。
 */
const KEY = 'my_recent_checkins';
const MAX_ITEMS = 3;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface MyCheckIn { id: string; name: string; at: number }

export function listMyCheckIns(now = Date.now()): MyCheckIn[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(x => x && typeof x.id === 'string' && typeof x.at === 'number' && now - x.at < MAX_AGE_MS);
  } catch {
    return [];
  }
}

export function rememberMyCheckIn(id: string, name: string, now = Date.now()) {
  try {
    const next = [{ id, name, at: now }, ...listMyCheckIns(now).filter(x => x.id !== id)].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 私密瀏覽等情況無法儲存，不影響報到
  }
}

export function forgetMyCheckIn(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listMyCheckIns().filter(x => x.id !== id)));
  } catch {
    // ignore
  }
}
