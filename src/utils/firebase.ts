import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  getDocs,
  getDocFromServer,
  writeBatch,
  runTransaction,
  setDoc,
  updateDoc,
  deleteField,
  type FieldValue
} from 'firebase/firestore';
import { CheckInRecord, EventInfo, RegisteredParticipant } from '../types';
import { getDeviceId } from './cloudSync';
import { assignRosterSerials, maxRosterSerial, parseSerial, rosterSerialsComplete } from './serial';

/**
 * Firebase 設定。
 * 這些值本來就會出現在前端網頁中，不是密碼；資料安全由 Firestore 安全規則 (firestore.rules) 控管。
 * 若要切換到其他 Firebase 專案，可在 .env.local 或 Vercel 環境變數設定 VITE_FIREBASE_* 覆蓋。
 */
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyByWSNQjMrTdOVz-siQYv-tBdJU7p125so',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'sanyi-checkin.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'sanyi-checkin',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'sanyi-checkin.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '621258465185',
  appId: env.VITE_FIREBASE_APP_ID || '1:621258465185:web:f832dd9809134f21e9f5e0'
};

/**
 * 同一個 Firebase 專案內的活動代號，所有裝置必須相同才會互相同步。
 * 正式網站用 sanyi-main；Vercel 預覽網址與本機開發用 sanyi-preview，
 * 測試時產生的資料不會混進正式活動。(VITE_VERCEL_ENV 由 Vercel 自動提供)
 */
const isPreview = env.DEV || env.VITE_VERCEL_ENV === 'preview' || env.VITE_VERCEL_ENV === 'development';
export const EVENT_ID: string = env.VITE_FIREBASE_EVENT_ID || (isPreview ? 'sanyi-preview' : 'sanyi-main');

const app = initializeApp(firebaseConfig);

// 本機快取：斷線時仍可操作，恢復連線後自動補送；多個分頁共用同一份快取
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // 紀錄中常有 undefined 欄位 (例如未填部門)，直接略過而不是報錯
  ignoreUndefinedProperties: true
});

/**
 * 資料結構
 *   events/{EVENT_ID}                 → { eventInfo, roster, updatedAt, lastModifiedBy, actionDescription }
 *   events/{EVENT_ID}/checkIns/{id}   → 每位學員一筆簽到/簽退紀錄 (各自獨立，兩台裝置同時操作不會互相覆蓋)
 */
export const eventDocRef = doc(db, 'events', EVENT_ID);
export const checkInsColRef = collection(db, 'events', EVENT_ID, 'checkIns');
const checkInDocRef = (id: string) => doc(db, 'events', EVENT_ID, 'checkIns', id);

export interface EventDocData {
  eventInfo: EventInfo;
  roster: RegisteredParticipant[];
  /** 序號計數器：目前已發出的最大序號 (不回收；清空簽到紀錄時回到名冊最大號) */
  lastSerialNo?: number;
  updatedAt?: number;
  lastModifiedBy?: string;
  actionDescription?: string;
}

/**
 * 寫入來源：student = 學員在簽到/簽退頁送出 (受開放時段限制)；
 * organizer = 承辦人後台操作 (補登、覆核等，不受開放時段限制)
 */
export type WriteSource = 'student' | 'organizer';

/** 每筆寫入都附上「誰、何時、做了什麼」，供其他裝置顯示最新更新來源 */
function syncMeta(action: string, source: WriteSource) {
  return {
    syncUpdatedAt: Date.now(),
    syncModifiedBy: getDeviceId(),
    syncAction: action,
    syncSource: source
  };
}

/** 更新時把 undefined 轉成「刪除欄位」，確保取消覆核等動作能真的清掉舊值 */
function toUpdatePayload(fields: Record<string, unknown>): Record<string, unknown | FieldValue> {
  const out: Record<string, unknown | FieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value === undefined ? deleteField() : value;
  }
  return out;
}

/** 新增或整筆取代一筆簽到紀錄 */
export function writeCheckIn(record: CheckInRecord, action: string, source: WriteSource) {
  return setDoc(checkInDocRef(record.id), { ...record, ...syncMeta(action, source) });
}

/** 只更新一筆簽到紀錄的部分欄位 (簽退、覆核、路途時間) */
export function updateCheckIn(id: string, fields: Partial<CheckInRecord>, action: string, source: WriteSource) {
  return updateDoc(checkInDocRef(id), toUpdatePayload({ ...fields, ...syncMeta(action, source) }));
}

/** 刪除多筆簽到紀錄，並在活動文件記錄這次動作讓其他裝置看到 */
export async function deleteCheckIns(ids: string[], action: string) {
  const unique = Array.from(new Set(ids));
  // Firestore 單一批次最多 500 筆操作，保留 1 筆給活動文件
  for (let i = 0; i < unique.length || i === 0; i += 400) {
    const batch = writeBatch(db);
    unique.slice(i, i + 400).forEach(id => batch.delete(checkInDocRef(id)));
    if (i === 0) {
      batch.set(eventDocRef, eventMeta(action), { merge: true });
    }
    await batch.commit();
  }
}

/** 從伺服器讀取全部簽到紀錄後刪除 (避免本機資料不完整而漏刪)，並把序號計數器歸零到名冊最大號 */
export async function deleteAllCheckIns(action: string) {
  const snap = await getDocs(checkInsColRef);
  await deleteCheckIns(snap.docs.map(d => d.id), action);
  await runTransaction(db, async tx => {
    const ev = await tx.get(eventDocRef);
    if (!ev.exists()) return;
    const roster: RegisteredParticipant[] = Array.isArray(ev.data().roster) ? ev.data().roster : [];
    tx.update(eventDocRef, { lastSerialNo: maxRosterSerial(roster) });
  });
}

function eventMeta(action: string) {
  return {
    updatedAt: Date.now(),
    lastModifiedBy: getDeviceId(),
    actionDescription: action
  };
}

/**
 * 以交易方式修改活動資訊與名冊：先讀雲端最新版本再套用修改，
 * 兩位承辦人同時編輯名冊時不會互相覆蓋。
 */
export function mutateEvent(
  action: string,
  fallback: EventDocData,
  mutation: (current: EventDocData) => EventDocData
) {
  return runTransaction(db, async tx => {
    const snap = await tx.get(eventDocRef);
    const current: EventDocData = snap.exists()
      ? {
          eventInfo: (snap.data().eventInfo as EventInfo) || fallback.eventInfo,
          roster: Array.isArray(snap.data().roster) ? snap.data().roster : fallback.roster,
          lastSerialNo: parseSerial(snap.data().lastSerialNo)
        }
      : fallback;
    const next = mutation(current);
    tx.set(eventDocRef, {
      eventInfo: next.eventInfo,
      roster: next.roster,
      // 修改沒有指定計數器時沿用雲端的值；任何情況都不會小於名冊最大號
      lastSerialNo: Math.max(next.lastSerialNo ?? current.lastSerialNo ?? 0, maxRosterSerial(next.roster)),
      ...eventMeta(action)
    });
  });
}

/**
 * 替「現場追加」的簽到紀錄配發序號 = 目前最大序號 + 1
 * 用交易取號：兩台裝置同時取號也不會拿到同一個號碼。
 * 回傳配發到的序號；紀錄不存在、已有序號、或其實是名冊人員時回傳已有序號或 null。
 */
export function assignWalkInSerial(checkInId: string) {
  return runTransaction(db, async tx => {
    const evSnap = await tx.get(eventDocRef);
    const recSnap = await tx.get(checkInDocRef(checkInId));
    // 紀錄已被取消 (刪除) → 不配發
    if (!evSnap.exists() || !recSnap.exists()) return null;

    const rec = recSnap.data() as CheckInRecord;
    const existing = parseSerial(rec.serialNo);
    if (existing !== undefined) return existing;

    // 名冊上有這個人 (比對 ID 或姓名) → 用名冊序號，不另外配發
    const roster: RegisteredParticipant[] = Array.isArray(evSnap.data().roster) ? evSnap.data().roster : [];
    const name = (rec.name || '').trim().toLowerCase();
    const inRoster = roster.some(p => (rec.participantId && p.id === rec.participantId) || p.name.trim().toLowerCase() === name);
    if (inRoster) return null;

    const next = Math.max(parseSerial(evSnap.data().lastSerialNo) ?? 0, maxRosterSerial(roster)) + 1;
    tx.update(eventDocRef, { lastSerialNo: next });
    tx.update(checkInDocRef(checkInId), { serialNo: next });
    return next;
  });
}

/**
 * 簽到覆核逾時作廢：刪除前在交易中再確認一次「仍未覆核且期限已到」，
 * 避免承辦人剛好在最後一刻按下覆核時被誤刪。回傳是否真的刪除。
 */
export function expireUnverifiedCheckIn(checkInId: string, nowMs: number) {
  return runTransaction(db, async tx => {
    const snap = await tx.get(checkInDocRef(checkInId));
    if (!snap.exists()) return false;
    const rec = snap.data() as CheckInRecord;
    const verified = Boolean(rec.checkInHrVerified ?? rec.hrVerified);
    if (verified || typeof rec.verifyDeadlineMs !== 'number' || nowMs < rec.verifyDeadlineMs) return false;
    tx.delete(checkInDocRef(checkInId));
    return true;
  });
}

/** 名冊中缺序號或序號重複的人員，從目前最大號往後補發 (舊資料轉換用；已完整則不寫入) */
export function normalizeRosterSerials() {
  return runTransaction(db, async tx => {
    const evSnap = await tx.get(eventDocRef);
    if (!evSnap.exists()) return false;
    const roster: RegisteredParticipant[] = Array.isArray(evSnap.data().roster) ? evSnap.data().roster : [];
    if (rosterSerialsComplete(roster)) return false;
    const counter = parseSerial(evSnap.data().lastSerialNo) ?? 0;
    const result = assignRosterSerials(roster, counter);
    tx.update(eventDocRef, { roster: result.roster, lastSerialNo: Math.max(counter, result.lastSerialNo) });
    return true;
  });
}

/**
 * 第一次使用時建立活動資料。
 * 若雲端還沒有資料，會用舊系統 (kvdb) 的最後一份資料，或本機資料當作起始內容，
 * 讓切換到 Firebase 時現有的名冊與簽到紀錄不會遺失。
 */
export async function ensureEventSeeded(getSeed: () => Promise<EventDocData & { checkIns: CheckInRecord[] }>) {
  // 已有資料 (或目前離線無法確認) 就不做任何事
  const existing = await getDocFromServer(eventDocRef).catch(() => null);
  if (!existing || existing.exists()) return false;

  const seed = await getSeed();
  const created = await runTransaction(db, async tx => {
    const snap = await tx.get(eventDocRef);
    if (snap.exists()) return false;
    const numbered = assignRosterSerials(seed.roster);
    tx.set(eventDocRef, {
      eventInfo: seed.eventInfo,
      roster: numbered.roster,
      lastSerialNo: numbered.lastSerialNo,
      ...eventMeta('初始化活動資料')
    });
    return true;
  });

  if (created && seed.checkIns.length > 0) {
    const batch = writeBatch(db);
    seed.checkIns.slice(0, 450).forEach(c => {
      batch.set(checkInDocRef(c.id), { ...c, ...syncMeta('匯入舊系統簽到紀錄', 'organizer') });
    });
    await batch.commit();
  }
  return created;
}
