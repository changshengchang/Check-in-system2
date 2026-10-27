import React, { useState } from 'react';
import { Lock, KeyRound, Eye, EyeOff, AlertCircle, X, ShieldCheck } from 'lucide-react';

export type StaffRole = 'organizer' | 'helper';

interface OrganizerAuthModalProps {
  isOpen: boolean;
  onSuccess: (role: StaffRole) => void;
  onClose: () => void;
  helperPassword?: string;
}

/**
 * 承辦人：完整管理權限 (固定密碼 nick620504)
 * 協助人員：只能查詢與簽到/簽退覆核 (預設 user1234，承辦人可於後台自訂)
 */
export function roleForPassword(password: string, helperPassword?: string): StaffRole | null {
  const trimmed = password.trim();
  if (trimmed === 'nick620504') return 'organizer';
  const activeHelper = (helperPassword || 'user1234').trim();
  if (trimmed === activeHelper) return 'helper';
  return null;
}

export const OrganizerAuthModal: React.FC<OrganizerAuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  helperPassword
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const role = roleForPassword(password, helperPassword);
    if (role) {
      setError(false);
      setPassword('');
      onSuccess(role);
    } else {
      setError(true);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden p-6 sm:p-7">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
          承辦人管理後台驗證
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          請輸入承辦人或協助人員密碼。協助人員僅能查詢名單與進行簽到／簽退覆核。
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>請輸入驗證密碼</span>
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="請輸入密碼..."
                className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-sm font-medium focus:outline-hidden focus:ring-2 transition-all ${
                  error
                    ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/40 text-rose-900'
                    : 'border-slate-300 focus:ring-indigo-500 focus:border-indigo-500 bg-white'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>密碼驗證錯誤，請重新確認後再試！</span>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              取消返回
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>驗證登入</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
