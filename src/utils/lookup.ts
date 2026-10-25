import { CombinedAttendeeView, EventInfo } from '../types';
import { parseSerial } from './serial';

/**
 * 「報到資訊查詢」頁 (不需密碼)
 * 只顯示：姓名、序號、職稱、報到時間、覆核狀態，以及承辦人勾選在報到成功頁顯示的欄位 (例如桌次、用餐)，
 * 自動排除電話、信箱等個資與部門。
 */

const SENSITIVE = /電話|手機|phone|mobile|\btel\b|信箱|email|e-mail|mail|郵件|身分證|身份證|證號|地址|住址|address|生日|出生|birthday|帳號|密碼|password/i;
const ALREADY_SHOWN = /^(姓名|名字|name|職稱|職務|title|部門|單位|處室|department|dept|編號|序號|no\.?)$/i;

export function isSensitiveField(field: string): boolean {
  return SENSITIVE.test(field.trim());
}

/** 查詢頁要額外顯示的欄位 (依承辦人在後台勾選的順序) */
export function lookupDisplayFields(eventInfo: Pick<EventInfo, 'completionDisplayFields'>): string[] {
  const fields = eventInfo.completionDisplayFields || [];
  const seen = new Set<string>();
  return fields.filter(f => {
    const t = f.trim();
    if (!t || seen.has(t) || isSensitiveField(t) || ALREADY_SHOWN.test(t)) return false;
    seen.add(t);
    return true;
  });
}

export function fieldValue(a: CombinedAttendeeView, field: string): string | undefined {
  const fields = a.customFields || {};
  const key = Object.keys(fields).find(k => k.trim() === field.trim());
  const v = key ? fields[key] : undefined;
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export const isCheckedIn = (a: CombinedAttendeeView) => a.status === 'CHECKED_IN' || a.status === 'WALK_IN';

/** 所有已報到的人，最新報到在最上面 (同時間依序號) */
export function listCheckedInNewestFirst(attendees: CombinedAttendeeView[]): CombinedAttendeeView[] {
  const t = (a: CombinedAttendeeView) => {
    const ms = a.checkInTime ? new Date(a.checkInTime).getTime() : NaN;
    return isNaN(ms) ? -Infinity : ms;
  };
  return attendees
    .filter(isCheckedIn)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (t(y.a) - t(x.a)) || ((x.a.serialNo ?? Infinity) - (y.a.serialNo ?? Infinity)) || (x.i - y.i))
    .map(x => x.a);
}

/**
 * 已報到名單 (最新報到在最上面)；有輸入時依姓名 (部分符合) 或序號 (完全符合，可加 #) 篩選
 */
export function searchCheckedIn(attendees: CombinedAttendeeView[], query: string): CombinedAttendeeView[] {
  const list = listCheckedInNewestFirst(attendees);
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const serialMatch = /^#?\s*(\d+)$/.exec(q);
  const serial = serialMatch ? parseSerial(serialMatch[1]) : undefined;
  return list.filter(a => a.name.toLowerCase().includes(q) || (serial !== undefined && a.serialNo === serial));
}

/**
 * 報到 / 簽退成功頁要額外顯示的欄位 (承辦人在後台勾選；匯入名冊時預設勾選所有欄位)
 * 姓名、職稱、部門、編號/序號已在畫面上方顯示，這裡略過。值為空白的欄位不顯示。
 */
export function completionFieldRows(
  eventInfo: Pick<EventInfo, 'completionDisplayFields'>,
  rec: { customFields?: Record<string, string>; phone?: string; email?: string; notes?: string }
): { label: string; value: string }[] {
  const selected = eventInfo.completionDisplayFields || ['職稱', '部門', '電話'];
  const custom = rec.customFields || {};
  const byTrimmed = (field: string) => {
    const k = Object.keys(custom).find(key => key.trim().toLowerCase() === field.trim().toLowerCase());
    return k ? custom[k] : undefined;
  };
  const rows: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  selected.forEach(field => {
    const label = field.trim();
    const norm = label.toLowerCase();
    if (!label || seen.has(norm)) return;
    if (['姓名', 'name', '職稱', '部門', '編號', '序號'].includes(norm)) return;
    let val = byTrimmed(label);
    if (!val && (norm.includes('電話') || norm.includes('phone') || norm.includes('手機'))) val = rec.phone || byTrimmed('電話') || byTrimmed('聯絡電話');
    else if (!val && (norm.includes('信箱') || norm.includes('email') || norm.includes('郵件'))) val = rec.email || byTrimmed('信箱') || byTrimmed('電子信箱');
    else if (!val && (norm.includes('備註') || norm.includes('note'))) val = rec.notes || byTrimmed('備註');
    if (val && String(val).trim()) {
      seen.add(norm);
      rows.push({ label, value: String(val).trim() });
    }
  });
  return rows;
}
