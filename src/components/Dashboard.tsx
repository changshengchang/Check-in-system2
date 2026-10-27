import React, { useState, useEffect } from 'react';
import {
  CombinedAttendeeView,
  EventInfo,
  RegisteredParticipant,
  CheckInRecord,
  SubmitWindow
} from '../types';
import { exportToExcel, exportToCsv } from '../utils/excel';
import { FileUploader } from './FileUploader';
import { PrintableView } from './PrintableView';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  Filter,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  MinusCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Plus,
  LogOut,
  Lock,
  Hourglass,
  Award,
  Car,
  Edit3,
  Save,
  X,
  CheckSquare,
  Square,
  Star,
  ShieldCheck,
  KeyRound
} from 'lucide-react';

import { SubmitWindowPanel } from './SubmitWindowPanel';
import { matchesAttendeeSearch, rosterSerialOf } from '../utils/serial';
interface DashboardProps {
  eventInfo: EventInfo;
  roster: RegisteredParticipant[];
  checkIns: CheckInRecord[];
  attendees: CombinedAttendeeView[];
  onImportRoster: (
    participants: RegisteredParticipant[],
    mode: 'replace' | 'append',
    selectedColumns?: string[],
    allColumns?: string[]
  ) => void;
  onAddRosterParticipant: (participant: RegisteredParticipant) => void;
  onDeleteRosterParticipant: (id: string) => void;
  onManualCheckIn: (attendee: CombinedAttendeeView) => void;
  onManualCheckOut: (attendeeId: string) => void;
  onUpdateEventInfo: (info: EventInfo) => void;
  onUpdateSubmitWindow?: (kind: 'checkin' | 'checkout', window: SubmitWindow) => void;
  onUpdateTravelTime?: (attendeeId: string, minutes: number) => void;
  onRemoveCheckIn: (attendeeId: string, checkInId?: string, attendeeName?: string) => void;
  onResetAllCheckIns: () => void;
  onToggleHrVerify: (attendeeId: string, type: 'checkin' | 'checkout') => void;
  onToggleVip?: (attendeeId: string) => void;
  /** organizer = 承辦人 (完整權限)；helper = 協助人員 (只能查詢與簽到/簽退覆核) */
  staffRole?: 'organizer' | 'helper';
  onUpdateVerifyTimeout?: (minutes: number) => void;
  onNavigateToCheckIn: () => void;
  onNavigateToCheckOut: () => void;
  onLogout?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  eventInfo,
  roster,
  checkIns,
  attendees,
  onImportRoster,
  onAddRosterParticipant,
  onDeleteRosterParticipant,
  onManualCheckIn,
  onManualCheckOut,
  onUpdateEventInfo,
  onUpdateSubmitWindow,
  onUpdateTravelTime,
  onRemoveCheckIn,
  onResetAllCheckIns,
  onToggleHrVerify,
  onToggleVip,
  staffRole = 'organizer',
  onUpdateVerifyTimeout,
  onNavigateToCheckIn,
  onNavigateToCheckOut,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'checked_in' | 'not_checked_in' | 'walk_in' | 'checked_out' | 'checkin_verified' | 'checkout_verified' | 'vip' | 'roster_upload'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [selectedSignature, setSelectedSignature] = useState<{ name: string; url: string; time?: string; title?: string } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [copiedMissing, setCopiedMissing] = useState(false);
  const [showAddAttendeeModal, setShowAddAttendeeModal] = useState(false);
  const [newAttendee, setNewAttendee] = useState({ name: '', title: '', department: '', phone: '' });

  // In-app Confirmation Modals (Replaces native confirm to guarantee 100% execution in iframes)
  const [confirmResetModalOpen, setConfirmResetModalOpen] = useState(false);
  const [attendeeToCancel, setAttendeeToCancel] = useState<{
    id: string;
    checkInId?: string;
    name: string;
    hasCheckOut?: boolean;
  } | null>(null);

  // Organizer Edit Event Info & Unified Travel Time modal state
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [eventFormData, setEventFormData] = useState<EventInfo>(eventInfo);

  // Keep form data synced if eventInfo changes from cloud
  React.useEffect(() => {
    setEventFormData(eventInfo);
  }, [eventInfo]);

  // 現場協助人員密碼管理狀態
  const [isEditingHelperPw, setIsEditingHelperPw] = useState(false);
  const [helperPwDraft, setHelperPwDraft] = useState(eventInfo.helperPassword || 'user1234');
  const [showHelperPw, setShowHelperPw] = useState(true);
  const [copiedHelperPw, setCopiedHelperPw] = useState(false);
  const [helperPwSuccessMsg, setHelperPwSuccessMsg] = useState(false);

  useEffect(() => {
    setHelperPwDraft(eventInfo.helperPassword || 'user1234');
  }, [eventInfo.helperPassword]);

  const handleSaveHelperPassword = () => {
    const cleanPw = helperPwDraft.trim() || 'user1234';
    onUpdateEventInfo({
      ...eventInfo,
      helperPassword: cleanPw
    });
    setHelperPwDraft(cleanPw);
    setIsEditingHelperPw(false);
    setHelperPwSuccessMsg(true);
    setTimeout(() => setHelperPwSuccessMsg(false), 3500);
  };

  const handleCopyHelperPassword = async () => {
    try {
      await navigator.clipboard.writeText(eventInfo.helperPassword || 'user1234');
      setCopiedHelperPw(true);
      setTimeout(() => setCopiedHelperPw(false), 2500);
    } catch {
      // ignore
    }
  };

  // Calculate statistics
  const totalRosterCount = roster.length;
  const checkedInList = attendees.filter(a => a.status === 'CHECKED_IN');
  const notCheckedInList = attendees.filter(a => a.status === 'NOT_CHECKED_IN');
  const walkInList = attendees.filter(a => a.status === 'WALK_IN');
  const totalCheckedIn = checkedInList.length + walkInList.length;
  const checkedOutList = attendees.filter(a => a.checkOutTime);
  const vipList = attendees.filter(a => a.isVip);
  const canManage = staffRole === 'organizer';
  const checkInVerifiedList = attendees.filter(a => a.checkInHrVerified || a.hrVerified);
  const checkOutVerifiedList = attendees.filter(a => a.checkOutHrVerified);

  const attendanceRate = totalRosterCount > 0 ? Math.round((checkedInList.length / totalRosterCount) * 100) : 0;

  // Extract unique departments for filter
  const departments = Array.from(
    new Set(attendees.map(a => a.department).filter((d): d is string => Boolean(d && d.trim())))
  );

  // Organizer display preferences
  const showTravel = eventInfo.showTravelTime !== false;
  const showDeduction = !!eventInfo.showDeductionTime;
  const colSpanCount = 13 + (showTravel ? 1 : 0) + (showDeduction ? 1 : 0);

  // Available roster columns for Attachment 1 (學員完成畫面呈現欄位)
  const allKnownColumns = Array.from(
    new Set([
      '職稱',
      '部門',
      '電話',
      '電子信箱',
      ...(eventInfo.availableRosterColumns || []),
      ...roster.flatMap(p => Object.keys(p.customFields || {}))
    ])
  );

  // Filter attendees list based on tab, search, and department
  const filteredAttendees = attendees.filter(attendee => {
    // Tab filter
    if (activeTab === 'checked_in' && attendee.status !== 'CHECKED_IN' && attendee.status !== 'WALK_IN') return false;
    if (activeTab === 'not_checked_in' && attendee.status !== 'NOT_CHECKED_IN') return false;
    if (activeTab === 'walk_in' && attendee.status !== 'WALK_IN') return false;
    if (activeTab === 'checked_out' && !attendee.checkOutTime) return false;
    if (activeTab === 'checkin_verified' && !(attendee.checkInHrVerified || attendee.hrVerified)) return false;
    if (activeTab === 'checkout_verified' && !attendee.checkOutHrVerified) return false;
    if (activeTab === 'vip' && !attendee.isVip) return false;

    // Search query
    // 姓名、職稱、部門、序號 (完全符合)、電話 (3 碼以上)
    if (searchQuery.trim() && !matchesAttendeeSearch(attendee, searchQuery)) return false;

    // Department filter
    if (departmentFilter !== 'all' && attendee.department !== departmentFilter) {
      return false;
    }

    return true;
  });

  // Copy missing attendees list to clipboard for quick reminders
  const handleCopyMissing = () => {
    if (notCheckedInList.length === 0) return;
    const text = `【${eventInfo.title} - 未完成報到人員名單】\n` +
      notCheckedInList.map((a, i) => `${i + 1}. ${a.name} (${a.title}${a.department ? ` - ${a.department}` : ''})`).join('\n') +
      `\n共計 ${notCheckedInList.length} 位人員尚未報到，請儘速完成手續。`;
    navigator.clipboard.writeText(text);
    setCopiedMissing(true);
    setTimeout(() => setCopiedMissing(false), 2500);
  };

  const handleAddNewAttendeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttendee.name.trim()) return;
    onAddRosterParticipant({
      id: `manual-${Date.now()}`,
      name: newAttendee.name.trim(),
      title: newAttendee.title.trim() || '未填寫職稱',
      department: newAttendee.department.trim() || undefined,
      phone: newAttendee.phone.trim() || undefined,
      registeredAt: new Date().toISOString()
    });
    setNewAttendee({ name: '', title: '', department: '', phone: '' });
    setShowAddAttendeeModal(false);
  };

  return (
    <>
      <div className={`max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6 ${showPrintModal ? 'print:hidden' : ''}`}>
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              活動承辦人管理後台
            </span>
            <span className="text-xs text-slate-400">即時資料自動比對</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            報名名冊與報到比對概況
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            活動：{eventInfo.title} · 最後更新於 {new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
          </p>
        </div>

        {/* Global Download & Export Action Group */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
          <button
            type="button"
            onClick={() => {
              setEventFormData(eventInfo);
              setIsEditingEvent(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
            title="承辦人專屬：編輯活動名稱、日期、地點、路途時間與扣除時間設定"
          >
            <Edit3 className="w-4 h-4 text-indigo-600" />
            <span>編輯活動資訊、路途與扣除時間</span>
          </button>

          <button
            type="button"
            onClick={() => exportToExcel(attendees, eventInfo)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
            title="匯出包含姓名、職稱、報到時間與簽署狀態之 Excel 檔"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>下載 Excel 報表</span>
          </button>

          <button
            type="button"
            onClick={() => exportToCsv(attendees, eventInfo)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
            title="下載標準 UTF-8 CSV 檔"
          >
            <FileText className="w-4 h-4" />
            <span>下載 CSV 檔</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
            title="開啟含手寫電子簽章圖樣的正式列印/存為 PDF 簽到清冊"
          >
            <Printer className="w-4 h-4" />
            <span>列印簽章名冊 / PDF</span>
          </button>

            </>
          )}

          <button
            type="button"
            onClick={onNavigateToCheckIn}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>前往學員簽到端</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToCheckOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>前往學員簽退端</span>
          </button>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
              title="離開並鎖定承辦人後台，需重新輸入密碼方可存取"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>鎖定後台</span>
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2" data-testid="helper-banner">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
          <div>
            <div className="font-bold text-sm">協助人員模式</div>
            可查詢名單與進行「簽到覆核」「簽退覆核」；代為報到、取消報到、名冊與設定修改、匯出列印需由承辦人操作。
          </div>
        </div>
      )}

      {/* KPI Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Expected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">名冊應到人數</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{totalRosterCount}</span>
            <span className="text-xs text-slate-500">位已預先報名</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            名冊資料來源：Excel / CSV 上傳
          </div>
        </div>

        {/* Card 2: Checked In */}
        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">
              已完成報到 (實到)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">{totalCheckedIn}</span>
            <span className="text-xs font-bold text-blue-700">({attendanceRate}%)</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(attendanceRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Not Checked In */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
              未完成報到 (缺席)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-600">
              {notCheckedInList.length}
            </span>
            <span className="text-xs text-slate-500">位待簽到</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">尚餘 {100 - attendanceRate}% 未報到</span>
            {notCheckedInList.length > 0 && (
              <button
                type="button"
                onClick={handleCopyMissing}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                {copiedMissing ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedMissing ? '已複製名單' : '一鍵複製催報名單'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Walk-ins */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              現場追加報到
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-600">{walkInList.length}</span>
            <span className="text-xs text-slate-500">位臨時追加</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            不在預先名冊中之現場新增簽署
          </div>
        </div>
      </div>

      {/* 簽到／簽退開放時段設定 */}
      {canManage && onUpdateSubmitWindow && (
        <SubmitWindowPanel eventInfo={eventInfo} onUpdateSubmitWindow={onUpdateSubmitWindow} onUpdateVerifyTimeout={onUpdateVerifyTimeout} />
      )}

      {/* 現場協助人員密碼設定 (僅主辦承辦人可見與維護) */}
      {canManage && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5" data-testid="helper-password-card">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 mt-0.5 border border-teal-200">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    現場協助人員授權登入密碼
                  </h3>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                    權限：名單查詢 ＋ 簽到／簽退覆核
                  </span>
                  {helperPwSuccessMsg && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 animate-in fade-in">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      密碼已儲存並即時同步至雲端
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                  此密碼供現場協助同仁或人事助理登入後台使用。協助人員僅能查閱名單、協助報到與執行簽到退覆核，無法更改活動設定或刪除紀錄。主辦人員可隨時在此查閱與變更，避免日後遺忘。
                </p>
              </div>
            </div>

            {/* Password Display and Edit Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shrink-0">
              {isEditingHelperPw ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input
                      type={showHelperPw ? 'text' : 'password'}
                      autoFocus
                      value={helperPwDraft}
                      onChange={e => setHelperPwDraft(e.target.value)}
                      placeholder="請輸入新密碼..."
                      className="w-36 sm:w-44 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHelperPw(!showHelperPw)}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title={showHelperPw ? '隱藏密碼' : '顯示密碼'}
                    >
                      {showHelperPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveHelperPassword}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-xs cursor-pointer transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>儲存</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHelperPwDraft(eventInfo.helperPassword || 'user1234');
                      setIsEditingHelperPw(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs font-mono text-xs">
                    <span className="text-slate-400 text-[11px]">密碼：</span>
                    <span className="font-bold text-slate-900 tracking-wider">
                      {showHelperPw ? (eventInfo.helperPassword || 'user1234') : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHelperPw(!showHelperPw)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 ml-1 cursor-pointer"
                      title={showHelperPw ? '隱藏' : '顯示'}
                    >
                      {showHelperPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyHelperPassword}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs cursor-pointer transition-colors"
                    title="複製密碼"
                  >
                    {copiedHelperPw ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">已複製</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>複製</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHelperPwDraft(eventInfo.helperPassword || 'user1234');
                      setIsEditingHelperPw(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-700 bg-teal-100/70 hover:bg-teal-200/80 border border-teal-200 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                    <span>變更密碼</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Tabbed Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2 overflow-x-auto pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>全部人員資料</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {attendees.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('checked_in')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checked_in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>已完成報到</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'checked_in' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700 font-bold'}`}>
                {totalCheckedIn}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('not_checked_in')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'not_checked_in'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>未完成報到</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'not_checked_in' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-700 font-bold'}`}>
                {notCheckedInList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('walk_in')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'walk_in'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>現場臨時追加</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'walk_in' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-700 font-bold'}`}>
                {walkInList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('checked_out')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checked_out'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Hourglass className="w-3.5 h-3.5 text-amber-600" />
              <span>已完成簽退</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'checked_out' ? 'bg-orange-700 text-white' : 'bg-orange-50 text-orange-700 font-bold'}`}>
                {checkedOutList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vip')}
              data-testid="tab-vip"
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'vip'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${activeTab === 'vip' ? 'text-white fill-current' : 'text-orange-500'}`} />
              <span>重要貴賓</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'vip' ? 'bg-orange-700 text-white' : 'bg-orange-50 text-orange-700 font-bold'}`}>
                {vipList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('checkin_verified')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checkin_verified'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
              <span>簽到已覆核</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'checkin_verified' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700 font-bold'}`}>
                {checkInVerifiedList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('checkout_verified')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checkout_verified'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>簽退已覆核</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'checkout_verified' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-700 font-bold'}`}>
                {checkOutVerifiedList.length}
              </span>
            </button>

            {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab('roster_upload')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'roster_upload'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>上傳與管理名冊 (Excel/CSV)</span>
            </button>
            )}
          </div>

          {canManage && (
          <div className="pb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddAttendeeModal(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>手動新增單筆學員</span>
            </button>
          </div>
          )}
        </div>

        {/* Tab 1: Roster Upload Tab */}
        {activeTab === 'roster_upload' && canManage ? (
          <div className="p-6 space-y-6">
            <FileUploader onImport={onImportRoster} currentCount={roster.length} />

            {/* Attachment 1 (學員報到手續完成畫面) Display Fields Manager */}
            <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/70 rounded-2xl p-5 border border-indigo-200">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>學員報到端完成手續畫面（附件1）呈現欄位勾選</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                      已選 {(eventInfo.completionDisplayFields || []).length} 欄位
                    </span>
                  </h4>
                  <p className="text-xs text-indigo-800/80 mt-1">
                    在此勾選之名冊欄位資料，將於學員在【學員報到端】簽署完成時之跳出畫面（如附件1「報到手續完成！」）中動態呈現，以利學員知悉活動訊息與各項備註。
                  </p>
                </div>
              </div>

              <div className="bg-white/90 backdrop-blur-xs rounded-xl p-3.5 border border-indigo-100">
                <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between">
                  <span>點選下方方塊勾選 / 取消欲呈現於附件1之欄位：</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateEventInfo({ ...eventInfo, completionDisplayFields: allKnownColumns })}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      全選
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => onUpdateEventInfo({ ...eventInfo, completionDisplayFields: ['職稱', '部門', '電話'] })}
                      className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                    >
                      重設為預設
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {allKnownColumns.map(col => {
                    const isChecked = (eventInfo.completionDisplayFields || ['職稱', '部門', '電話']).includes(col);
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          const cur = eventInfo.completionDisplayFields || ['職稱', '部門', '電話'];
                          const next = isChecked ? cur.filter(c => c !== col) : [...cur, col];
                          onUpdateEventInfo({ ...eventInfo, completionDisplayFields: next });
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                        }`}
                      >
                        {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        <span>{col}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Current Roster Quick Management */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    目前預先報名名冊清單 ({roster.length} 人)
                  </h4>
                  <p className="text-xs text-slate-500">
                    可個別刪除錯誤名單，或透過上方 Excel/CSV 上傳替換
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                {roster.map((p, idx) => (
                  <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-400 text-[11px] w-6">#{rosterSerialOf(p) ?? '—'}</span>
                      <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                      <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {p.title}
                      </span>
                      {p.department && (
                        <span className="text-slate-400 text-[11px]">
                          {p.department}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteRosterParticipant(p.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="從預先報名名冊移除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Attendance Comparison & Records Table */
          <div className="p-4 sm:p-6 space-y-4">
            {/* Search and Filter Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜尋序號、姓名、電話、職稱或部門..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-xs bg-slate-50 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Department Dropdown Filter */}
              {departments.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-500">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>部門篩選：</span>
                  <select
                    value={departmentFilter}
                    onChange={e => setDepartmentFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">全部部門 ({attendees.length})</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Table of Attendees */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">序號</th>
                      <th className="py-3 px-2 w-12 text-center">貴賓</th>
                      <th className="py-3 px-3">參加人員姓名</th>
                      <th className="py-3 px-3">職稱 (Job Title)</th>
                      <th className="py-3 px-3">部門/單位</th>
                      <th className="py-3 px-3 text-center">報到狀態</th>
                      <th className="py-3 px-3 text-center">報到時間</th>
                      <th className="py-3 px-3 text-center">簽退時間</th>
                      <th className="py-3 px-3 text-center">參加時間(計算)</th>
                      {showTravel && (
                        <th className="py-3 px-3 text-center">路途時間</th>
                      )}
                      {showDeduction && (
                        <th className="py-3 px-3 text-center text-rose-700">扣除時間</th>
                      )}
                      <th className="py-3 px-3 text-center bg-indigo-50/50">
                        <div>核予補休時間</div>
                        <div className="text-[9px] font-normal text-indigo-600">
                          {showTravel && showDeduction
                            ? '(參加＋路途－扣除)'
                            : showTravel
                            ? '(參加＋統一路途)'
                            : showDeduction
                            ? '(參加－扣除時間)'
                            : '(同參加時間)'}
                        </div>
                      </th>
                      <th className="py-3 px-3 text-center">手寫簽名</th>
                      <th className="py-3 px-3 text-center">簽到覆核</th>
                      <th className="py-3 px-3 text-center">簽退覆核</th>
                      <th className="py-3 px-3 text-center">承辦人操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttendees.length === 0 ? (
                      <tr>
                        <td colSpan={colSpanCount} className="py-12 text-center text-slate-400">
                          <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="text-sm">查無符合條件之人員資料</p>
                          <p className="text-xs text-slate-400 mt-0.5">請確認搜尋關鍵字或篩選設定</p>
                        </td>
                      </tr>
                    ) : (
                      filteredAttendees.map((attendee, idx) => {
                        const isChecked = attendee.status === 'CHECKED_IN' || attendee.status === 'WALK_IN';
                        return (
                          <tr key={attendee.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* # */}
                            <td className="py-3 px-3 text-center font-mono text-xs font-bold text-slate-600" data-testid="serial-cell">
                              {attendee.serialNo !== undefined ? (
                                attendee.serialNo
                              ) : (
                                <span className="text-[10px] font-normal text-slate-400" title="序號配發中，連線後自動補上">配發中</span>
                              )}
                            </td>

                            {/* 重要貴賓標記 (點擊勾選 / 取消) */}
                            <td className="py-3 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => canManage && onToggleVip?.(attendee.id)}
                                disabled={!onToggleVip || !canManage}
                                role="checkbox"
                                aria-checked={Boolean(attendee.isVip)}
                                aria-label={`${attendee.name} 貴賓標記`}
                                data-testid="vip-toggle"
                                title={attendee.isVip ? '已標記為重要貴賓，點擊取消' : '點擊標記為重要貴賓'}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${canManage ? 'cursor-pointer' : 'cursor-default'} ${
                                  attendee.isVip
                                    ? 'bg-orange-50 border-orange-300 text-orange-500 hover:bg-orange-100'
                                    : 'bg-white border-slate-200 text-slate-300 hover:text-orange-400 hover:border-orange-200'
                                }`}
                              >
                                <Star className={`w-4 h-4 ${attendee.isVip ? 'fill-current' : ''}`} />
                              </button>
                            </td>

                            {/* Name */}
                            <td className="py-3 px-3 font-bold text-slate-900 text-sm">
                              <div className="flex items-center gap-1.5">
                                <span>{attendee.name}</span>
                                {attendee.isWalkIn && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">
                                    現場追加
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Title */}
                            <td className="py-3 px-3 text-slate-700">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                {attendee.title}
                              </span>
                            </td>

                            {/* Department */}
                            <td className="py-3 px-3 text-slate-500">
                              {attendee.department || '—'}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 text-center">
                              {attendee.status === 'CHECKED_IN' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>已完成報到</span>
                                </span>
                              ) : attendee.status === 'WALK_IN' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Sparkles className="w-3 h-3" />
                                  <span>現場追加報到</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <Clock className="w-3 h-3" />
                                  <span>未完成報到</span>
                                </span>
                              )}
                            </td>

                            {/* Sign-in Time */}
                            <td className="py-3 px-3 text-center font-mono text-slate-600 text-[11px]">
                              {attendee.checkInTime ? (
                                <div>
                                  <div>{new Date(attendee.checkInTime).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
                                  <div className="font-bold text-slate-800">
                                    {new Date(attendee.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Sign-out Time */}
                            <td className="py-3 px-3 text-center font-mono text-slate-600 text-[11px]">
                              {attendee.checkOutTime ? (
                                <div>
                                  <div>{new Date(attendee.checkOutTime).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
                                  <div className="font-bold text-amber-700">
                                    {new Date(attendee.checkOutTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
                                  </div>
                                </div>
                              ) : isChecked ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  待簽退
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Participation Duration */}
                            <td className="py-3 px-3 text-center">
                              {attendee.durationDisplay ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                                  <Hourglass className="w-3 h-3 text-indigo-500" />
                                  <span>{attendee.durationDisplay}</span>
                                </span>
                              ) : isChecked ? (
                                <span className="text-slate-400 italic text-[11px]">進行中</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Travel Time (統一路途時間) */}
                            {showTravel && (
                              <td className="py-3 px-3 text-center">
                                {isChecked ? (
                                  <span className="font-mono text-[11px] text-slate-700 font-medium">
                                    {attendee.travelDisplay || `${eventInfo.defaultTravelMinutes ?? 60}分鐘`}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            )}

                            {/* Deduction Time (統一扣除時間) */}
                            {showDeduction && (
                              <td className="py-3 px-3 text-center">
                                {isChecked ? (
                                  <div className="flex flex-col items-center">
                                    <span className="font-mono text-[11px] text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                      -{attendee.deductionDisplay || `${eventInfo.defaultDeductionMinutes ?? 60}分鐘`}
                                    </span>
                                    {eventInfo.deductionReason && (
                                      <span
                                        className="text-[10px] text-slate-400 max-w-[90px] truncate mt-0.5"
                                        title={eventInfo.deductionReason}
                                      >
                                        {eventInfo.deductionReason}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            )}

                            {/* Approved Comp Time (核予補休時間 ＝ 參加時間 ＋ 路途時間 － 扣除時間) */}
                            <td className="py-3 px-3 text-center">
                              {attendee.compTimeDisplay ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs">
                                  <Award className="w-3.5 h-3.5 text-indigo-700" />
                                  <span>{attendee.compTimeDisplay}</span>
                                </span>
                              ) : attendee.durationDisplay ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                                  {attendee.durationDisplay}
                                </span>
                              ) : isChecked ? (
                                <span className="text-slate-400 italic text-[11px]">研習中</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Signatures (Sign-in & Sign-out) */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {attendee.signatureDataUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedSignature({
                                        name: `${attendee.name} (簽到)`,
                                        url: attendee.signatureDataUrl!,
                                        time: attendee.checkInTime,
                                        title: attendee.title
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer group"
                                    title="點擊放大檢視簽到簽名"
                                  >
                                    <span className="text-[10px] text-blue-600 font-semibold">簽到</span>
                                    <Eye className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                                  </button>
                                )}
                                {attendee.checkOutSignatureDataUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedSignature({
                                        name: `${attendee.name} (簽退)`,
                                        url: attendee.checkOutSignatureDataUrl!,
                                        time: attendee.checkOutTime,
                                        title: attendee.title
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50/50 hover:bg-amber-100 hover:border-amber-300 transition-colors cursor-pointer group"
                                    title="點擊放大檢視簽退簽名"
                                  >
                                    <span className="text-[10px] text-amber-700 font-semibold">簽退</span>
                                    <Eye className="w-3 h-3 text-amber-500 group-hover:text-amber-700" />
                                  </button>
                                )}
                                {!attendee.signatureDataUrl && !attendee.checkOutSignatureDataUrl && (
                                  <span className="text-slate-300 italic text-[11px]">無簽章</span>
                                )}
                              </div>
                            </td>

                            {/* Check-In HR Verification (簽到覆核) */}
                            <td className="py-3 px-3 text-center">
                              {isChecked && !(attendee.checkInHrVerified || attendee.hrVerified) && attendee.verifyDeadlineMs !== undefined && (
                                <div className="text-[10px] text-rose-600 font-semibold mb-1" data-testid="verify-deadline">
                                  需於 {new Date(attendee.verifyDeadlineMs).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })} 前覆核
                                </div>
                              )}
                              {isChecked ? (
                                attendee.checkInHrVerified || attendee.hrVerified ? (
                                  <button
                                    type="button"
                                    onClick={() => onToggleHrVerify(attendee.id, 'checkin')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
                                    title="簽到已覆核。點擊切換/取消覆核"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>已覆核</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onToggleHrVerify(attendee.id, 'checkin')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                                    title="人事人員點擊完成簽到覆核"
                                  >
                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                    <span>未覆核</span>
                                  </button>
                                )
                              ) : !canManage ? (
                                <span className="text-[11px] text-slate-400">未報到</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onToggleHrVerify(attendee.id, 'checkin')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-slate-400 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition-colors cursor-pointer"
                                  title="學員尚未報到。點擊可直接代辦報到並完成簽到覆核"
                                >
                                  <span>未報到</span>
                                </button>
                              )}
                            </td>

                            {/* Check-Out HR Verification (簽退覆核) */}
                            <td className="py-3 px-3 text-center">
                              {!isChecked ? (
                                <span className="text-slate-300">—</span>
                              ) : !attendee.checkOutTime ? (
                                <span className="text-slate-400 text-[11px] italic bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  待簽退
                                </span>
                              ) : attendee.checkOutHrVerified ? (
                                <button
                                  type="button"
                                  onClick={() => onToggleHrVerify(attendee.id, 'checkout')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
                                  title="簽退已覆核。點擊切換/取消覆核"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>已覆核</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onToggleHrVerify(attendee.id, 'checkout')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                                  title="人事人員點擊完成簽退覆核"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>未覆核</span>
                                </button>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-3 text-center">
                              {!canManage ? (
                                <span className="text-slate-300 text-[11px]">—</span>
                              ) : isChecked ? (
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {!attendee.checkOutTime ? (
                                    <button
                                      type="button"
                                      onClick={() => onManualCheckOut(attendee.id)}
                                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg border border-amber-200 transition-colors cursor-pointer"
                                      title="學員離席，協助完成簽退並計算參加時間"
                                    >
                                      協助簽退
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                      已簽退
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const found = checkIns.find(
                                        c => c.id === attendee.checkInId ||
                                             c.id === attendee.id ||
                                             c.participantId === attendee.id ||
                                             (attendee.name && c.name.trim().toLowerCase() === attendee.name.trim().toLowerCase())
                                      );
                                      setAttendeeToCancel({
                                        id: attendee.id,
                                        checkInId: found?.id || attendee.checkInId,
                                        name: attendee.name,
                                        hasCheckOut: Boolean(attendee.checkOutTime)
                                      });
                                    }}
                                    className="text-[11px] text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="取消報到狀態（包含簽到與簽退資料）"
                                  >
                                    取消報到
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onManualCheckIn(attendee)}
                                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                                  title="承辦人確認到場，協助代為簽到"
                                >
                                  手動協助報到
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom summary bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 pt-2 gap-2">
              <div>
                顯示 {filteredAttendees.length} 筆（名冊應到 {totalRosterCount} 人 · 實到 {totalCheckedIn} 人 · 缺席 {notCheckedInList.length} 人）
              </div>
              <div className="flex items-center gap-3">
                {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmResetModalOpen(true)}
                  className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                  title="清除全體學員之簽到與簽退紀錄"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空所有簽到紀錄</span>
                </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Large Viewer Modal */}
      {selectedSignature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6">
            <div className="flex items-start justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedSignature.name} 的手寫簽署存根
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSignature.title} · 報到時間：
                  {selectedSignature.time ? new Date(selectedSignature.time).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSignature(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex justify-center items-center shadow-inner">
              <img
                src={selectedSignature.url}
                alt="簽名放大檢視"
                className="max-h-48 max-w-full object-contain"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSignature(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Attendee Modal */}
      {showAddAttendeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              手動新增預先報名學員
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              將此人員加入活動預先報名名冊中
            </p>

            <form onSubmit={handleAddNewAttendeeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  姓名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newAttendee.name}
                  onChange={e => setNewAttendee({ ...newAttendee, name: e.target.value })}
                  placeholder="例：郭曉芬"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  職稱 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newAttendee.title}
                  onChange={e => setNewAttendee({ ...newAttendee, title: e.target.value })}
                  placeholder="例：資深產品設計師"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  部門 / 單位 (選填)
                </label>
                <input
                  type="text"
                  value={newAttendee.department}
                  onChange={e => setNewAttendee({ ...newAttendee, department: e.target.value })}
                  placeholder="例：體驗設計處"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  聯絡電話 (選填)
                </label>
                <input
                  type="text"
                  value={newAttendee.phone}
                  onChange={e => setNewAttendee({ ...newAttendee, phone: e.target.value })}
                  placeholder="例：0912-345-678"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddAttendeeModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
                >
                  新增至名冊
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Organizer Edit Event Info & Unified Travel Time Modal */}
      {isEditingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    承辦人設定：編輯活動資訊、路途與扣除時間設定
                  </h3>
                  <p className="text-xs text-slate-500">
                    僅後台承辦人具權限修改，設定後將即時同步至簽到端與簽退端
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingEvent(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                onUpdateEventInfo({
                  ...eventFormData,
                  helperPassword: (eventFormData.helperPassword || 'user1234').trim(),
                  showTravelTime: eventFormData.showTravelTime ?? true,
                  defaultTravelMinutes: Number(eventFormData.defaultTravelMinutes) >= 0 ? Number(eventFormData.defaultTravelMinutes) : 60,
                  showDeductionTime: eventFormData.showDeductionTime ?? false,
                  defaultDeductionMinutes: Number(eventFormData.defaultDeductionMinutes) >= 0 ? Number(eventFormData.defaultDeductionMinutes) : 60,
                  deductionReason: eventFormData.deductionReason || '午休用餐休息時間不計入補休'
                });
                setIsEditingEvent(false);
              }}
              className="space-y-4"
            >
              {/* Event Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  活動名稱 / 研習主題 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={eventFormData.title}
                  onChange={e => setEventFormData({ ...eventFormData, title: e.target.value })}
                  placeholder="例：苗栗縣三義鄉公所培訓或活動簽到系統"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">活動日期</label>
                  <input
                    type="text"
                    value={eventFormData.date}
                    onChange={e => setEventFormData({ ...eventFormData, date: e.target.value })}
                    placeholder="例：2026年3月18日 (三)"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">活動時間</label>
                  <input
                    type="text"
                    value={eventFormData.time}
                    onChange={e => setEventFormData({ ...eventFormData, time: e.target.value })}
                    placeholder="例：09:00 - 16:30"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Location and Organizer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">活動地點</label>
                  <input
                    type="text"
                    value={eventFormData.location}
                    onChange={e => setEventFormData({ ...eventFormData, location: e.target.value })}
                    placeholder="例：公所三樓大禮堂"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">主辦 / 承辦單位</label>
                  <input
                    type="text"
                    value={eventFormData.organizer}
                    onChange={e => setEventFormData({ ...eventFormData, organizer: e.target.value })}
                    placeholder="例：苗栗縣三義鄉公所"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">活動備註 / 注意事項</label>
                <input
                  type="text"
                  value={eventFormData.notes}
                  onChange={e => setEventFormData({ ...eventFormData, notes: e.target.value })}
                  placeholder="例：響應環保，請學員自備環保水杯與文具"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Unified Travel Time Setting (統一路途時間) */}
              <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/60 p-4 rounded-2xl border border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-xs text-indigo-950">
                    <input
                      type="checkbox"
                      checked={eventFormData.showTravelTime ?? true}
                      onChange={e => setEventFormData({ ...eventFormData, showTravelTime: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>啟用並顯示「路途時間」欄位 (承辦人統一定義)</span>
                  </label>
                  <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.2 rounded font-semibold">
                    {eventFormData.showTravelTime !== false ? '已啟用' : '已停用'}
                  </span>
                </div>

                {eventFormData.showTravelTime !== false ? (
                  <>
                    <p className="text-[11px] text-slate-600">
                      由承辦人統一設定（所有學員之路途時間均相同），簽退時系統將自動以【參加時間 ＋ 統一路途時間】核予補休時間，無需逐一對個別學員重複設定。
                    </p>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                      <div className="relative w-36">
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={5}
                          value={eventFormData.defaultTravelMinutes ?? 60}
                          onChange={e => setEventFormData({ ...eventFormData, defaultTravelMinutes: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 rounded-xl border border-indigo-300 text-sm font-bold text-indigo-900 bg-white focus:ring-2 focus:ring-indigo-500 pr-12 text-center"
                        />
                        <span className="absolute right-3 top-2 text-xs font-semibold text-slate-500">分鐘</span>
                      </div>

                      {/* Preset quick buttons */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { label: '0分 (無路程)', val: 0 },
                          { label: '30分鐘', val: 30 },
                          { label: '60分 (1小時)', val: 60 },
                          { label: '90分 (1.5小時)', val: 90 },
                          { label: '120分 (2小時)', val: 120 }
                        ].map(preset => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => setEventFormData({ ...eventFormData, defaultTravelMinutes: preset.val })}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              (eventFormData.defaultTravelMinutes ?? 60) === preset.val
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-indigo-50 hover:border-indigo-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic bg-white/60 p-2 rounded-lg">
                    目前已關閉路途時間欄位，簽退端與名冊將不顯示路途時間，計算補休時亦不額外加計路程時數。
                  </p>
                )}
              </div>

              {/* Deduction Time Setting (統一扣除時間) */}
              <div className="bg-gradient-to-br from-rose-50/70 to-amber-50/60 p-4 rounded-2xl border border-rose-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-xs text-rose-950">
                    <input
                      type="checkbox"
                      checked={eventFormData.showDeductionTime ?? false}
                      onChange={e => setEventFormData({ ...eventFormData, showDeductionTime: e.target.checked })}
                      className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                    />
                    <MinusCircle className="w-4 h-4 text-rose-600" />
                    <span>啟用並顯示「扣除時間」欄位 (比照路途時間由承辦人統一設定)</span>
                  </label>
                  <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded font-semibold">
                    {eventFormData.showDeductionTime ? '已啟用' : '已停用'}
                  </span>
                </div>

                {eventFormData.showDeductionTime ? (
                  <>
                    <p className="text-[11px] text-slate-600">
                      全體參加人員之扣除時間統一由此設定（例如用餐休息時間），核算補休時將自參加時數中扣除。
                    </p>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                      <div className="relative w-36">
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={5}
                          value={eventFormData.defaultDeductionMinutes ?? 60}
                          onChange={e => setEventFormData({ ...eventFormData, defaultDeductionMinutes: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 rounded-xl border border-rose-300 text-sm font-bold text-rose-900 bg-white focus:ring-2 focus:ring-rose-500 pr-12 text-center"
                        />
                        <span className="absolute right-3 top-2 text-xs font-semibold text-slate-500">分鐘</span>
                      </div>

                      {/* Preset quick buttons */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { label: '0分 (不扣除)', val: 0 },
                          { label: '30分鐘', val: 30 },
                          { label: '60分 (1小時)', val: 60 },
                          { label: '90分 (1.5小時)', val: 90 },
                          { label: '120分 (2小時)', val: 120 }
                        ].map(preset => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => setEventFormData({ ...eventFormData, defaultDeductionMinutes: preset.val })}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              (eventFormData.defaultDeductionMinutes ?? 60) === preset.val
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-rose-50 hover:border-rose-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Deduction Reason Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        扣除時間原因說明
                      </label>
                      <input
                        type="text"
                        value={eventFormData.deductionReason ?? ''}
                        onChange={e => setEventFormData({ ...eventFormData, deductionReason: e.target.value })}
                        placeholder="例：午休用餐休息時間不計入補休"
                        className="w-full px-3 py-2 rounded-xl border border-rose-200 text-xs focus:ring-2 focus:ring-rose-500 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        此原因將載明於簽退端計算詳情、管理後台名冊及列印/匯出報表中
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic bg-white/60 p-2 rounded-lg">
                    目前已關閉扣除時間欄位，簽退端與名冊將不顯示扣除時間，補休計算不進行時間扣減。
                  </p>
                )}
              </div>

              {/* Comp Time Formula Callout */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 text-xs text-slate-700">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                  <Award className="w-4 h-4 text-indigo-600" />
                  <span>核予補休時間定義與計算公式</span>
                </div>
                <div className="text-[11px] font-mono bg-white p-2 rounded-lg border border-slate-200 text-indigo-950 font-semibold my-1">
                  核予補休時間 ＝ 參加時間 {eventFormData.showTravelTime !== false ? '＋ 路途時間' : ''} {eventFormData.showDeductionTime ? '－ 扣除時間' : ''}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  承辦人可勾選上方選項決定是否啟用「路途時間」與「扣除時間」；未勾選者不納入計算，計算結果小於 0 則以 0 分鐘計。
                </p>
              </div>

              {/* Helper Password Setting Section */}
              <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-teal-600" />
                    <span>現場協助人員登入密碼 (授權名單查詢與簽到退覆核)</span>
                  </label>
                  <span className="text-[10px] text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-full font-semibold border border-teal-200">
                    預設：user1234
                  </span>
                </div>
                <input
                  type="text"
                  value={eventFormData.helperPassword ?? 'user1234'}
                  onChange={e => setEventFormData({ ...eventFormData, helperPassword: e.target.value })}
                  placeholder="請設定現場協助人員密碼..."
                  className="w-full px-3.5 py-2 rounded-xl border border-teal-300 text-xs font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
                <p className="text-[11px] text-teal-800 leading-relaxed">
                  提供給現場協助同仁或人事助理登入後台使用，協助人員僅能查閱名單、協助報到與執行簽到退覆核，無法更改活動設定或刪除紀錄。主辦人員可隨時在此查閱與變更。
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 mt-4">
                <button
                  type="button"
                  onClick={() => setIsEditingEvent(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>儲存設定並同步</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Single Attendee Check-in/Check-out Modal */}
      {attendeeToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  取消報到確認
                </h3>
                <p className="text-xs text-slate-500">
                  學員簽到與簽退資料復原
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-800 mb-3">
              確定要取消 <span className="font-bold text-slate-900 text-base">「{attendeeToCancel.name}」</span> 的報到紀錄嗎？
            </p>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs mb-6 space-y-1">
              <p className="font-semibold">
                {attendeeToCancel.hasCheckOut
                  ? '注意：該學員目前已完成簽退。'
                  : '注意：該學員目前為已報到狀態。'}
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                確定取消後，將會<strong>刪除該學員之簽到與簽退時間、手寫簽章、補休時數及覆核狀態</strong>，回復為「未完成報到」狀態。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAttendeeToCancel(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                保留紀錄 (返回)
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = attendeeToCancel;
                  setAttendeeToCancel(null);
                  onRemoveCheckIn(target.id, target.checkInId, target.name);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>確定取消報到</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset All Check-ins Confirmation Modal */}
      {confirmResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  清空所有簽到及簽退紀錄
                </h3>
                <p className="text-xs text-slate-500">
                  承辦人重要資料清除確認
                </p>
              </div>
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 font-bold text-sm text-center mb-4 leading-relaxed">
              請確定是否要清除,清除後資料無法復原
            </div>

            <div className="text-xs text-slate-600 space-y-2 mb-6 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <p className="font-semibold text-slate-800">
                執行清空後將會產生以下變更：
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                <li>全體學員之<strong>簽到時間</strong>、<strong>簽退時間</strong>與<strong>手寫電子簽章</strong>全部刪除。</li>
                <li>所有學員的研習參加時數、核予補休時間歸零。</li>
                <li>簽到覆核與簽退覆核狀態均一併重設。</li>
                <li>全體人員即刻<strong>回復為「未完成報到」狀態</strong>。</li>
                <li>預先報名的名冊人員（{totalRosterCount}人）名單將完整保留，不受影響。</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmResetModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                取消返回
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmResetModalOpen(false);
                  onResetAllCheckIns();
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>確定清除所有紀錄</span>
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
      {/* Printable Sheet Modal */}
      {showPrintModal && (
        <PrintableView
          eventInfo={eventInfo}
          attendees={attendees}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </>
  );
};
