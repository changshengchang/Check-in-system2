import { CheckInRecord, CombinedAttendeeView, RegisteredParticipant } from '../types';

/**
 * 序號規則
 * - 名冊人員：使用 Excel 的「編號」欄位 (也接受「序號」)；沒有或無效時，排在最後依序補發
 * - 承辦人手動新增、現場追加：目前最大序號 + 1
 * - 已發出的號碼不回收 (取消報到後，下一位仍拿下一個新號碼)
 * - 清空所有簽到紀錄時，計數器回到名冊最大號
 */

const SERIAL_COLUMNS = ['編號', '序號'];

/** 正整數才算有效序號 ("001" → 1；"A1"、"0"、"1.5"、空白 → 無效) */
export function parseSerial(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!/^\d+$/.test(t)) return undefined;
    const n = Number(t);
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

/** Excel 名冊中的編號欄位值 */
export function excelSerialOf(p: RegisteredParticipant): number | undefined {
  const fields = p.customFields || {};
  for (const col of SERIAL_COLUMNS) {
    const key = Object.keys(fields).find(k => k.trim() === col);
    if (key) {
      const n = parseSerial(fields[key]);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

/** 名冊人員的序號：已配發的優先，其次是 Excel 編號 */
export function rosterSerialOf(p: RegisteredParticipant): number | undefined {
  return parseSerial(p.serialNo) ?? excelSerialOf(p);
}

export function maxRosterSerial(roster: RegisteredParticipant[]): number {
  return roster.reduce((m, p) => Math.max(m, rosterSerialOf(p) ?? 0), 0);
}

/**
 * 替名冊配發序號 (保持原本順序)
 *   1. 已有有效序號 (或 Excel 編號) 且不重複、不在 reserved 內 → 照用
 *   2. 其餘 (空白、無效、重複) → 從目前最大號往後依序補發
 * @param startCounter 目前已發到的號碼 (補發從 max(startCounter, 已用最大號) + 1 開始)
 * @param reserved 已被其他人使用的號碼 (例如現場追加人員)
 */
export function assignRosterSerials(
  roster: RegisteredParticipant[],
  startCounter = 0,
  reserved: Iterable<number> = []
): { roster: RegisteredParticipant[]; lastSerialNo: number } {
  const used = new Set<number>(reserved);
  const keep: (number | undefined)[] = roster.map(p => {
    const n = rosterSerialOf(p);
    if (n === undefined || used.has(n)) return undefined;
    used.add(n);
    return n;
  });

  let counter = Math.max(startCounter, ...Array.from(used), 0);
  const next = roster.map((p, i) => {
    let serialNo = keep[i];
    if (serialNo === undefined) {
      counter += 1;
      serialNo = counter;
    }
    return p.serialNo === serialNo ? p : { ...p, serialNo };
  });
  return { roster: next, lastSerialNo: counter };
}

/** 名冊是否每個人都有有效且不重複的序號 */
export function rosterSerialsComplete(roster: RegisteredParticipant[]): boolean {
  const seen = new Set<number>();
  return roster.every(p => {
    const n = parseSerial(p.serialNo);
    if (n === undefined || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

/** 現場追加人員已拿到的序號 */
export function walkInSerials(checkIns: CheckInRecord[]): number[] {
  return checkIns.map(c => parseSerial(c.serialNo)).filter((n): n is number => n !== undefined);
}

/** 依序號由小到大排列；尚未配發序號的排在最後 (保持原本相對順序) */
export function sortBySerial<T extends { serialNo?: number }>(list: T[]): T[] {
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const sa = a.item.serialNo ?? Number.POSITIVE_INFINITY;
      const sb = b.item.serialNo ?? Number.POSITIVE_INFINITY;
      return sa !== sb ? sa - sb : a.i - b.i;
    })
    .map(x => x.item);
}

/**
 * 後台搜尋：姓名、職稱、部門 (部分符合)；序號 (完全符合)；電話 (輸入 3 碼以上數字時比對)
 *   "12"    → 序號 12 (不會比對到 1、112)
 *   "#12"   → 序號 12
 *   "0912"  → 電話含 0912 者
 */
export function matchesAttendeeSearch(a: CombinedAttendeeView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (a.name.toLowerCase().includes(q)) return true;
  if ((a.title || '').toLowerCase().includes(q)) return true;
  if (a.department && a.department.toLowerCase().includes(q)) return true;

  const serialQuery = /^#?\s*(\d+)$/.exec(q);
  if (serialQuery && a.serialNo !== undefined && a.serialNo === Number(serialQuery[1])) return true;

  const digits = q.replace(/[\s\-()#]/g, '');
  if (/^\d{3,}$/.test(digits)) {
    const phones = [a.phone, a.customFields?.['電話'], a.customFields?.['聯絡電話'], a.customFields?.['手機']];
    if (phones.some(p => p && p.replace(/\D/g, '').includes(digits))) return true;
  }
  return false;
}

/**
 * 匯入名冊時配發序號
 *   replace：以新名冊的 Excel 編號為準；計數器 = max(新名冊最大號, 現場追加已用最大號)
 *   append ：原名冊序號不變；新加入者的編號若與既有號碼衝突，改從最大號往後補發
 * 現場追加人員已拿到的號碼 (walkIns) 不會被名冊重複使用。
 */
export function importRosterWithSerials(
  currentRoster: RegisteredParticipant[],
  currentLastSerialNo: number | undefined,
  incoming: RegisteredParticipant[],
  mode: 'replace' | 'append',
  walkIns: number[]
): { roster: RegisteredParticipant[]; lastSerialNo: number } {
  const walkInMax = Math.max(0, ...walkIns);
  if (mode === 'replace') {
    const result = assignRosterSerials(incoming, walkInMax, walkIns);
    return { roster: result.roster, lastSerialNo: Math.max(result.lastSerialNo, walkInMax) };
  }
  // 已在名冊上的人 (同名)：更新資料 (例如新增的葷素、車次欄位)，序號與 ID 不變；新的人加在後面
  const key = (p: RegisteredParticipant) => p.name.trim().toLowerCase();
  const incomingByName = new Map<string, RegisteredParticipant>();
  incoming.forEach(p => { if (!incomingByName.has(key(p))) incomingByName.set(key(p), p); });
  const existingNames = new Set(currentRoster.map(key));
  const updatedExisting = currentRoster.map(p => {
    const inc = incomingByName.get(key(p));
    return inc ? mergeParticipant(p, inc) : p;
  });
  const filteredNew = incoming.filter((p, i) => !existingNames.has(key(p)) && incoming.findIndex(x => key(x) === key(p)) === i);
  const start = Math.max(currentLastSerialNo ?? 0, maxRosterSerial(currentRoster), walkInMax);
  const result = assignRosterSerials([...updatedExisting, ...filteredNew], start, walkIns);
  return { roster: result.roster, lastSerialNo: Math.max(start, result.lastSerialNo) };
}

/** 承辦人手動新增學員：序號 = 目前最大序號 + 1 (同名同職稱者不重複新增) */
export function addParticipantWithSerial(
  currentRoster: RegisteredParticipant[],
  currentLastSerialNo: number | undefined,
  p: RegisteredParticipant
): { roster: RegisteredParticipant[]; lastSerialNo: number } {
  const last = Math.max(currentLastSerialNo ?? 0, maxRosterSerial(currentRoster));
  const exists = currentRoster.some(x => x.id === p.id || (x.name.trim() === p.name.trim() && x.title === p.title));
  if (exists) return { roster: currentRoster, lastSerialNo: last };
  return { roster: [...currentRoster, { ...p, serialNo: last + 1 }], lastSerialNo: last + 1 };
}

/**
 * 附加匯入時更新既有人員：新檔案中有填的欄位覆蓋舊值，空白的保留舊值；
 * ID、序號、手動勾選的貴賓標記不變 (新檔案標記為貴賓時才加上)。
 */
export function mergeParticipant(existing: RegisteredParticipant, incoming: RegisteredParticipant): RegisteredParticipant {
  const pick = (a?: string, b?: string) => (b && b.trim() && b !== '未填寫職稱' ? b : a);
  return {
    ...existing,
    title: pick(existing.title, incoming.title) || existing.title,
    department: pick(existing.department, incoming.department),
    phone: pick(existing.phone, incoming.phone),
    email: pick(existing.email, incoming.email),
    customFields: { ...(existing.customFields || {}), ...(incoming.customFields || {}) },
    ...(incoming.isVip ? { isVip: true } : {})
  };
}
