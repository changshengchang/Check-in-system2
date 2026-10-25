import React from 'react';
import { AlertTriangle, CheckCircle2, Timer, XCircle, Ban } from 'lucide-react';
import { SuccessState, formatCountdown } from '../utils/verify';

/** 報到成功頁最上方：請勿關閉提示 / 覆核完成提示 */
export const VerifyTopBanner: React.FC<{ state: SuccessState; timeoutMinutes: number }> = ({ state, timeoutMinutes }) => {
  if (state === 'pending') {
    return (
      <div className="mb-4 p-3 rounded-2xl bg-rose-600 text-white text-left shadow-md" data-testid="verify-top-banner">
        <div className="flex items-center gap-2 font-black text-base">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          請勿關閉此頁面
        </div>
        <p className="text-xs mt-1 text-rose-50 leading-relaxed">
          請於 {timeoutMinutes} 分鐘內向人事單位出示此畫面，完成【簽到覆核】後即可關閉。
        </p>
      </div>
    );
  }
  if (state === 'verified') {
    return (
      <div className="mb-4 p-3 rounded-2xl bg-emerald-600 text-white text-left shadow-md" data-testid="verify-top-banner">
        <div className="flex items-center gap-2 font-black text-base">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          簽到覆核完成，可以關閉此頁面了
        </div>
      </div>
    );
  }
  return null;
};

/** 報到成功頁下方：倒數 / 覆核完成 / 逾時失效 / 已被取消 */
export const VerifyBottomStatus: React.FC<{
  state: SuccessState;
  remainingMs?: number;
  onRetry?: () => void;
}> = ({ state, remainingMs, onRetry }) => {
  switch (state) {
    case 'pending': {
      const urgent = (remainingMs ?? 0) < 3 * 60_000;
      return (
        <div
          className={`mt-4 p-4 rounded-2xl border-2 text-center ${urgent ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}
          data-testid="verify-bottom-status"
        >
          <div className="flex items-center justify-center gap-2 text-sm font-bold">
            <Timer className="w-4 h-4" /> 等待人事單位簽到覆核
          </div>
          <div className="text-4xl font-black font-mono mt-1" data-testid="verify-countdown">{formatCountdown(remainingMs ?? 0)}</div>
          <p className="text-xs mt-1 leading-relaxed">
            時間內未完成覆核，本次報到將<strong>自動失效</strong>，需重新簽到
          </p>
        </div>
      );
    }
    case 'verified':
      return (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-center" data-testid="verify-bottom-status">
          <CheckCircle2 className="w-8 h-8 mx-auto" />
          <div className="text-base font-black mt-1">✓ 簽到覆核成功</div>
          <p className="text-xs mt-0.5">可以關閉此頁面了，祝您活動愉快！</p>
        </div>
      );
    case 'expired':
      return (
        <div className="mt-4 p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-center" data-testid="verify-bottom-status">
          <XCircle className="w-8 h-8 mx-auto" />
          <div className="text-base font-black mt-1">已逾時失效</div>
          <p className="text-xs mt-0.5">未在時間內完成簽到覆核，本次報到已作廢，請重新簽到。</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              data-testid="verify-retry"
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
            >
              重新簽到
            </button>
          )}
        </div>
      );
    case 'cancelled':
      return (
        <div className="mt-4 p-4 rounded-2xl bg-slate-100 border-2 border-slate-300 text-slate-700 text-center" data-testid="verify-bottom-status">
          <Ban className="w-8 h-8 mx-auto text-slate-500" />
          <div className="text-base font-black mt-1">此筆報到已被取消</div>
          <p className="text-xs mt-0.5">如有疑問請洽承辦人員，或重新簽到。</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold text-white bg-slate-600 hover:bg-slate-700 cursor-pointer"
            >
              重新簽到
            </button>
          )}
        </div>
      );
    default:
      return null;
  }
};

/** 簽退成功頁：等待簽退覆核 / 簽退覆核完成 (即時更新，無期限) */
export const CheckoutVerifyStatus: React.FC<{ verified: boolean; position: 'top' | 'bottom' }> = ({ verified, position }) => {
  if (position === 'top') {
    return verified ? (
      <div className="mb-4 p-3 rounded-2xl bg-emerald-600 text-white text-left shadow-md" data-testid="checkout-top-banner">
        <div className="flex items-center gap-2 font-black text-base">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          簽退覆核完成，可以關閉此頁面了
        </div>
      </div>
    ) : (
      <div className="mb-4 p-3 rounded-2xl bg-rose-600 text-white text-left shadow-md" data-testid="checkout-top-banner">
        <div className="flex items-center gap-2 font-black text-base">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          請勿關閉此頁面
        </div>
        <p className="text-xs mt-1 text-rose-50 leading-relaxed">請向人事單位出示此畫面，完成【簽退覆核】後即可關閉。</p>
      </div>
    );
  }
  return verified ? (
    <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-center" data-testid="checkout-bottom-status">
      <CheckCircle2 className="w-8 h-8 mx-auto" />
      <div className="text-base font-black mt-1">✓ 簽退覆核成功</div>
      <p className="text-xs mt-0.5">可以關閉此頁面了，辛苦了！</p>
    </div>
  ) : (
    <div className="mt-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-center" data-testid="checkout-bottom-status">
      <div className="flex items-center justify-center gap-2 text-sm font-bold">
        <Timer className="w-4 h-4" /> 等待人事單位簽退覆核
      </div>
      <p className="text-xs mt-1">人事單位覆核後，此畫面會自動更新</p>
    </div>
  );
};
