import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckInRecord, EventInfo, CombinedAttendeeView } from '../types';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';
import { SubmitWindowNotice, getWindowBlockedMessage } from './SubmitWindowNotice';
import { CheckoutVerifyStatus } from './CheckInVerifyStatus';
import { completionFieldRows } from '../utils/lookup';
import { useSubmitWindow, getWindowStatus, serverNow } from '../utils/submitWindow';
import {
  calculateParticipationDuration,
  calculateCompTime,
  formatMinutesDisplay
} from '../utils/storage';
import {
  LogOut,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  Calendar,
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  Building,
  Hourglass,
  UserCheck,
  Car,
  FileCheck2,
  Award
} from 'lucide-react';

interface CheckOutFormProps {
  eventInfo: EventInfo;
  attendees: CombinedAttendeeView[];
  existingCheckIns: CheckInRecord[];
  onCheckOutSuccess: (
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
  ) => Promise<string | null> | void;
  onToggleHrVerify?: (attendeeId: string, type?: 'checkin' | 'checkout') => void;
  onNavigateToDashboard: () => void;
  onNavigateToCheckIn: () => void;
}

export const CheckOutForm: React.FC<CheckOutFormProps> = ({
  eventInfo,
  attendees,
  existingCheckIns,
  onCheckOutSuccess,
  onToggleHrVerify,
  onNavigateToDashboard,
  onNavigateToCheckIn
}) => {
  const [name, setName] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<CombinedAttendeeView | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // 統一路途時間 (由承辦人在後台統一設定，全體學員均相同)
  const showTravel = eventInfo.showTravelTime !== false;
  const unifiedTravelMinutes = showTravel ? (eventInfo.defaultTravelMinutes ?? 60) : 0;

  // 統一扣除時間 (由承辦人在後台統一設定，可勾選啟用並設定原因)
  const showDeduction = Boolean(eventInfo.showDeductionTime);
  const unifiedDeductionMinutes = showDeduction ? (eventInfo.defaultDeductionMinutes ?? 0) : 0;
  const deductionReason = eventInfo.deductionReason || '午休用餐休息時間不計入補休';

  // Duplicate Check-Out modal
  const [showDuplicateModal, setShowDuplicateModal] = useState<{
    name: string;
    time: string;
    message: string;
  } | null>(null);

  // Success dialog state
  const [recentCheckedOut, setRecentCheckedOut] = useState<{
    checkInId: string;
    name: string;
    title: string;
    department?: string;
    checkInTime: string;
    checkOutTime: string;
    durationDisplay: string;
    travelDisplay: string;
    deductionDisplay?: string;
    deductionReason?: string;
    compTimeDisplay: string;
    signatureDataUrl: string;
    checkOutHrVerified?: boolean;
    customFields?: Record<string, string>;
    phone?: string;
    email?: string;
    notes?: string;
  } | null>(null);

  const signaturePadRef = useRef<SignaturePadHandle | null>(null);

  // 簽退開放時段 (承辦人於後台設定，時段外不可送出)
  const windowStatus = useSubmitWindow(eventInfo.checkOutWindow);

  // Live timer tick for accurate duration preview
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter attendees eligible for check-out: must have checked in
  const checkedInAttendees = attendees.filter(
    a => a.status === 'CHECKED_IN' || a.status === 'WALK_IN'
  );

  // Attendees who checked in but haven't signed out yet
  const pendingCheckOutAttendees = checkedInAttendees.filter(a => !a.checkOutTime);

  // Search filtered suggestions among checked-in attendees
  const searchSuggestions = name.trim().length > 0
    ? checkedInAttendees.filter(p =>
        p.name.toLowerCase().includes(name.trim().toLowerCase()) ||
        p.title.toLowerCase().includes(name.trim().toLowerCase()) ||
        (p.department && p.department.toLowerCase().includes(name.trim().toLowerCase()))
      ).slice(0, 6)
    : [];

  const handleSelectAttendee = (a: CombinedAttendeeView) => {
    setName(a.name);
    setSelectedAttendee(a);
    setErrorMessage('');

    if (a.checkOutTime) {
      setErrorMessage(`【重複簽退警示】「${a.name}」已於 ${new Date(a.checkOutTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })} 完成過簽退，送出時系統將拒絕重複簽退！`);
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setErrorMessage('');

    const exact = checkedInAttendees.find(p => p.name.trim() === val.trim());
    if (exact) {
      setSelectedAttendee(exact);
      if (exact.checkOutTime) {
        setErrorMessage(`【重複簽退警示】「${exact.name}」已於先前完成過簽退。`);
      }
    } else {
      if (selectedAttendee && selectedAttendee.name !== val) {
        setSelectedAttendee(null);
      }
    }
  };

  // Calculate live preview duration: check-out time - check-in time
  const liveDuration = selectedAttendee?.checkInTime
    ? calculateParticipationDuration(selectedAttendee.checkInTime, currentTime.toISOString())
    : null;

  // Live Comp Time: "參加時間(計算)" ＋ 路途時間 － 扣除時間
  const liveCompCalculation = liveDuration
    ? calculateCompTime(liveDuration.minutes, unifiedTravelMinutes, unifiedDeductionMinutes)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedAttendee) {
      setErrorMessage('請點選或搜尋已完成「簽到」的學員姓名！若尚未簽到，請先至「學員簽到端」完成簽到。');
      return;
    }

    if (!selectedAttendee.checkInTime) {
      setErrorMessage('此學員查無簽到時間紀錄，無法計算簽退時數！');
      return;
    }

    // 送出當下再以伺服器時間確認一次開放時段
    const windowNow = getWindowStatus(eventInfo.checkOutWindow, serverNow());
    if (!windowNow.canSubmit) {
      setErrorMessage(getWindowBlockedMessage(windowNow, 'checkout'));
      return;
    }

    // Requirement 4: Duplicate Check-Out verification
    // 重複簽退定義: 已完成簽退名冊中如已有相同姓名且已簽退，出現重複簽退訊息並拒絕送出
    const duplicateCheckOut = attendees.find(
      a => a.name.trim().toLowerCase() === selectedAttendee.name.trim().toLowerCase() && !!a.checkOutTime
    );

    if (duplicateCheckOut) {
      const timeStr = duplicateCheckOut.checkOutTime
        ? new Date(duplicateCheckOut.checkOutTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })
        : '今日稍早';
      const dupMsg = `【重複簽退警示】「${selectedAttendee.name}」已於 ${timeStr} 完成簽退，系統判定為重複簽退，已拒絕送出！`;
      setErrorMessage(dupMsg);
      setShowDuplicateModal({
        name: selectedAttendee.name,
        time: timeStr,
        message: dupMsg
      });
      setIsSubmitting(false);
      return;
    }

    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      setErrorMessage('請在下方簽署區完成手寫簽退簽名後再送出！');
      return;
    }

    const signatureDataUrl = signaturePadRef.current.getDataUrl();
    if (!signatureDataUrl) {
      setErrorMessage('簽名處理失敗，請重新簽名');
      return;
    }

    setIsSubmitting(true);

    const nowIso = new Date().toISOString();
    const duration = calculateParticipationDuration(selectedAttendee.checkInTime, nowIso);
    const durationMinutes = duration?.minutes || 1;
    const durationDisplay = duration?.display || '1分鐘';

    // 核予補休時間 ＝ 參加時間(計算) ＋ 路途時間 － 扣除時間
    const compResult = calculateCompTime(durationMinutes, unifiedTravelMinutes, unifiedDeductionMinutes);
    const travelDisplay = unifiedTravelMinutes > 0 ? formatMinutesDisplay(unifiedTravelMinutes) : '0分鐘';
    const deductionDisplay = unifiedDeductionMinutes > 0 ? formatMinutesDisplay(unifiedDeductionMinutes) : '0分鐘';

    // Target check-in record id
    const targetCheckInId = selectedAttendee.checkInId || selectedAttendee.id;

    // Trigger celebratory confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // ignore
    }

    const submittedName = selectedAttendee.name;
    const submitResult = onCheckOutSuccess(
      targetCheckInId,
      nowIso,
      signatureDataUrl,
      durationMinutes,
      durationDisplay,
      unifiedTravelMinutes,
      travelDisplay,
      compResult.compMinutes,
      compResult.compDisplay,
      unifiedDeductionMinutes,
      deductionDisplay,
      deductionReason
    );

    // 雲端若拒絕 (例如手機時間不準、實際已超過截止時間)，收回成功畫面並顯示原因
    Promise.resolve(submitResult).then(rejectReason => {
      if (!rejectReason) return;
      setRecentCheckedOut(cur => (cur && cur.name === submittedName && cur.checkOutTime === nowIso ? null : cur));
      setErrorMessage(`「${submittedName}」${rejectReason}`);
    });

    setRecentCheckedOut({
      checkInId: targetCheckInId,
      name: selectedAttendee.name,
      title: selectedAttendee.title,
      department: selectedAttendee.department,
      checkInTime: selectedAttendee.checkInTime,
      checkOutTime: nowIso,
      durationDisplay,
      travelDisplay,
      deductionDisplay,
      deductionReason,
      compTimeDisplay: compResult.compDisplay,
      signatureDataUrl,
      checkOutHrVerified: selectedAttendee.checkOutHrVerified,
      customFields: selectedAttendee.customFields,
      phone: selectedAttendee.phone,
      email: selectedAttendee.email,
      notes: selectedAttendee.notes
    });

    setIsSubmitting(false);
  };

  // 簽退成功頁：即時追蹤簽退覆核狀態 (人事在後台覆核後立即更新)
  const liveCheckOutRecord = recentCheckedOut ? existingCheckIns.find(c => c.id === recentCheckedOut.checkInId) : undefined;
  const checkOutVerified = Boolean(liveCheckOutRecord ? liveCheckOutRecord.checkOutHrVerified : recentCheckedOut?.checkOutHrVerified);

  const handleResetForNext = () => {
    setName('');
    setSelectedAttendee(null);
    setErrorMessage('');
    setRecentCheckedOut(null);
    setShowDuplicateModal(null);
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6">
      {/* Event Info Card Banner - Warm Amber / Sunset Orange Theme */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-700 via-orange-800 to-amber-950 text-white p-6 mb-6 shadow-lg border-t-4 border-amber-400">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/30 text-amber-100 border border-amber-400/30 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
            <span>【學員簽退端 · 離席登記與時數結算專區】</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 text-white">
            {eventInfo.title}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-amber-100/90 pt-3 border-t border-amber-500/30">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-300 shrink-0" />
              <span>日期：{eventInfo.date || '今日'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-300 shrink-0" />
              <span>當前時間：{currentTime.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="truncate">地點：{eventInfo.location || '研習教室'}</span>
            </div>
          </div>

          <div className="mt-3 bg-amber-950/70 rounded-lg p-2.5 text-xs text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-amber-400/30">
            <div className="flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                系統主動計算【參加時間 ＝ 簽退時間 － 簽到時間】及【核予補休時間 ＝ 參加時間 ＋ 路途時間】。
              </span>
            </div>
            <button
              type="button"
              onClick={onNavigateToCheckIn}
              className="text-amber-300 hover:text-white underline text-[11px] whitespace-nowrap cursor-pointer self-start sm:self-auto font-medium"
            >
              尚未入場？前往簽到端 →
            </button>
          </div>
        </div>

        {/* Decorative circle */}
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
      </div>

      {/* Main Check-Out Card */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-amber-200/80 overflow-hidden">
        <div className="p-6 border-b border-amber-100 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 mb-1">
              STEP 2 · 活動結束離席簽退
            </div>
            <h3 className="text-xl font-black text-amber-950 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-amber-600" />
              <span>學員簽退與核予補休結算表單</span>
            </h3>
            <p className="text-xs text-amber-900/80 mt-0.5 font-medium">
              請搜尋或點選您的姓名，確認參加時間與路途時間後手寫簽名送出
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-slate-500">已簽到人數：</span>
            <span className="font-bold text-amber-950 text-sm">{checkedInAttendees.length} 位</span>
            <span className="text-xs text-emerald-700 font-bold ml-2">
              (已簽退：{checkedInAttendees.filter(a => a.checkOutTime).length} 人)
            </span>
          </div>
        </div>

        {/* Quick Click Chips: Attendees waiting to sign out */}
        {pendingCheckOutAttendees.length > 0 && (
          <div className="px-6 py-3.5 bg-amber-50/60 border-b border-amber-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-amber-700" />
                點選您的姓名快速帶入簽退（到場待簽退名單）：
              </span>
              <span className="text-[11px] text-amber-800 font-bold">共 {pendingCheckOutAttendees.length} 位</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto pr-1">
              {pendingCheckOutAttendees.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleSelectAttendee(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedAttendee?.id === p.id
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400 hover:bg-amber-100/60'
                  }`}
                >
                  <span className="font-bold">{p.name}</span>
                  <span className="text-[11px] opacity-75">({p.title})</span>
                  {p.hrVerified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="人事已覆核" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name input with auto-suggest among checked-in participants */}
          <div className="relative">
            <label className="block text-sm font-bold text-amber-950 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span>簽退人員「姓名」</span>
                <span className="text-rose-500 font-bold">*必填</span>
              </span>
              {selectedAttendee && (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  已匹配簽到紀錄
                </span>
              )}
            </label>

            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="輸入姓名或點選上方名單快速帶入 (例如: 王大偉)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-base font-semibold text-slate-900 bg-white shadow-xs"
              />
              {name && (
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    setSelectedAttendee(null);
                  }}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  清除
                </button>
              )}
            </div>

            {/* Suggestions dropdown */}
            {searchSuggestions.length > 0 && !selectedAttendee && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-amber-200 overflow-hidden divide-y divide-amber-100">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-amber-900 bg-amber-50">
                  找到已簽到之學員，點擊即可進行簽退：
                </div>
                {searchSuggestions.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleSelectAttendee(p)}
                    className="w-full text-left px-3.5 py-2 hover:bg-amber-50 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                      <span className="ml-2 text-slate-500">{p.title}</span>
                      {p.department && <span className="ml-1 text-slate-400">· {p.department}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-mono">
                        簽到: {p.checkInTime ? new Date(p.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : '—'}
                      </span>
                      {p.checkOutTime ? (
                        <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                          已簽退
                        </span>
                      ) : (
                        <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">
                          點選簽退
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attendee Details & Participation Time Computation Display */}
          {selectedAttendee && (
            <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/80 to-orange-50/60 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-amber-200/80 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-amber-950 text-lg">{selectedAttendee.name}</span>
                  <span className="text-xs bg-white px-2 py-0.5 rounded border border-amber-300 text-amber-900 font-bold">
                    {selectedAttendee.title}
                  </span>
                  {selectedAttendee.department && (
                    <span className="text-xs text-slate-600">({selectedAttendee.department})</span>
                  )}
                </div>

                {/* Check-Out HR Verification Status (簽退覆核功能) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">簽退覆核狀態：</span>
                  {selectedAttendee.checkOutHrVerified ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>簽退已覆核確認</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>簽退未覆核 (簽退後請告知人事單位)</span>
                    </span>
                  )}
                  {onToggleHrVerify && (
                    <button
                      type="button"
                      onClick={() => onToggleHrVerify(selectedAttendee.id, 'checkout')}
                      className="text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                      title="若現場人事在旁，可點擊直接切換簽退覆核狀態"
                    >
                      {selectedAttendee.checkOutHrVerified ? '取消簽退覆核' : '人事現場簽退覆核'}
                    </button>
                  )}
                </div>
              </div>

              {/* Time Calculation Grid: 4 Pillars */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Check-In Time */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>簽到時間</span>
                  </div>
                  <div className="text-base font-extrabold text-slate-800 font-mono mt-1">
                    {selectedAttendee.checkInTime
                      ? new Date(selectedAttendee.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {selectedAttendee.checkInTime
                      ? new Date(selectedAttendee.checkInTime).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
                      : ''}
                  </div>
                </div>

                {/* 2. Check-Out Time */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <LogOut className="w-3.5 h-3.5 text-amber-600" />
                    <span>簽退時間</span>
                  </div>
                  <div className="text-base font-extrabold text-amber-700 font-mono mt-1">
                    {currentTime.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                  </div>
                  <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                    即時系統簽退時間
                  </div>
                </div>

                {/* 3. Calculated Duration (簽退時間 - 簽到時間) */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Hourglass className="w-3.5 h-3.5 text-indigo-600" />
                    <span>參加時間 (計算)</span>
                  </div>
                  <div className="text-base font-extrabold text-indigo-700 font-mono mt-1">
                    {liveDuration ? liveDuration.display : '計算中...'}
                  </div>
                  <div className="text-[10px] text-indigo-500 font-medium mt-0.5">
                    {liveDuration ? `共約 ${liveDuration.minutes} 分鐘` : '簽退 - 簽到時間差'}
                  </div>
                </div>

                {/* 4. Total Approved Comp Time (參加時間 + 路途時間 - 扣除時間) */}
                <div className="bg-gradient-to-br from-amber-600 to-orange-700 text-white p-3 rounded-xl shadow-xs">
                  <div className="text-[11px] text-amber-100 font-bold flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-200" />
                    <span>核予補休時間</span>
                  </div>
                  <div className="text-lg font-black text-white tracking-tight mt-1">
                    {liveCompCalculation ? liveCompCalculation.compDisplay : '計算中...'}
                  </div>
                  <div className="text-[10px] text-amber-100 mt-0.5 font-medium truncate">
                    參加{showTravel ? ` ＋ 路途(${unifiedTravelMinutes}分)` : ''}{showDeduction ? ` － 扣除(${unifiedDeductionMinutes}分)` : ''}
                  </div>
                </div>
              </div>

              {/* Travel and Deduction Time Rules Banner */}
              <div className="bg-white/95 p-3.5 rounded-xl border border-amber-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    {showTravel && (
                      <div className="flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-amber-700 shrink-0" />
                        <span className="font-bold text-slate-700">統一路途時間：</span>
                        <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          +{unifiedTravelMinutes} 分鐘
                        </span>
                      </div>
                    )}
                    {showDeduction && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="font-bold text-slate-700">統一扣除時間：</span>
                        <span className="font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          -{unifiedDeductionMinutes} 分鐘 ({deductionReason})
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    公式：參加時間{showTravel ? ' ＋ 路途時間' : ''}{showDeduction ? ' － 扣除時間' : ''}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  由承辦人於管理後台統一設定與管理，全體學員均統一套用，系統主動完成核算並列入正式名冊。
                </div>
              </div>

              {/* Check-Out HR Verification Alert Banner */}
              <div className="bg-amber-100/70 rounded-xl p-3 border border-amber-300/80 flex items-start gap-2 text-xs text-amber-950">
                <FileCheck2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">【簽退覆核規定事項】</span>
                  <span>
                    簽退手續完成後，請記得向現場人事單位告知【簽退覆核】，以確保參加時間與核予補休總時數（{liveCompCalculation?.compDisplay}）經人事核驗後正式生效。
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Signature Pad for Check-Out */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-amber-950 mb-1.5 flex items-center justify-between">
              <span>學員簽退手寫簽署區</span>
              <span className="text-[11px] text-amber-800">請在下方以觸控筆或手指端正簽名</span>
            </label>
            <SignaturePad ref={signaturePadRef} height={180} />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 開放時段提示 */}
          <SubmitWindowNotice status={windowStatus} kind="checkout" />

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !windowStatus.canSubmit}
              className={`w-full py-4 px-6 rounded-xl font-bold text-white text-base shadow-md transition-all flex items-center justify-center gap-2 ${
                windowStatus.canSubmit
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 hover:shadow-lg cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              <LogOut className="w-5 h-5" />
              <span>確認送出並完成活動簽退 (結算參加時間與補休)</span>
            </button>
          </div>
        </form>
      </div>

      {/* Check-Out Success Modal Confirmation Dialog */}
      {recentCheckedOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[94vh] overflow-y-auto text-center p-6 sm:p-8" data-testid="checkout-success">
            <CheckoutVerifyStatus verified={checkOutVerified} position="top" />
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-amber-50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
              簽退手續完成！
            </h3>
            {!checkOutVerified && (
              <p className="text-sm font-bold text-red-600 mt-1.5 tracking-wide">
                恭喜完成本次活動簽退！請記得向人事單位告知【簽退覆核】
              </p>
            )}

            {/* Check-out Details Card */}
            <div className="mt-5 p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">參加學員</span>
                <span className="font-bold text-slate-900 text-sm">{recentCheckedOut.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">職稱 / 單位</span>
                <span className="font-semibold text-slate-800">
                  {recentCheckedOut.title} {recentCheckedOut.department ? `(${recentCheckedOut.department})` : ''}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">簽到時間</span>
                <span className="font-mono text-slate-700 font-bold">
                  {new Date(recentCheckedOut.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">簽退時間</span>
                <span className="font-mono text-amber-800 font-bold">
                  {new Date(recentCheckedOut.checkOutTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">參加時間 (計算)</span>
                <span className="font-bold text-indigo-700 font-mono">
                  {recentCheckedOut.durationDisplay}
                </span>
              </div>
              {showTravel && (
                <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                  <span className="text-slate-500">統一路途時間</span>
                  <span className="font-bold text-amber-800 font-mono">
                    +{recentCheckedOut.travelDisplay}
                  </span>
                </div>
              )}
              {showDeduction && (
                <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                  <span className="text-slate-500">統一扣除時間</span>
                  <span className="font-bold text-rose-700 font-mono">
                    -{recentCheckedOut.deductionDisplay} ({recentCheckedOut.deductionReason})
                  </span>
                </div>
              )}

              {/* Highlighted Total Approved Comp Time */}
              <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <Award className="w-4 h-4 text-amber-200" />
                  <span>核予補休時間：</span>
                </div>
                <div className="text-lg font-black font-mono">
                  {recentCheckedOut.compTimeDisplay}
                </div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-amber-200/80">
                <span className="text-slate-500">簽退覆核狀態</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  checkOutVerified ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`} data-testid="checkout-verify-badge">
                  {checkOutVerified ? '✓ 簽退已覆核' : '⏳ 簽退未覆核 (請向人事單位出示告知)'}
                </span>
              </div>

              {/* 名冊欄位 (承辦人勾選，例如桌次、葷素、車次) */}
              {completionFieldRows(eventInfo, recentCheckedOut).map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-amber-200/80" data-testid="checkout-field">
                  <span className="text-slate-500 font-medium">{label}</span>
                  <span className="font-semibold text-slate-800 text-right">{value}</span>
                </div>
              ))}

              {/* Signature snapshot thumbnail */}
              {recentCheckedOut.signatureDataUrl && (
                <div className="pt-2">
                  <div className="text-[11px] text-slate-500 mb-1">數位手寫簽退存根：</div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200 flex justify-center">
                    <img
                      src={recentCheckedOut.signatureDataUrl}
                      alt="手寫簽退簽名"
                      className="h-12 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 等待簽退覆核 / 簽退覆核成功 (即時更新) */}
            <CheckoutVerifyStatus verified={checkOutVerified} position="bottom" />

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleResetForNext}
                data-testid="checkout-done"
                className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>簽退完成</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetForNext();
                  onNavigateToDashboard();
                }}
                className="py-3 px-4 rounded-xl font-semibold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
              >
                查看統計清冊
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Check-Out Alert Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-rose-300 max-w-md w-full overflow-hidden text-center p-6 sm:p-8">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-rose-50 animate-bounce">
              <AlertCircle className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold mb-2">
              <span>【重複簽退警示 · 拒絕送出】</span>
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              學員「{showDuplicateModal.name}」已完成簽退！
            </h3>

            <div className="mt-4 p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-left text-xs text-rose-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">
                  系統偵測到簽退名冊中已有「{showDuplicateModal.name}」於 <span className="font-bold underline">{showDuplicateModal.time}</span> 完成簽退手續。
                </p>
              </div>
              <p className="text-slate-600 text-[11px] pl-6">
                依活動管理規定，每位學員僅能簽退一次以利時數核算，系統已拒絕重複送出。如有任何時數更正需求，請洽現場人事人員協助。
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
