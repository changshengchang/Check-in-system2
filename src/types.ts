export interface EventInfo {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
  notes: string;
  // 路途時間設定 (可勾選是否顯示)
  showTravelTime?: boolean; // 預設 true
  defaultTravelMinutes?: number; // 統一路途時間 (分鐘，預設 60 分鐘)
  // 扣除時間設定 (可勾選是否顯示，並可設定原因)
  showDeductionTime?: boolean; // 預設 false / true (承辦人可勾選是否啟用)
  defaultDeductionMinutes?: number; // 統一扣除時間 (分鐘，例如午休 60 分鐘)
  deductionReason?: string; // 扣除時間原因說明 (例如：午休用餐休息時間不計入補休)
  // 附件1 (報到手續完成畫面) 欄位顯示設定
  completionDisplayFields?: string[]; // 勾選要呈現於報到完成畫面的名冊欄位清單
  availableRosterColumns?: string[]; // 名冊目前所有可用欄位
  // 開放時段：學員只能在時段內送出簽到 / 簽退 (承辦人後台操作不受限制)
  checkInWindow?: SubmitWindow;
  checkOutWindow?: SubmitWindow;
  // 簽到覆核期限 (分鐘)：學員自行簽到後須在期限內完成簽到覆核，逾時自動作廢；0 = 不作廢，未設定 = 15
  verifyTimeoutMinutes?: number;
  // 現場協助人員密碼 (預設 user1234，承辦人可於後台自行查看與修改)
  helperPassword?: string;
}

export interface SubmitWindow {
  enabled: boolean; // false = 不限制，隨時可送出
  startMs?: number; // 開始時間 (毫秒時間戳)，未設定 = 立即開放
  endMs?: number; // 截止時間 (毫秒時間戳)，未設定 = 不截止
}

export interface RegisteredParticipant {
  id: string;
  serialNo?: number; // 序號 (取自 Excel「編號」，或依序配發)
  isVip?: boolean; // 重要貴賓 (承辦人後台勾選，或 Excel「貴賓」欄位)
  name: string;
  title: string;
  department?: string;
  phone?: string;
  email?: string;
  registeredAt?: string;
  travelMinutes?: number; // 個別設定路途時間 (分鐘)
  customFields?: Record<string, string>; // 動態自訂名冊欄位 (例如：座位、組別、餐點、備註等)
}

export interface CheckInRecord {
  id: string;
  serialNo?: number; // 現場追加人員的序號 (目前最大序號 + 1；名冊人員用名冊上的序號)
  isVip?: boolean; // 現場追加人員的貴賓標記 (名冊人員的標記存在名冊上)
  verifyDeadlineMs?: number; // 學員自行簽到時設定：此時間前未完成簽到覆核即作廢 (伺服器時間)
  participantId?: string; // If matched to pre-registered
  name: string;
  title: string;
  department?: string;
  phone?: string;
  email?: string;
  checkInTime: string; // ISO string (簽到時間)
  signatureDataUrl: string; // Base64 PNG/JPEG image (簽到手寫簽署)
  isWalkIn: boolean; // True if registered on site
  notes?: string;
  hrVerified?: boolean; // 相容性欄位: 人事簽到覆核
  hrVerifiedAt?: string;
  checkInHrVerified?: boolean; // 簽到覆核狀態: true 已覆核, false/undefined 未覆核
  checkInHrVerifiedAt?: string; // 簽到覆核時間
  checkOutHrVerified?: boolean; // 簽退覆核狀態: true 已覆核, false/undefined 未覆核
  checkOutHrVerifiedAt?: string; // 簽退覆核時間
  checkOutTime?: string; // ISO string (簽退時間)
  checkOutSignatureDataUrl?: string; // Base64 image (簽退手寫簽署)
  durationMinutes?: number; // 參加時間 (分鐘數)
  durationDisplay?: string; // 參加時間文字 (例如: 2小時15分)
  travelMinutes?: number; // 統一路途時間 (分鐘數)
  travelDisplay?: string; // 路途時間文字 (例如: 1小時 或 60分鐘)
  deductionMinutes?: number; // 扣除時間 (分鐘數)
  deductionDisplay?: string; // 扣除時間文字
  deductionReason?: string; // 扣除原因說明
  compTimeMinutes?: number; // 核予補休時間 ("參加時間" + "路途時間" - "扣除時間"，單位分鐘)
  compTimeDisplay?: string; // 核予補休時間文字
  customFields?: Record<string, string>; // 學員名冊所屬之自訂欄位
  // Firebase 同步資訊 (最後由哪台裝置、何時、做了什麼修改)
  syncUpdatedAt?: number;
  syncModifiedBy?: string;
  syncAction?: string;
  syncSource?: 'student' | 'organizer';
}

export type SyncStatus = 'connecting' | 'synced' | 'pending' | 'offline' | 'error';

export type AttendeeStatus = 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'WALK_IN';

export interface CombinedAttendeeView {
  id: string;
  serialNo?: number; // 序號 (名冊人員取名冊序號；現場追加取簽到紀錄上的序號)
  isVip?: boolean; // 重要貴賓
  verifyDeadlineMs?: number; // 簽到覆核期限 (學員自行簽到才有)
  checkInId?: string;
  name: string;
  title: string;
  department?: string;
  phone?: string;
  email?: string;
  status: AttendeeStatus;
  checkInTime?: string;
  signatureDataUrl?: string;
  isWalkIn: boolean;
  notes?: string;
  hrVerified?: boolean; // 相容性欄位
  hrVerifiedAt?: string;
  checkInHrVerified?: boolean; // 簽到覆核狀態
  checkInHrVerifiedAt?: string;
  checkOutHrVerified?: boolean; // 簽退覆核狀態
  checkOutHrVerifiedAt?: string;
  checkOutTime?: string; // 簽退時間
  checkOutSignatureDataUrl?: string; // 簽退手寫簽名
  durationMinutes?: number; // 參加時間 (分鐘數)
  durationDisplay?: string; // 參加時間文字 (例如: 2小時15分)
  travelMinutes?: number; // 統一路途時間 (分鐘數)
  travelDisplay?: string; // 路途時間文字
  deductionMinutes?: number; // 扣除時間 (分鐘數)
  deductionDisplay?: string; // 扣除時間文字
  deductionReason?: string; // 扣除原因說明
  compTimeMinutes?: number; // 核予補休時間 (分鐘數) = 參加時間 + 路途時間 - 扣除時間
  compTimeDisplay?: string; // 核予補休時間文字
  customFields?: Record<string, string>; // 名冊自訂各欄位資料
}
