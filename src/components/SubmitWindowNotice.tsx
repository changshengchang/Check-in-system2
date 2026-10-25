import React from 'react';
import { Clock, Lock } from 'lucide-react';
import { WindowStatus, formatRemaining, formatWindowTime } from '../utils/submitWindow';

interface SubmitWindowNoticeProps {
  status: WindowStatus;
  kind: 'checkin' | 'checkout';
}

/** 學員頁送出按鈕上方的開放時段提示 */
export function getWindowBlockedMessage(status: WindowStatus, kind: 'checkin' | 'checkout'): string {
  const label = kind === 'checkin' ? '簽到' : '簽退';
  if (status.state === 'not_started' && status.startMs !== undefined) {
    return `${label}尚未開放，將於 ${formatWindowTime(status.startMs)} 開放`;
  }
  if (status.state === 'closed' && status.endMs !== undefined) {
    return `${label}已於 ${formatWindowTime(status.endMs)} 截止，如需補${label === '簽到' ? '簽' : '辦'}請洽承辦人員`;
  }
  return '';
}

export const SubmitWindowNotice: React.FC<SubmitWindowNoticeProps> = ({ status, kind }) => {
  const label = kind === 'checkin' ? '簽到' : '簽退';

  if (status.state === 'unrestricted') return null;

  if (status.state === 'open') {
    if (status.endMs === undefined) return null;
    const urgent = (status.remainingMs ?? 0) < 5 * 60 * 1000;
    return (
      <div
        className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
          urgent ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'
        }`}
        data-testid="window-notice"
      >
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          {label}開放至 <strong>{formatWindowTime(status.endMs)}</strong>
          （剩 {formatRemaining(status.remainingMs ?? 0)}）
        </span>
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-xl border-2 text-sm flex items-start gap-2 font-semibold ${
        status.state === 'not_started'
          ? 'bg-amber-50 border-amber-300 text-amber-900'
          : 'bg-rose-50 border-rose-300 text-rose-800'
      }`}
      data-testid="window-notice"
    >
      <Lock className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <div>{getWindowBlockedMessage(status, kind)}</div>
        {status.state === 'not_started' && status.remainingMs !== undefined && (
          <div className="text-xs font-normal mt-0.5">還有 {formatRemaining(status.remainingMs)}，時間到會自動開放，不用重新整理</div>
        )}
        {status.state === 'closed' && (
          <div className="text-xs font-normal mt-0.5">目前無法送出{label}</div>
        )}
      </div>
    </div>
  );
};
