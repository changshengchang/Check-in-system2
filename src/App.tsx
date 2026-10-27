/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { onSnapshot, type SnapshotMetadata } from 'firebase/firestore';
import { EventInfo, RegisteredParticipant, CheckInRecord, SyncStatus, SubmitWindow } from './types';
import { syncServerClock, serverNow } from './utils/submitWindow';
import { importRosterWithSerials, addParticipantWithSerial, walkInSerials, rosterSerialsComplete } from './utils/serial';
import {
  loadEventInfo,
  saveEventInfo,
  loadRoster,
  saveRoster,
  loadCheckIns,
  buildCombinedAttendeeList,
  calculateParticipationDuration,
  calculateCompTime,
  formatMinutesDisplay
} from './utils/storage';
import { getDeviceId, fetchLegacyCloudData } from './utils/cloudSync';
import {
  eventDocRef,
  checkInsColRef,
  ensureEventSeeded,
  mutateEvent,
  assignWalkInSerial,
  normalizeRosterSerials,
  expireUnverifiedCheckIn,
  writeCheckIn,
  updateCheckIn,
  deleteCheckIns,
  deleteAllCheckIns,
  type EventDocData
} from './utils/firebase';
import { EventHeader } from './components/EventHeader';
import { CheckInForm } from './components/CheckInForm';
import { CheckOutForm } from './components/CheckOutForm';
import { Dashboard } from './components/Dashboard';
import { OrganizerAuthModal, StaffRole } from './components/OrganizerAuthModal';
import { CheckInLookup } from './components/CheckInLookup';
import { isVerifyExpired, nextVerifyExpiry, isCheckInVerified } from './utils/verify';
import { rememberMyCheckIn } from './utils/myCheckIns';
import { VipStatusBoard } from './components/VipStatusBoard';
import { setRosterVip } from './utils/vip';

/** 新的在最上面 (與原本 unshift 的順序一致) */
function sortCheckIns(list: CheckInRecord[]): CheckInRecord[] {
  return [...list].sort((a, b) => (b.checkInTime || '').localeCompare(a.checkInTime || ''));
}

function statusFromMetadata(m: SnapshotMetadata): SyncStatus {
  if (m.hasPendingWrites) return 'pending';
  if (m.fromCache) return 'offline';
  return 'synced';
}

type SubmitContext = 'checkin' | 'checkout';

function describeSyncError(err: unknown, submit?: SubmitContext): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'permission-denied' && submit) {
    return `送出失敗：目前不在${submit === 'checkin' ? '簽到' : '簽退'}開放時段內（以伺服器時間為準），如需補登請洽承辦人員`;
  }
  if (code === 'permission-denied') return '雲端拒絕這次修改：該紀錄可能已被其他裝置取消或刪除，請重新整理畫面後再試';
  if (code === 'unavailable') return '目前無法連上雲端，請檢查網路後再試一次';
  if (code === 'not-found') return '找不到這筆紀錄，可能已被其他裝置刪除';
  return `同步發生錯誤${code ? ` (${code})` : ''}，請稍後再試`;
}

export default function App() {
  const [eventInfo, setEventInfo] = useState<EventInfo>(() => loadEventInfo());
  const [roster, setRoster] = useState<RegisteredParticipant[]>(() => loadRoster());
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>(() => loadCheckIns());
  const [activeMode, setActiveMode] = useState<'checkin' | 'checkout' | 'lookup' | 'vip' | 'dashboard'>('checkin');

  const myDeviceIdRef = useRef<string>(getDeviceId());

  const [lastSyncInfo, setLastSyncInfo] = useState<{
    time: string;
    device: string;
    action: string;
  } | null>(null);
  const lastSyncInfoAtRef = useRef<number>(0);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [syncError, setSyncError] = useState<string | null>(null);

  // 最後一次從雲端收到的活動資料，交易失敗時用來還原畫面
  const lastEventSnapshotRef = useRef<EventDocData | null>(null);
  // 雲端序號計數器 (目前已發出的最大序號)
  const [lastSerialNo, setLastSerialNo] = useState<number | undefined>(undefined);

  // 後台登入身分：organizer = 承辦人 (完整權限)；helper = 協助人員 (只能查詢與覆核)
  const [staffRole, setStaffRole] = useState<StaffRole | null>(() => {
    try {
      const saved = sessionStorage.getItem('organizer_auth_role');
      if (saved === 'organizer' || saved === 'helper') return saved;
      return sessionStorage.getItem('organizer_auth_verified') === 'true' ? 'organizer' : null;
    } catch {
      return null;
    }
  });
  const isOrganizerAuthenticated = staffRole !== null;
  const isOrganizer = staffRole === 'organizer';
  const [showAuthModal, setShowAuthModal] = useState(false);

  const noteSyncInfo = (updatedAt: number | undefined, device: string | undefined, action: string | undefined) => {
    if (!updatedAt || updatedAt <= lastSyncInfoAtRef.current) return;
    lastSyncInfoAtRef.current = updatedAt;
    setLastSyncInfo({
      time: new Date(updatedAt).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }),
      device: device || '遠端裝置',
      action: action || '更新資料'
    });
  };

  // 即時同步：Firestore 有任何變動會主動推送到所有裝置，不需要輪詢
  useEffect(() => {
    // 校正本機時鐘，開放時段以伺服器時間為準
    syncServerClock();

    const parts: Record<'event' | 'checkIns', SyncStatus> = { event: 'connecting', checkIns: 'connecting' };
    const refreshStatus = () => {
      const all = Object.values(parts);
      const order: SyncStatus[] = ['error', 'offline', 'connecting', 'pending', 'synced'];
      setSyncStatus(order.find(s => all.includes(s)) || 'synced');
    };

    // 第一次使用：雲端沒有資料時，搬移舊系統 (kvdb) 或本機的資料
    ensureEventSeeded(async () => {
      const legacy = await fetchLegacyCloudData();
      return legacy || { eventInfo: loadEventInfo(), roster: loadRoster(), checkIns: loadCheckIns() };
    }).catch(err => {
      console.error('[Firebase] Seeding failed:', err);
      setSyncError(describeSyncError(err));
    });

    const unsubEvent = onSnapshot(
      eventDocRef,
      { includeMetadataChanges: true },
      snap => {
        parts.event = statusFromMetadata(snap.metadata);
        refreshStatus();
        if (!snap.exists()) return;

        const data = snap.data() as EventDocData;
        if (data.eventInfo) {
          setEventInfo(data.eventInfo);
          saveEventInfo(data.eventInfo);
        }
        if (Array.isArray(data.roster)) {
          setRoster(data.roster);
          setLastSerialNo(typeof data.lastSerialNo === 'number' ? data.lastSerialNo : undefined);
          saveRoster(data.roster);
        }
        if (!snap.metadata.hasPendingWrites) {
          if (data.eventInfo && Array.isArray(data.roster)) {
            lastEventSnapshotRef.current = { eventInfo: data.eventInfo, roster: data.roster };
          }
          noteSyncInfo(data.updatedAt, data.lastModifiedBy, data.actionDescription);
        }
      },
      err => {
        console.error('[Firebase] Event listener error:', err);
        parts.event = 'error';
        refreshStatus();
        setSyncError(describeSyncError(err));
      }
    );

    const unsubCheckIns = onSnapshot(
      checkInsColRef,
      { includeMetadataChanges: true },
      snap => {
        parts.checkIns = statusFromMetadata(snap.metadata);
        refreshStatus();
        // 剛開啟且本機快取還是空的：先保留畫面上的資料，等雲端回應
        if (snap.metadata.fromCache && snap.empty) return;

        const list = snap.docs.map(d => ({ ...(d.data() as CheckInRecord), id: d.id }));
        setCheckIns(sortCheckIns(list));

        snap.docChanges().forEach(change => {
          if (change.type === 'removed' || change.doc.metadata.hasPendingWrites) return;
          const c = change.doc.data() as CheckInRecord;
          noteSyncInfo(c.syncUpdatedAt, c.syncModifiedBy, c.syncAction);
        });
      },
      err => {
        console.error('[Firebase] Check-ins listener error:', err);
        parts.checkIns = 'error';
        refreshStatus();
        setSyncError(describeSyncError(err));
      }
    );

    return () => {
      unsubEvent();
      unsubCheckIns();
    };
  }, []);

  // 執行雲端寫入；失敗時顯示錯誤並 (必要時) 還原畫面
  // 回傳 null = 成功；字串 = 失敗原因 (給簽到/簽退頁顯示)
  const runSync = (promise: Promise<unknown>, onFail?: () => void, submit?: SubmitContext): Promise<string | null> => {
    setSyncError(null);
    return promise.then(
      () => null,
      err => {
        console.error('[Firebase] Write failed:', err);
        const message = describeSyncError(err, submit);
        setSyncError(message);
        setSyncStatus('error');
        onFail?.();
        return message;
      }
    );
  };

  // 活動資訊與名冊：先更新畫面，再以交易寫入雲端 (以雲端最新名冊為基礎套用修改)
  const runEventMutation = (action: string, mutation: (current: EventDocData) => EventDocData) => {
    const current = { eventInfo, roster, lastSerialNo };
    const optimistic = mutation(current);
    setEventInfo(optimistic.eventInfo);
    setRoster(optimistic.roster);

    runSync(mutateEvent(action, current, mutation), () => {
      const last = lastEventSnapshotRef.current;
      if (last) {
        setEventInfo(last.eventInfo);
        setRoster(last.roster);
      }
    });
  };

  /* ---------------- 現場追加序號配發 ---------------- */
  // 待配發序號的簽到紀錄 ID (本機送出的現場追加；承辦人後台另會補發所有缺號者)
  const pendingSerialIdsRef = useRef<Set<string>>(new Set());
  const serialWorkerBusyRef = useRef(false);

  const runSerialWorker = async () => {
    if (serialWorkerBusyRef.current) return;
    serialWorkerBusyRef.current = true;
    try {
      // 一次處理一筆，依加入順序取號
      for (const id of Array.from(pendingSerialIdsRef.current)) {
        try {
          await assignWalkInSerial(id);
          pendingSerialIdsRef.current.delete(id);
        } catch (err) {
          // 離線或衝突：保留在待辦清單，連線恢復後再試
          console.warn('[Serial] assign failed, will retry:', (err as { code?: string })?.code || err);
          break;
        }
      }
    } finally {
      serialWorkerBusyRef.current = false;
    }
  };

  const requestWalkInSerial = (checkInId: string) => {
    pendingSerialIdsRef.current.add(checkInId);
    runSerialWorker();
  };

  const isSamePerson = (c: CheckInRecord, attendeeId: string, name?: string) =>
    c.id === attendeeId ||
    c.participantId === attendeeId ||
    Boolean(name && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  // Request mode switcher with password gate
  const handleRequestSwitchMode = (targetMode: 'checkin' | 'checkout' | 'lookup' | 'vip' | 'dashboard') => {
    if (targetMode !== 'dashboard') {
      setActiveMode(targetMode);
    } else {
      if (isOrganizerAuthenticated) {
        setActiveMode('dashboard');
      } else {
        setShowAuthModal(true);
      }
    }
  };

  const handleAuthSuccess = (role: StaffRole) => {
    setStaffRole(role);
    try {
      sessionStorage.setItem('organizer_auth_role', role);
      sessionStorage.removeItem('organizer_auth_verified');
    } catch {
      // ignore
    }
    setShowAuthModal(false);
    setActiveMode('dashboard');
  };

  const handleOrganizerLogout = () => {
    setStaffRole(null);
    try {
      sessionStorage.removeItem('organizer_auth_role');
      sessionStorage.removeItem('organizer_auth_verified');
    } catch {
      // ignore
    }
    setActiveMode('checkin');
  };

  // 1. 修改活動資訊
  // 開放時段只由 handleUpdateSubmitWindow 修改，這裡保留雲端上的設定，
  // 避免編輯活動資訊時用畫面上的舊資料蓋掉另一台裝置剛改的時段
  const handleUpdateEventInfo = (updated: EventInfo) => {
    if (!isOrganizer) return; // 協助人員無此權限
    runEventMutation('修改活動資訊', cur => ({
      ...cur,
      eventInfo: {
        ...updated,
        checkInWindow: cur.eventInfo.checkInWindow,
        checkOutWindow: cur.eventInfo.checkOutWindow,
        verifyTimeoutMinutes: cur.eventInfo.verifyTimeoutMinutes
      }
    }));
  };

  // 1c. 簽到覆核期限 (分鐘，0 = 不作廢)；只影響之後送出的簽到
  const handleUpdateVerifyTimeout = (minutes: number) => {
    if (!isOrganizer) return;
    runEventMutation(minutes > 0 ? `設定簽到覆核期限 ${minutes} 分鐘` : '取消簽到覆核期限', cur => ({
      ...cur,
      eventInfo: { ...cur.eventInfo, verifyTimeoutMinutes: minutes }
    }));
  };

  // 1b. 設定簽到 / 簽退開放時段 (只改這一個欄位)
  const handleUpdateSubmitWindow = (kind: 'checkin' | 'checkout', window: SubmitWindow) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const key = kind === 'checkin' ? 'checkInWindow' : 'checkOutWindow';
    const label = kind === 'checkin' ? '簽到' : '簽退';
    const desc = !window.enabled ? `取消${label}時段限制` : `設定${label}開放時段`;
    runEventMutation(desc, cur => ({ ...cur, eventInfo: { ...cur.eventInfo, [key]: window } }));
  };

  // 2. 學員簽到 (同一人已有紀錄時，覆蓋原本那筆)
  const handleCheckInSuccess = (record: CheckInRecord, source: 'student' | 'organizer' = 'student') => {
    const cleanName = record.name.trim().toLowerCase();
    const samePerson = (c: CheckInRecord) =>
      Boolean(record.participantId && c.participantId === record.participantId) || c.name.trim().toLowerCase() === cleanName;
    // 同一人逾時作廢的舊紀錄先清掉，重新簽到使用新的紀錄 (現場追加會拿新序號)
    checkIns
      .filter(c => samePerson(c) && isVerifyExpired(c, serverNow()))
      .forEach(c => expireUnverifiedCheckIn(c.id, serverNow()).catch(() => {}));
    const existing = activeCheckIns.find(samePerson);
    const id = existing ? existing.id : record.id;
    // 覆核期限只適用學員自行簽到；承辦人協助報到不設期限
    const toWrite: CheckInRecord = source === 'student' ? { ...record, id } : { ...record, id, verifyDeadlineMs: undefined };
    if (source === 'student') rememberMyCheckIn(id, record.name);
    const result = runSync(
      writeCheckIn(toWrite, `學員報到: ${record.name}`, source),
      undefined,
      source === 'student' ? 'checkin' : undefined
    );
    // 名冊上沒有的人 → 現場追加：等雲端確認收到簽到後，配發序號 (目前最大號 + 1)
    const inRoster = roster.some(p => (record.participantId && p.id === record.participantId) || p.name.trim().toLowerCase() === cleanName);
    if (!inRoster) {
      result.then(rejectReason => {
        if (!rejectReason) requestWalkInSerial(id);
      });
    }
    return result;
  };

  // 3. 匯入名冊 (Excel/CSV)
  const handleImportRoster = (
    newParticipants: RegisteredParticipant[],
    mode: 'replace' | 'append',
    selectedColumns?: string[],
    allColumns?: string[]
  ) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const usedByWalkIns = walkInSerials(checkIns);
    runEventMutation(`匯入名冊 (${newParticipants.length}人)`, base => {
      // 序號取自 Excel「編號」欄位，缺漏或重複者從最大號往後補發
      const numbered = importRosterWithSerials(base.roster, base.lastSerialNo, newParticipants, mode, usedByWalkIns);
      // 附加匯入：保留原本的欄位與顯示設定，再加上新檔案的欄位 (例如新增的葷素、車次)
      const union = (prev: string[] | undefined, next: string[]) =>
        Array.from(new Set([...(prev || []), ...next].map(c => c.trim()).filter(Boolean)));
      const nextEventInfo: EventInfo = {
        ...base.eventInfo,
        ...(selectedColumns && selectedColumns.length > 0
          ? { completionDisplayFields: mode === 'append' ? union(base.eventInfo.completionDisplayFields, selectedColumns) : selectedColumns }
          : {}),
        ...(allColumns && allColumns.length > 0
          ? { availableRosterColumns: mode === 'append' ? union(base.eventInfo.availableRosterColumns, allColumns) : allColumns }
          : {})
      };
      return { eventInfo: nextEventInfo, roster: numbered.roster, lastSerialNo: numbered.lastSerialNo };
    });
  };

  // 4. 手動新增學員
  const handleAddRosterParticipant = (p: RegisteredParticipant) => {
    if (!isOrganizer) return; // 協助人員無此權限
    runEventMutation(`新增學員: ${p.name}`, base => {
      const numbered = addParticipantWithSerial(base.roster, base.lastSerialNo, p);
      return { ...base, roster: numbered.roster, lastSerialNo: numbered.lastSerialNo };
    });
  };

  // 5. 從名冊刪除學員
  const handleDeleteRosterParticipant = (id: string) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const target = roster.find(p => p.id === id);
    const targetName = target ? target.name : '學員';
    runEventMutation(`刪除學員: ${targetName}`, base => ({
      ...base,
      roster: base.roster.filter(p => p.id !== id && (target ? p.name !== target.name : true))
    }));
  };

  // 6. 承辦人手動協助報到
  const handleManualCheckIn = (attendee: { id: string; name: string; title: string; department?: string; phone?: string; email?: string; customFields?: Record<string, string> }) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 240, 80);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 220, 60);
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('承辦人員現場核驗報到', 120, 36);
      ctx.font = '11px sans-serif';
      ctx.fillText(new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }), 120, 56);
    }

    const stampDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const newRecord: CheckInRecord = {
      id: `manual-chk-${Date.now()}`,
      participantId: attendee.id,
      name: attendee.name,
      title: attendee.title,
      department: attendee.department,
      phone: attendee.phone,
      email: attendee.email,
      customFields: attendee.customFields,
      checkInTime: new Date().toISOString(),
      signatureDataUrl: stampDataUrl,
      isWalkIn: false,
      notes: '活動承辦人手動協助報到'
    };

    handleCheckInSuccess(newRecord, 'organizer');
  };

  // 6b. 學員簽退 (參加時間 + 路途時間 - 扣除時間)
  const handleCheckOutSuccess = (
    checkInId: string,
    checkOutTime: string,
    signatureDataUrl: string,
    durationMinutes: number,
    durationDisplay: string,
    travelMinutes?: number,
    travelDisplay?: string,
    compTimeMinutes?: number,
    compTimeDisplay?: string,
    deductionMinutes?: number,
    deductionDisplay?: string,
    deductionReason?: string
  ) => {
    const existingCheckIn = checkIns.find(c => c.id === checkInId);
    const participantName = existingCheckIn ? existingCheckIn.name : '學員';

    const useTravel = eventInfo.showTravelTime !== false;
    const actualTravelMinutes = useTravel ? (typeof travelMinutes === 'number' ? travelMinutes : (existingCheckIn?.travelMinutes ?? eventInfo.defaultTravelMinutes ?? 60)) : 0;
    const actualTravelDisplay = useTravel ? (travelDisplay || formatMinutesDisplay(actualTravelMinutes)) : undefined;

    const useDeduction = !!eventInfo.showDeductionTime;
    const actualDeductionMinutes = useDeduction ? (typeof deductionMinutes === 'number' ? deductionMinutes : (existingCheckIn?.deductionMinutes ?? eventInfo.defaultDeductionMinutes ?? 60)) : 0;
    const actualDeductionDisplay = useDeduction ? (deductionDisplay || formatMinutesDisplay(actualDeductionMinutes)) : undefined;
    const actualDeductionReason = useDeduction ? (deductionReason || eventInfo.deductionReason || '午休用餐休息時間不計入補休') : undefined;

    const compResult = calculateCompTime(durationMinutes, actualTravelMinutes, actualDeductionMinutes);
    const actualCompTime = typeof compTimeMinutes === 'number' ? compTimeMinutes : compResult.compMinutes;
    const actualCompDisplay = compTimeDisplay || compResult.compDisplay;

    return runSync(updateCheckIn(checkInId, {
      checkOutTime,
      checkOutSignatureDataUrl: signatureDataUrl,
      durationMinutes,
      durationDisplay,
      travelMinutes: actualTravelMinutes,
      travelDisplay: actualTravelDisplay,
      deductionMinutes: actualDeductionMinutes,
      deductionDisplay: actualDeductionDisplay,
      deductionReason: actualDeductionReason,
      compTimeMinutes: actualCompTime,
      compTimeDisplay: actualCompDisplay
    }, `學員簽退: ${participantName} (${durationDisplay})`, 'student'), undefined, 'checkout');
  };

  // 6c. 承辦人從後台協助簽退
  const handleManualCheckOut = (attendeeId: string) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const target = combinedAttendees.find(a => a.id === attendeeId);
    if (!target) return;

    const checkInRecord = checkIns.find(c => isSamePerson(c, attendeeId, target.name));
    if (!checkInRecord) return;

    const checkOutTime = new Date().toISOString();
    const duration = calculateParticipationDuration(checkInRecord.checkInTime, checkOutTime);
    const durationMinutes = duration?.minutes ?? 0;
    const durationDisplay = duration?.display ?? '0分鐘';

    const useTravel = eventInfo.showTravelTime !== false;
    const travelMins = useTravel ? (checkInRecord.travelMinutes ?? target.travelMinutes ?? eventInfo.defaultTravelMinutes ?? 60) : 0;
    const travelDisp = useTravel ? formatMinutesDisplay(travelMins) : undefined;

    const useDeduction = !!eventInfo.showDeductionTime;
    const deductionMins = useDeduction ? (checkInRecord.deductionMinutes ?? eventInfo.defaultDeductionMinutes ?? 60) : 0;
    const deductionDisp = useDeduction ? formatMinutesDisplay(deductionMins) : undefined;
    const deductionReason = useDeduction ? (checkInRecord.deductionReason ?? eventInfo.deductionReason ?? '午休用餐休息時間不計入補休') : undefined;

    const compResult = calculateCompTime(durationMinutes, travelMins, deductionMins);

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 240, 80);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 220, 60);
      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('承辦人員現場協助簽退', 120, 36);
      ctx.font = '11px sans-serif';
      ctx.fillText(new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }), 120, 56);
    }
    const stampDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    runSync(updateCheckIn(checkInRecord.id, {
      checkOutTime,
      checkOutSignatureDataUrl: stampDataUrl,
      durationMinutes,
      durationDisplay,
      travelMinutes: travelMins,
      travelDisplay: travelDisp,
      deductionMinutes: deductionMins,
      deductionDisplay: deductionDisp,
      deductionReason,
      compTimeMinutes: compResult.compMinutes,
      compTimeDisplay: compResult.compDisplay,
      notes: checkInRecord.notes ? `${checkInRecord.notes} / 承辦人協助簽退` : '承辦人協助簽退'
    }, `承辦人協助簽退: ${target.name}`, 'organizer'));
  };

  // 6d. 更新個別學員的路途時間
  const handleUpdateTravelTime = (attendeeId: string, minutes: number) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const targetAttendee = combinedAttendees.find(a => a.id === attendeeId);
    const targetName = targetAttendee ? targetAttendee.name : '學員';
    const action = `更新路途時間: ${targetName} (${minutes}分鐘)`;

    checkIns
      .filter(c => isSamePerson(c, attendeeId, targetAttendee?.name))
      .forEach(c => {
        const compResult = calculateCompTime(c.durationMinutes ?? 0, minutes, c.deductionMinutes ?? 0);
        runSync(updateCheckIn(c.id, {
          travelMinutes: minutes,
          travelDisplay: formatMinutesDisplay(minutes),
          compTimeMinutes: compResult.compMinutes,
          compTimeDisplay: compResult.compDisplay
        }, action, 'organizer'));
      });

    runEventMutation(action, base => ({
      ...base,
      roster: base.roster.map(r =>
        r.id === attendeeId || (targetAttendee && r.name.trim().toLowerCase() === targetAttendee.name.trim().toLowerCase())
          ? { ...r, travelMinutes: minutes }
          : r
      )
    }));
  };

  // 7. 取消單一學員的報到 (比對紀錄 ID、名冊 ID 與姓名)
  const handleRemoveCheckIn = (attendeeId: string, checkInId?: string, attendeeName?: string) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const ids = checkIns
      .filter(c => (checkInId && c.id === checkInId) || isSamePerson(c, attendeeId, attendeeName))
      .map(c => c.id);
    runSync(deleteCheckIns(ids, `取消報到: ${attendeeName || attendeeId}`));
  };

  // 7b. 貴賓標記 (名冊人員存在名冊上；現場追加存在簽到紀錄上)
  const handleToggleVip = (attendeeId: string) => {
    if (!isOrganizer) return; // 協助人員無此權限
    const target = combinedAttendees.find(a => a.id === attendeeId);
    if (!target) return;
    const next = !target.isVip;
    const action = `${next ? '標記' : '取消'}貴賓: ${target.name}`;
    if (target.status === 'WALK_IN' && target.checkInId) {
      runSync(updateCheckIn(target.checkInId, { isVip: next }, action, 'organizer'));
    } else {
      runEventMutation(action, base => ({ ...base, roster: setRosterVip(base.roster, attendeeId, next) }));
    }
  };

  // 8. 清空所有簽到紀錄
  const handleResetAllCheckIns = () => {
    if (!isOrganizer) return; // 協助人員無此權限
    runSync(deleteAllCheckIns('重設所有簽到紀錄'));
  };

  // 9. 簽到覆核 / 簽退覆核 (寫入明確的新狀態，不受其他裝置操作順序影響)
  const handleToggleHrVerify = (attendeeId: string, type: 'checkin' | 'checkout' = 'checkin') => {
    const targetAttendee = combinedAttendees.find(a => a.id === attendeeId);
    if (!targetAttendee) return;
    const action = `${type === 'checkin' ? '簽到' : '簽退'}覆核變更: ${targetAttendee.name}`;
    const isAlreadyCheckedIn = targetAttendee.status === 'CHECKED_IN' || targetAttendee.status === 'WALK_IN';

    if (isAlreadyCheckedIn) {
      const nowIso = new Date().toISOString();
      checkIns
        .filter(c => isSamePerson(c, attendeeId, targetAttendee.name))
        .forEach(c => {
          if (type === 'checkout') {
            const nextVerified = !c.checkOutHrVerified;
            runSync(updateCheckIn(c.id, {
              checkOutHrVerified: nextVerified,
              checkOutHrVerifiedAt: nextVerified ? nowIso : undefined
            }, action, 'organizer'));
          } else {
            const nextVerified = !(c.checkInHrVerified ?? c.hrVerified);
            runSync(updateCheckIn(c.id, {
              checkInHrVerified: nextVerified,
              hrVerified: nextVerified,
              checkInHrVerifiedAt: nextVerified ? nowIso : undefined,
              // 覆核後期限即解除；之後即使誤按取消覆核，也不會因逾時被作廢
              ...(nextVerified ? { verifyDeadlineMs: undefined } : {})
            }, action, 'organizer'));
          }
        });
      return;
    }

    if (type !== 'checkin' || !isOrganizer) return; // 協助人員不可代為報到

    // 尚未簽到但人事按下覆核 → 直接以人事覆核章完成簽到
    const now = new Date();
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 240, 80);
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 220, 60);
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('人事單位現場簽到覆核', 120, 36);
      ctx.font = '11px sans-serif';
      ctx.fillText(now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }), 120, 56);
    }
    const stampDataUrl = canvas.toDataURL('image/jpeg', 0.8);

    runSync(writeCheckIn({
      id: `hr-checkin-${now.getTime()}`,
      participantId: targetAttendee.id,
      name: targetAttendee.name,
      title: targetAttendee.title,
      department: targetAttendee.department,
      checkInTime: now.toISOString(),
      signatureDataUrl: stampDataUrl,
      isWalkIn: false,
      checkInHrVerified: true,
      hrVerified: true,
      checkInHrVerifiedAt: now.toISOString(),
      notes: '人事單位現場直接簽到覆核'
    }, action, 'organizer'));
  };

  // Combined real-time attendee comparison list (傳入 eventInfo 完整包含路途時間與扣除時間設定)
  // 簽到覆核逾時作廢：到期那一刻重新整理畫面，所有畫面只看「有效」的簽到紀錄
  const [, setExpiryTick] = useState(0);
  const nowMs = serverNow();
  const nextExpiry = nextVerifyExpiry(checkIns, nowMs);
  useEffect(() => {
    if (nextExpiry === undefined) return;
    const timer = setTimeout(() => setExpiryTick(t => t + 1), Math.max(0, nextExpiry - serverNow()) + 50);
    return () => clearTimeout(timer);
  }, [nextExpiry]);
  const activeCheckIns = checkIns.filter(c => !isVerifyExpired(c, nowMs));
  const expiredIdsKey = checkIns.filter(c => isVerifyExpired(c, nowMs)).map(c => c.id).join(',');

  // 後台開著時 (承辦人或協助人員)，自動刪除逾時未覆核的紀錄
  const expiringRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isOrganizerAuthenticated || !expiredIdsKey) return;
    expiredIdsKey.split(',').forEach(id => {
      if (expiringRef.current.has(id)) return;
      expiringRef.current.add(id);
      expireUnverifiedCheckIn(id, serverNow())
        .catch(err => console.warn('[Verify] expire failed, will retry:', (err as { code?: string })?.code || err))
        .finally(() => expiringRef.current.delete(id));
    });
  }, [isOrganizerAuthenticated, expiredIdsKey, syncStatus]);

  // 學員報到成功頁倒數結束時呼叫
  const handleExpireCheckIn = (checkInId: string) => {
    expireUnverifiedCheckIn(checkInId, serverNow()).catch(() => {});
  };

  const combinedAttendees = buildCombinedAttendeeList(roster, activeCheckIns, eventInfo);

  // 恢復連線時，補發先前沒配發成功的序號
  useEffect(() => {
    if (syncStatus === 'synced' && pendingSerialIdsRef.current.size > 0) runSerialWorker();
  }, [syncStatus]);

  // 承辦人後台開著時：補發所有缺號的現場追加人員 (依簽到時間先後)，
  // 確保學員手機已關閉或離線時，序號也一定會補上
  const missingSerialKey = combinedAttendees
    .filter(a => a.status === 'WALK_IN' && a.serialNo === undefined && a.checkInId)
    .sort((a, b) => (a.checkInTime || '').localeCompare(b.checkInTime || ''))
    .map(a => a.checkInId as string)
    .join(',');
  useEffect(() => {
    if (!isOrganizerAuthenticated || !missingSerialKey || syncStatus !== 'synced') return;
    missingSerialKey.split(',').forEach(id => pendingSerialIdsRef.current.add(id));
    runSerialWorker();
  }, [isOrganizerAuthenticated, missingSerialKey, syncStatus]);

  // 承辦人後台開著時：名冊有缺號或重複的人，從最大號往後補發 (舊資料轉換)
  const rosterNeedsSerials = !rosterSerialsComplete(roster);
  useEffect(() => {
    if (!isOrganizerAuthenticated || !rosterNeedsSerials || syncStatus !== 'synced') return;
    normalizeRosterSerials().catch(err => console.warn('[Serial] roster normalize failed:', err));
  }, [isOrganizerAuthenticated, rosterNeedsSerials, syncStatus]);

  const checkedInCount = combinedAttendees.filter(
    a => a.status === 'CHECKED_IN' || a.status === 'WALK_IN'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Top Application Header */}
      <EventHeader
        eventInfo={eventInfo}
        onUpdateEventInfo={handleUpdateEventInfo}
        activeMode={activeMode}
        onRequestSwitchMode={handleRequestSwitchMode}
        isOrganizerAuthenticated={isOrganizerAuthenticated}
        staffRole={staffRole}
        onOrganizerLogout={handleOrganizerLogout}
        checkedInCount={checkedInCount}
        totalExpectedCount={roster.length}
        myDeviceId={myDeviceIdRef.current}
        lastSyncInfo={lastSyncInfo}
        syncStatus={syncStatus}
        syncError={syncError}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeMode === 'checkin' ? (
          <CheckInForm
            eventInfo={eventInfo}
            roster={roster}
            existingCheckIns={activeCheckIns}
            onCheckInSuccess={handleCheckInSuccess}
            onExpireCheckIn={handleExpireCheckIn}
            onNavigateToLookup={() => handleRequestSwitchMode('lookup')}
            onNavigateToDashboard={() => handleRequestSwitchMode('dashboard')}
          />
        ) : activeMode === 'lookup' ? (
          <CheckInLookup
            eventInfo={eventInfo}
            attendees={combinedAttendees}
            onNavigateToCheckIn={() => handleRequestSwitchMode('checkin')}
            dataReady={syncStatus !== 'connecting'}
          />
        ) : activeMode === 'vip' ? (
          <VipStatusBoard eventInfo={eventInfo} attendees={combinedAttendees} />
        ) : activeMode === 'checkout' ? (
          <CheckOutForm
            eventInfo={eventInfo}
            attendees={combinedAttendees}
            existingCheckIns={activeCheckIns}
            onCheckOutSuccess={handleCheckOutSuccess}
            onToggleHrVerify={handleToggleHrVerify}
            onNavigateToCheckIn={() => handleRequestSwitchMode('checkin')}
            onNavigateToDashboard={() => handleRequestSwitchMode('dashboard')}
          />
        ) : (
          <Dashboard
            eventInfo={eventInfo}
            roster={roster}
            checkIns={activeCheckIns}
            attendees={combinedAttendees}
            staffRole={staffRole ?? 'helper'}
            onUpdateVerifyTimeout={handleUpdateVerifyTimeout}
            onUpdateEventInfo={handleUpdateEventInfo}
            onUpdateSubmitWindow={handleUpdateSubmitWindow}
            onImportRoster={handleImportRoster}
            onAddRosterParticipant={handleAddRosterParticipant}
            onDeleteRosterParticipant={handleDeleteRosterParticipant}
            onManualCheckIn={handleManualCheckIn}
            onManualCheckOut={handleManualCheckOut}
            onUpdateTravelTime={handleUpdateTravelTime}
            onRemoveCheckIn={handleRemoveCheckIn}
            onResetAllCheckIns={handleResetAllCheckIns}
            onToggleHrVerify={handleToggleHrVerify}
            onToggleVip={handleToggleVip}
            onNavigateToCheckIn={() => handleRequestSwitchMode('checkin')}
            onNavigateToCheckOut={() => handleRequestSwitchMode('checkout')}
            onLogout={handleOrganizerLogout}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">苗栗縣三義鄉公所培訓或活動簽到系統</span>
            <span>·</span>
            <span className="text-emerald-700 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              手機與電腦透過雲端資料庫即時同步
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>
              目前模式：
              {activeMode === 'checkin'
                ? '現場學員手寫簽到'
                : activeMode === 'checkout'
                ? '學員簽退端 (參加時間主動計算)'
                : activeMode === 'vip'
                ? '貴賓報到情形'
                : activeMode === 'lookup'
                ? '報到資訊查詢'
                : '承辦人比對後台 (已解鎖)'}
            </span>
            <span>·</span>
            <button
              type="button"
              onClick={() => handleRequestSwitchMode(activeMode === 'dashboard' ? 'checkin' : 'dashboard')}
              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              {activeMode === 'dashboard' ? '前往學員簽到端' : '承辦人後台 (需密碼)'}
            </button>
          </div>
        </div>
      </footer>

      {/* Organizer Password Authentication Modal */}
      <OrganizerAuthModal
        isOpen={showAuthModal}
        onSuccess={handleAuthSuccess}
        onClose={() => setShowAuthModal(false)}
        helperPassword={eventInfo.helperPassword}
      />
    </div>
  );
}
