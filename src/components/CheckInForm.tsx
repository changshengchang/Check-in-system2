import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckInRecord, EventInfo, RegisteredParticipant } from '../types';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';
import { SubmitWindowNotice, getWindowBlockedMessage } from './SubmitWindowNotice';
import { useSubmitWindow, getWindowStatus, serverNow } from '../utils/submitWindow';
import { rosterSerialOf, parseSerial } from '../utils/serial';
import { verifyDeadlineFor, verifyTimeoutMinutes, successState, isCheckInVerified } from '../utils/verify';
import { forgetMyCheckIn } from '../utils/myCheckIns';
import { completionFieldRows } from '../utils/lookup';
import { VerifyTopBanner, VerifyBottomStatus } from './CheckInVerifyStatus';
import {
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  UserPlus,
  Sparkles,
  Calendar,
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  Building
} from 'lucide-react';

interface CheckInFormProps {
  eventInfo: EventInfo;
  roster: RegisteredParticipant[];
  existingCheckIns: CheckInRecord[];
  /** 回傳 Promise：null = 雲端已接受；字串 = 被拒絕的原因 */
  onCheckInSuccess: (record: CheckInRecord) => Promise<string | null> | void;
  /** 報到成功頁倒數結束 (逾時未覆核) 時通知，刪除作廢的紀錄 */
  onExpireCheckIn?: (checkInId: string) => void;
  onNavigateToLookup?: () => void;
  onNavigateToDashboard: () => void;
}

export const CheckInForm: React.FC<CheckInFormProps> = ({
  eventInfo,
  roster,
  existingCheckIns,
  onCheckInSuccess,
  onExpireCheckIn,
  onNavigateToLookup,
  onNavigateToDashboard
}) => {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [matchedParticipant, setMatchedParticipant] = useState<RegisteredParticipant | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success dialog state
  const [recentCheckedIn, setRecentCheckedIn] = useState<CheckInRecord | null>(null);
  // Duplicate alert modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState<{
    name: string;
    time: string;
    message: string;
  } | null>(null);

  const signaturePadRef = useRef<SignaturePadHandle | null>(null);

  // 簽到開放時段 (承辦人於後台設定，時段外不可送出)
  const windowStatus = useSubmitWindow(eventInfo.checkInWindow);

  // 報到成功頁：即時追蹤這筆紀錄的覆核狀態與倒數
  const liveRecord = recentCheckedIn ? existingCheckIns.find(c => c.id === recentCheckedIn.id) : undefined;
  const seenLiveRef = useRef<string | null>(null);
  if (recentCheckedIn && liveRecord) seenLiveRef.current = recentCheckedIn.id;
  const [nowTick, setNowTick] = useState(() => serverNow());
  const verifyState = recentCheckedIn
    ? successState(recentCheckedIn, liveRecord, nowTick, seenLiveRef.current === recentCheckedIn.id)
    : 'no-deadline';
  useEffect(() => {
    if (!recentCheckedIn || verifyState !== 'pending') return;
    setNowTick(serverNow());
    const timer = setInterval(() => setNowTick(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [recentCheckedIn?.id, verifyState]);
  // 倒數結束：通知刪除作廢的紀錄 (只通知一次)
  const expiredNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (recentCheckedIn && verifyState === 'expired' && expiredNotifiedRef.current !== recentCheckedIn.id) {
      expiredNotifiedRef.current = recentCheckedIn.id;
      onExpireCheckIn?.(recentCheckedIn.id);
      forgetMyCheckIn(recentCheckedIn.id);
    }
  }, [recentCheckedIn?.id, verifyState]);
  const remainingMs = recentCheckedIn?.verifyDeadlineMs !== undefined ? recentCheckedIn.verifyDeadlineMs - nowTick : undefined;

  // 逾時或被取消後重新簽到：帶入原本的姓名、職稱、部門，只需重新簽名
  const handleRetryCheckIn = () => {
    if (!recentCheckedIn) return;
    const prev = recentCheckedIn;
    const rosterPerson = roster.find(p =>
      (prev.participantId && p.id === prev.participantId) || p.name.trim().toLowerCase() === prev.name.trim().toLowerCase()
    );
    setRecentCheckedIn(null);
    setName(prev.name);
    setTitle(prev.title || '');
    setDepartment(prev.department || '');
    setMatchedParticipant(rosterPerson || null);
    setIsWalkIn(!rosterPerson);
    setErrorMessage('請重新簽名後送出');
    signaturePadRef.current?.clear();
  };

  // Already checked in IDs/names
  const checkedInIds = new Set(existingCheckIns.map(c => c.participantId).filter(Boolean));
  const checkedInNames = new Set(existingCheckIns.map(c => c.name.trim().toLowerCase()));

  // Search filtered suggestions from roster
  const searchSuggestions = name.trim().length > 0
    ? roster.filter(p =>
        p.name.toLowerCase().includes(name.trim().toLowerCase()) ||
        p.title.toLowerCase().includes(name.trim().toLowerCase()) ||
        (p.department && p.department.toLowerCase().includes(name.trim().toLowerCase()))
      ).slice(0, 5)
    : [];

  // When selecting an attendee from the pre-registered list
  const handleSelectParticipant = (p: RegisteredParticipant) => {
    setName(p.name);
    setTitle(p.title);
    setDepartment(p.department || '');
    setMatchedParticipant(p);
    setIsWalkIn(false);
    setErrorMessage('');

    // Check if already checked in
    if (checkedInIds.has(p.id) || checkedInNames.has(p.name.trim().toLowerCase())) {
      setErrorMessage(`【重複簽到警示】「${p.name}」已完成過報到，送出時系統將拒絕重複簽到！`);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setErrorMessage('');

    // Try auto-match exact name
    const exact = roster.find(p => p.name.trim() === val.trim());
    if (exact) {
      setMatchedParticipant(exact);
      setTitle(exact.title);
      setDepartment(exact.department || '');
      setIsWalkIn(false);

      if (checkedInIds.has(exact.id) || checkedInNames.has(exact.name.trim().toLowerCase())) {
        setErrorMessage(`【重複簽到警示】「${exact.name}」已於先前完成報到。`);
      }
    } else {
      if (matchedParticipant && matchedParticipant.name !== val) {
        setMatchedParticipant(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('請輸入參加人員「姓名」');
      return;
    }

    // 送出當下再以伺服器時間確認一次開放時段
    const windowNow = getWindowStatus(eventInfo.checkInWindow, serverNow());
    if (!windowNow.canSubmit) {
      setErrorMessage(getWindowBlockedMessage(windowNow, 'checkin'));
      return;
    }

    // Requirement 4: Duplicate Check-In verification (重複簽到定義:已完成簽到名冊中如已有相同姓名,則視為重複簽到)
    const duplicateRecord = existingCheckIns.find(
      c => c.name.trim().toLowerCase() === trimmedName.toLowerCase() ||
           (matchedParticipant && c.participantId === matchedParticipant.id)
    );

    if (duplicateRecord) {
      const timeStr = duplicateRecord.checkInTime
        ? new Date(duplicateRecord.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })
        : '今日稍早';
      const dupMsg = `【重複簽到警示】「${trimmedName}」已於 ${timeStr} 完成活動簽到，系統判定為重複簽到，已拒絕送出！`;
      setErrorMessage(dupMsg);
      setShowDuplicateModal({
        name: trimmedName,
        time: timeStr,
        message: dupMsg
      });
      setIsSubmitting(false);
      return;
    }

    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setErrorMessage('請在下方簽署區完成手寫簽名後再送出！');
      return;
    }

    const signatureDataUrl = signaturePadRef.current.getDataUrl();
    if (!signatureDataUrl) {
      setErrorMessage('簽名處理失敗，請重新簽名');
      return;
    }

    setIsSubmitting(true);

    const now = new Date();
    const newRecord: CheckInRecord = {
      id: `checkin-${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`,
      participantId: matchedParticipant ? matchedParticipant.id : undefined,
      name: trimmedName,
      title: title.trim() || (matchedParticipant ? matchedParticipant.title : (isWalkIn ? '現場報名人員' : '學員')),
      department: department.trim() || matchedParticipant?.department || undefined,
      phone: matchedParticipant?.phone,
      email: matchedParticipant?.email,
      customFields: matchedParticipant?.customFields,
      checkInTime: now.toISOString(),
      // 須在期限內完成簽到覆核，否則作廢 (以伺服器時間計算)
      verifyDeadlineMs: verifyDeadlineFor(eventInfo, serverNow()),
      signatureDataUrl,
      isWalkIn: !matchedParticipant,
      notes: notes.trim() || undefined
    };

    // Trigger celebratory confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // ignore
    }

    // 雲端若拒絕 (例如手機時間不準、實際已超過截止時間)，收回成功畫面並顯示原因
    Promise.resolve(onCheckInSuccess(newRecord)).then(rejectReason => {
      if (!rejectReason) return;
      setRecentCheckedIn(cur => (cur && cur.id === newRecord.id ? null : cur));
      setErrorMessage(`「${newRecord.name}」${rejectReason}`);
    });
    setRecentCheckedIn(newRecord);
    setIsSubmitting(false);
  };

  const handleResetForNext = () => {
    if (recentCheckedIn && verifyState === 'verified') forgetMyCheckIn(recentCheckedIn.id);
    setName('');
    setTitle('');
    setDepartment('');
    setNotes('');
    setMatchedParticipant(null);
    setIsWalkIn(false);
    setErrorMessage('');
    setRecentCheckedIn(null);
    setShowDuplicateModal(null);
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  // Complete list of attendees waiting to check in (consistent with organizer roster)
  const pendingAttendees = roster.filter(
    p => !checkedInIds.has(p.id) && !checkedInNames.has(p.name.trim().toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white p-6 mb-6 shadow-lg border-t-4 border-blue-400">
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/30 text-blue-100 border border-blue-400/30 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>【學員簽到端 · 入場報到專區】</span>
            </div>
            <div className="text-xs font-medium text-blue-100/90 bg-blue-950/40 px-3 py-1 rounded-full border border-blue-400/30 backdrop-blur-xs shadow-xs">
              系統設計者：詹昇鎮
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 text-white">
            {eventInfo.title}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-blue-100/90 pt-3 border-t border-blue-500/30">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-300 shrink-0" />
              <span>日期：{eventInfo.date || '今日'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-300 shrink-0" />
              <span>時間：{eventInfo.time || '研習時間'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-300 shrink-0" />
              <span className="truncate">地點：{eventInfo.location || '研習教室'}</span>
            </div>
          </div>

          {eventInfo.notes && (
            <div className="mt-3 bg-blue-900/50 rounded-lg p-2.5 text-xs text-blue-100 flex items-center gap-2 border border-blue-400/20">
              <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>{eventInfo.notes}</span>
            </div>
          )}
        </div>

        {/* Decorative background circle */}
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
      </div>

      {/* Main Check-In Card */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200/80 overflow-hidden">
        <div className="p-6 border-b border-blue-100 bg-blue-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 mb-1">
              STEP 1 · 現場入場簽到
            </div>
            <h3 className="text-xl font-black text-blue-950 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <span>學員簽到報名表單</span>
            </h3>
            <p className="text-xs text-blue-800/80 mt-0.5 font-medium">
              請輸入或點選姓名，確認身分與職稱後，於手寫簽署區完成手寫簽名
            </p>
          </div>

          {/* Quick toggle for walk-in */}
          <button
            type="button"
            onClick={() => {
              setIsWalkIn(!isWalkIn);
              if (!isWalkIn) {
                setMatchedParticipant(null);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isWalkIn
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isWalkIn ? '✓ 現場臨時追加模式' : '+ 現場臨時報到 (未在名冊中)'}</span>
          </button>
        </div>

        {/* Quick Click Roster Chips for faster sign-in */}
        {pendingAttendees.length > 0 && !isWalkIn && (
          <div className="px-6 py-3.5 bg-blue-50/50 border-b border-blue-100/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-blue-600" />
                快速點選您的姓名簽到（待報到名單）：
              </span>
              <span className="text-[11px] text-blue-600 font-bold">共 {pendingAttendees.length} 位</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-1">
              {pendingAttendees.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleSelectParticipant(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                    matchedParticipant?.id === p.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/80'
                  }`}
                >
                  <span className="font-bold">{p.name}</span>
                  <span className="text-[11px] opacity-75">({p.title})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Form Row: Name with smart auto-suggest */}
          <div className="relative">
            <label className="block text-sm font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span>參加人員「姓名」</span>
                <span className="text-rose-500 font-bold">*必填</span>
              </span>
              {matchedParticipant && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已自動比對預先報名名冊
                </span>
              )}
            </label>

            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="請輸入您的真實姓名 (例: 王大偉)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base font-semibold text-slate-900 bg-white shadow-xs"
              />
              {name && (
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    setMatchedParticipant(null);
                  }}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  清除
                </button>
              )}
            </div>

            {/* Autocomplete dropdown */}
            {searchSuggestions.length > 0 && !matchedParticipant && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 bg-slate-50">
                  找到名冊中符合的學員，點擊即可帶入資料：
                </div>
                {searchSuggestions.map(p => {
                  const alreadyDone = checkedInIds.has(p.id) || checkedInNames.has(p.name.trim().toLowerCase());
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleSelectParticipant(p)}
                      className="w-full text-left px-3.5 py-2 hover:bg-blue-50 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                        <span className="ml-2 text-slate-500">{p.title}</span>
                        {p.department && <span className="ml-1 text-slate-400">· {p.department}</span>}
                      </div>
                      {alreadyDone ? (
                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          已報到
                        </span>
                      ) : (
                        <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                          選擇
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form Row: Title and Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                <span>職稱 (Job Title)</span>
                {matchedParticipant && <span className="text-[11px] text-blue-600">(自動比對)</span>}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：高級後端工程師 / 經理"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>服務部門 / 單位 (選填)</span>
              </label>
              <input
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                placeholder="例如：資訊研發處 / 人資部"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              備註說明 (選填，如用餐需求、座位需求或代簽人)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="無特殊需求可留空"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
            />
          </div>

          {/* Interactive Signature Pad Component */}
          <div className="pt-2">
            <SignaturePad ref={signaturePadRef} height={180} />
          </div>

          {/* Error notice if validation fails */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 開放時段提示 */}
          <SubmitWindowNotice status={windowStatus} kind="checkin" />

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !windowStatus.canSubmit}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-white text-base shadow-md transition-all flex items-center justify-center gap-2 ${
                windowStatus.canSubmit
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>確認送出並完成活動報到</span>
            </button>
          </div>
        </form>
      </div>

      {/* Success Modal Confirmation Dialog */}
      {recentCheckedIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[94vh] overflow-y-auto text-center p-6 sm:p-8" data-testid="checkin-success">
            <VerifyTopBanner state={verifyState} timeoutMinutes={verifyTimeoutMinutes(eventInfo)} />
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              報到手續完成！
            </h3>
            {verifyState !== 'verified' && (
              <p className="text-sm font-bold text-red-600 mt-1.5 tracking-wide">
                歡迎參加本次訓練與活動,請記得向人事單位告知【簽到覆核】
              </p>
            )}

            {/* Check-in Details Card */}
            <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-xs">
              {(() => {
                // 序號：名冊人員取名冊序號；現場追加等雲端配發後即時顯示
                const rosterPerson = roster.find(p =>
                  (recentCheckedIn.participantId && p.id === recentCheckedIn.participantId) ||
                  p.name.trim().toLowerCase() === recentCheckedIn.name.trim().toLowerCase()
                );
                const live = existingCheckIns.find(c => c.id === recentCheckedIn.id);
                const serial = rosterPerson ? rosterSerialOf(rosterPerson) : parseSerial(live?.serialNo);
                return (
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
                    <span className="text-slate-500">您的序號</span>
                    {serial !== undefined ? (
                      <span className="font-black text-2xl text-blue-700 font-mono" data-testid="success-serial">{serial}</span>
                    ) : (
                      <span className="text-xs text-slate-400" data-testid="success-serial-pending">序號產生中…</span>
                    )}
                  </div>
                );
              })()}
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">參加學員</span>
                <span className="font-bold text-slate-900 text-sm">{recentCheckedIn.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">職稱 / 單位</span>
                <span className="font-semibold text-slate-800">
                  {recentCheckedIn.title} {recentCheckedIn.department ? `(${recentCheckedIn.department})` : ''}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">報到時間</span>
                <span className="font-mono text-slate-700">
                  {new Date(recentCheckedIn.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">簽到覆核狀態</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  isCheckInVerified(liveRecord ?? recentCheckedIn)
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`} data-testid="success-verify-badge">
                  {isCheckInVerified(liveRecord ?? recentCheckedIn) ? '✓ 簽到已覆核' : '⏳ 簽到未覆核 (請洽人事)'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">名冊狀態</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  recentCheckedIn.isWalkIn ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {recentCheckedIn.isWalkIn ? '現場追加報到' : '預先報名符合'}
                </span>
              </div>

              {/* 名冊欄位 (承辦人勾選，例如桌次、葷素、車次) */}
              {completionFieldRows(eventInfo, recentCheckedIn).map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-slate-200" data-testid="success-field">
                  <span className="text-slate-500 font-medium">{label}</span>
                  <span className="font-semibold text-slate-800 text-right">{value}</span>
                </div>
              ))}

              {/* Signature snapshot thumbnail */}
              {recentCheckedIn.signatureDataUrl && (
                <div className="pt-2">
                  <div className="text-[11px] text-slate-400 mb-1">數位手寫簽署存根：</div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-center">
                    <img
                      src={recentCheckedIn.signatureDataUrl}
                      alt="手寫簽名"
                      className="h-12 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 覆核倒數 / 覆核成功 / 逾時失效 */}
            <VerifyBottomStatus state={verifyState} remainingMs={remainingMs} onRetry={handleRetryCheckIn} />

            {/* Action Buttons */}
            {verifyState !== 'expired' && verifyState !== 'cancelled' && (
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleResetForNext}
                  data-testid="checkin-done"
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>報到完成</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {verifyState === 'pending' && (
                  <p className="text-[11px] text-slate-500">
                    關閉後可在
                    {onNavigateToLookup ? (
                      <button type="button" onClick={onNavigateToLookup} className="mx-0.5 text-teal-700 font-bold underline cursor-pointer">「報到資訊查詢」</button>
                    ) : '「報到資訊查詢」'}
                    查看覆核狀態與剩餘時間
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicate Check-In Alert Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-rose-300 max-w-md w-full overflow-hidden text-center p-6 sm:p-8">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-rose-50 animate-bounce">
              <AlertCircle className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold mb-2">
              <span>【重複簽到警示 · 拒絕送出】</span>
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              學員「{showDuplicateModal.name}」已完成簽到！
            </h3>

            <div className="mt-4 p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-left text-xs text-rose-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">
                  系統偵測到簽到名冊中已有相同姓名「{showDuplicateModal.name}」於 <span className="font-bold underline">{showDuplicateModal.time}</span> 完成簽到手續。
                </p>
              </div>
              <p className="text-slate-600 text-[11px] pl-6">
                依活動管理規定，每位學員僅需簽到一次，請勿重複提交。如有換人或修改需求，請向現場人事或主辦承辦人洽詢。
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(null)}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-colors cursor-pointer"
              >
                我知道了，返回表單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
