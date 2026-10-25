import React, { useEffect, useState } from 'react';
import { Clock, Lock, Unlock, PlayCircle, StopCircle, Save, AlertCircle, Timer } from 'lucide-react';
import { verifyTimeoutMinutes, DEFAULT_VERIFY_TIMEOUT_MIN, MAX_VERIFY_TIMEOUT_MIN } from '../utils/verify';
import { EventInfo, SubmitWindow } from '../types';
import {
  useSubmitWindow,
  serverNow,
  formatRemaining,
  formatWindowTime,
  toDateTimeInputValue,
  fromDateTimeInputValue
} from '../utils/submitWindow';

type Kind = 'checkin' | 'checkout';

interface SubmitWindowPanelProps {
  eventInfo: EventInfo;
  onUpdateSubmitWindow: (kind: Kind, window: SubmitWindow) => void;
  onUpdateVerifyTimeout?: (minutes: number) => void;
}

/** 承辦人後台：簽到 / 簽退開放時段設定 */
export const SubmitWindowPanel: React.FC<SubmitWindowPanelProps> = ({ eventInfo, onUpdateSubmitWindow, onUpdateVerifyTimeout }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5" data-testid="submit-window-panel">
    <div className="flex items-start gap-2 mb-3">
      <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
      <div>
        <h3 className="text-sm font-bold text-slate-900">簽到／簽退開放時段</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          啟用後，學員只能在時段內按下送出；承辦人在後台協助報到、簽退與覆核不受限制。設定會立即同步到所有手機與電腦。
        </p>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <WindowEditor kind="checkin" window={eventInfo.checkInWindow} onSave={w => onUpdateSubmitWindow('checkin', w)} />
      <WindowEditor kind="checkout" window={eventInfo.checkOutWindow} onSave={w => onUpdateSubmitWindow('checkout', w)} />
    </div>
    {onUpdateVerifyTimeout && <VerifyTimeoutEditor minutes={verifyTimeoutMinutes(eventInfo)} onSave={onUpdateVerifyTimeout} />}
  </div>
);

/** 簽到覆核期限：學員自行簽到後須在幾分鐘內完成簽到覆核，逾時作廢 */
const VerifyTimeoutEditor: React.FC<{ minutes: number; onSave: (m: number) => void }> = ({ minutes, onSave }) => {
  const enabled = minutes > 0;
  const [draft, setDraft] = useState(String(enabled ? minutes : DEFAULT_VERIFY_TIMEOUT_MIN));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(String(enabled ? minutes : DEFAULT_VERIFY_TIMEOUT_MIN));
  }, [minutes, enabled, dirty]);
  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_VERIFY_TIMEOUT_MIN;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2" data-testid="verify-timeout-editor">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-rose-600" />
          <span className="text-sm font-bold text-slate-800">簽到覆核期限</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${enabled ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`} data-testid="verify-timeout-status">
            {enabled ? `${minutes} 分鐘內未覆核即作廢` : '不作廢'}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-slate-600">逾時作廢</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            data-testid="verify-timeout-toggle"
            onClick={() => { setDirty(false); onSave(enabled ? 0 : (valid ? n : DEFAULT_VERIFY_TIMEOUT_MIN)); }}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-rose-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>
      {enabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={1}
            max={MAX_VERIFY_TIMEOUT_MIN}
            value={draft}
            onChange={e => { setDraft(e.target.value); setDirty(true); }}
            data-testid="verify-timeout-input"
            className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
          />
          <span className="text-xs text-slate-600">分鐘</span>
          <button
            type="button"
            disabled={!dirty || !valid}
            onClick={() => { setDirty(false); onSave(n); }}
            data-testid="verify-timeout-save"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> 儲存
          </button>
          {!valid && <span className="text-xs text-rose-700">請輸入 1～{MAX_VERIFY_TIMEOUT_MIN} 的整數</span>}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        學員自行簽到後，須在期限內由人事單位完成「簽到覆核」，逾時自動作廢需重新簽到。承辦人協助報到不受影響；修改只套用到之後送出的簽到。
      </p>
    </div>
  );
};

interface WindowEditorProps {
  kind: Kind;
  window?: SubmitWindow;
  onSave: (w: SubmitWindow) => void;
}

const WindowEditor: React.FC<WindowEditorProps> = ({ kind, window, onSave }) => {
  const label = kind === 'checkin' ? '簽到' : '簽退';
  const enabled = Boolean(window?.enabled);
  const status = useSubmitWindow(window);

  const [startInput, setStartInput] = useState(toDateTimeInputValue(window?.startMs));
  const [endInput, setEndInput] = useState(toDateTimeInputValue(window?.endMs));
  const [dirty, setDirty] = useState(false);

  // 其他裝置修改時段時，若這裡沒有尚未儲存的編輯，就跟著更新
  useEffect(() => {
    if (dirty) return;
    setStartInput(toDateTimeInputValue(window?.startMs));
    setEndInput(toDateTimeInputValue(window?.endMs));
  }, [window?.startMs, window?.endMs, dirty]);

  const draftStart = fromDateTimeInputValue(startInput);
  const draftEnd = fromDateTimeInputValue(endInput);
  const invalidRange = draftStart !== undefined && draftEnd !== undefined && draftEnd <= draftStart;

  const save = (w: SubmitWindow) => {
    setDirty(false);
    onSave(w);
  };

  const handleToggle = () => {
    if (enabled) {
      // 關閉限制時保留時間，下次啟用可直接沿用
      save({ ...window, enabled: false });
      return;
    }
    const hasTimes = typeof window?.startMs === 'number' || typeof window?.endMs === 'number';
    if (hasTimes) {
      save({ ...window, enabled: true });
    } else {
      // 第一次啟用：預設從現在開始開放 1 小時
      const start = Math.floor(serverNow() / 60000) * 60000;
      save({ enabled: true, startMs: start, endMs: start + 60 * 60000 });
    }
  };

  const handleSaveTimes = () => {
    if (invalidRange) return;
    save({ enabled: true, startMs: draftStart, endMs: draftEnd });
  };

  const handleOpenNow = () => {
    const now = serverNow();
    const end = typeof window?.endMs === 'number' && window.endMs > now ? window.endMs : undefined;
    save({ enabled: true, startMs: now, endMs: end });
  };

  const handleCloseNow = () => {
    const now = serverNow();
    const start = typeof window?.startMs === 'number' && window.startMs < now ? window.startMs : undefined;
    save({ enabled: true, startMs: start, endMs: now });
  };

  const pill = (() => {
    switch (status.state) {
      case 'unrestricted':
        return { text: '不限制，隨時可送出', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
      case 'not_started':
        return { text: `尚未開放（${formatRemaining(status.remainingMs ?? 0)}後開放）`, cls: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'open':
        return {
          text: status.endMs !== undefined ? `開放中（剩 ${formatRemaining(status.remainingMs ?? 0)}）` : '開放中（未設定截止）',
          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'closed':
        return { text: '已截止', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
  })();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3" data-testid={`window-editor-${kind}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">學員{label}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pill.cls}`} data-testid={`window-status-${kind}`}>
            {pill.text}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-slate-600">限制送出時段</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            data-testid={`window-toggle-${kind}`}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>

      {enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">開始時間（台灣時間，空白＝立即開放）</span>
              <input
                type="datetime-local"
                value={startInput}
                onChange={e => { setStartInput(e.target.value); setDirty(true); }}
                data-testid={`window-start-${kind}`}
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">截止時間（台灣時間，空白＝不截止）</span>
              <input
                type="datetime-local"
                value={endInput}
                onChange={e => { setEndInput(e.target.value); setDirty(true); }}
                data-testid={`window-end-${kind}`}
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          {invalidRange && (
            <div className="text-xs text-rose-700 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> 截止時間必須晚於開始時間
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveTimes}
              disabled={!dirty || invalidRange}
              data-testid={`window-save-${kind}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" /> 儲存時間
            </button>
            <button
              type="button"
              onClick={handleOpenNow}
              data-testid={`window-open-now-${kind}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5" /> 立即開放
            </button>
            <button
              type="button"
              onClick={handleCloseNow}
              data-testid={`window-close-now-${kind}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer"
            >
              <StopCircle className="w-3.5 h-3.5" /> 立即截止
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDirty(false)}
                className="px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                取消修改
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            {status.canSubmit ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            目前設定：
            {window?.startMs !== undefined ? `${formatWindowTime(window.startMs)} 開放` : '立即開放'}
            {' ～ '}
            {window?.endMs !== undefined ? `${formatWindowTime(window.endMs)} 截止` : '不截止'}
            {dirty && <span className="text-amber-700 font-semibold">（有未儲存的修改）</span>}
          </p>
        </>
      )}
    </div>
  );
};
