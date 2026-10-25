import React, { useEffect, useState } from 'react';
import { Search, X, CheckCircle2, Timer, Smartphone, UserCheck } from 'lucide-react';
import { CombinedAttendeeView, EventInfo } from '../types';
import { searchCheckedIn, lookupDisplayFields, fieldValue, isCheckedIn } from '../utils/lookup';
import { listMyCheckIns } from '../utils/myCheckIns';
import { isCheckInVerified, verifyRemainingMs, formatCountdown } from '../utils/verify';
import { serverNow } from '../utils/submitWindow';

interface CheckInLookupProps {
  eventInfo: EventInfo;
  attendees: CombinedAttendeeView[];
  onNavigateToCheckIn?: () => void;
  /** 雲端資料是否已載入 (載入前不判斷「已失效」，避免誤報) */
  dataReady?: boolean;
}

const twTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * 「報到資訊查詢」(不需密碼)：已報到的人可查自己的序號、桌次等資訊與覆核狀態。
 * 只顯示姓名、序號、職稱、報到時間、覆核狀態與承辦人勾選的欄位 (自動排除電話、信箱等個資)。
 */
export const CheckInLookup: React.FC<CheckInLookupProps> = ({ eventInfo, attendees, onNavigateToCheckIn, dataReady = true }) => {
  const [query, setQuery] = useState('');
  const results = searchCheckedIn(attendees, query);
  const fields = lookupDisplayFields(eventInfo);

  // 這支手機最近送出的報到 (不小心關掉成功頁時可在這裡找回)
  const [mine] = useState(() => listMyCheckIns());
  const myRecords = mine
    .map(m => ({ m, a: attendees.find(a => isCheckedIn(a) && a.checkInId === m.id) }))
    .filter(x => x.a) as { m: { id: string; name: string }; a: CombinedAttendeeView }[];
  const myGone = dataReady ? mine.filter(m => !attendees.some(a => isCheckedIn(a) && a.checkInId === m.id)) : [];

  // 有人在等待覆核時每秒更新倒數
  const visible = [...myRecords.map(x => x.a), ...results];
  const hasPending = visible.some(a => verifyRemainingMs(a, serverNow()) !== undefined);
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [hasPending]);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6 space-y-5" data-testid="lookup-page">
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-2 text-teal-50 text-xs font-semibold">
          <Search className="w-4 h-4" />
          <span>報到資訊查詢</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black mt-1 truncate">{eventInfo.title}</h2>
        <p className="text-xs text-teal-50 mt-1">已報到的人都會列在下方（最新報到在最上面），也可以輸入姓名或序號快速找到自己</p>
      </div>

      {/* This device's recent check-ins */}
      {(myRecords.length > 0 || myGone.length > 0) && (
        <section className="bg-white rounded-2xl border-2 border-teal-200 shadow-xs overflow-hidden" data-testid="lookup-mine">
          <h3 className="px-4 py-2.5 bg-teal-50 text-sm font-bold text-teal-900 flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> 這支手機剛才的報到
          </h3>
          <ul className="divide-y divide-slate-100">
            {myRecords.map(({ a }) => (
              <ResultCard key={a.id} a={a} fields={fields} now={now} />
            ))}
            {myGone.map(m => (
              <li key={m.id} className="px-4 py-3 text-sm text-rose-700" data-testid="lookup-mine-gone">
                「{m.name}」的報到已失效或被取消，請重新簽到。
                {onNavigateToCheckIn && (
                  <button type="button" onClick={onNavigateToCheckIn} className="ml-1 font-bold underline cursor-pointer">
                    前往簽到
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="輸入姓名或序號搜尋"
          data-testid="lookup-input"
          className="w-full pl-11 pr-10 py-3 rounded-2xl border-2 border-slate-200 focus:border-teal-500 focus:outline-hidden text-base bg-white"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-3 p-1 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="清除">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 已報到名單：預設全部列出，最新報到在最上面；有輸入時篩選 */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span className="font-bold text-slate-700">{query.trim() ? '搜尋結果' : '已報到名單（最新在上）'}</span>
        <span data-testid="lookup-count">{results.length} 位</span>
      </div>
      {results.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500" data-testid="lookup-empty">
          {query.trim() ? '查無已報到的資料' : '目前還沒有人報到'}
          <div className="text-xs text-slate-400 mt-1">尚未報到或報到已失效的人不會顯示</div>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden" data-testid="lookup-results">
          {results.map(a => (
            <ResultCard key={a.id} a={a} fields={fields} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
};

const ResultCard: React.FC<{ a: CombinedAttendeeView; fields: string[]; now: number }> = ({ a, fields, now }) => {
  const verified = isCheckInVerified(a);
  const remaining = verifyRemainingMs(a, now);
  const boxes: { label: string; value: string; big?: boolean }[] = [
    { label: '您的序號', value: a.serialNo !== undefined ? String(a.serialNo) : '配發中', big: true },
    { label: '職稱', value: a.title || '—' },
    { label: '報到時間', value: twTime(a.checkInTime) },
    ...(a.checkOutTime ? [{ label: '簽退時間', value: twTime(a.checkOutTime) }] : []),
    ...fields.map(f => ({ label: f, value: fieldValue(a, f) ?? '—' }))
  ];
  return (
    <li className="px-4 py-4" data-testid="lookup-result">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-5 h-5 text-teal-600 shrink-0" />
          <span className="font-black text-slate-900 text-lg truncate">{a.name}</span>
          {a.isWalkIn && <span className="shrink-0 text-[10px] bg-amber-100 text-amber-800 px-1.5 rounded font-semibold">現場追加</span>}
        </div>
        {verified ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold" data-testid="lookup-verified">
            <CheckCircle2 className="w-3.5 h-3.5" /> 簽到已覆核
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold" data-testid="lookup-pending">
            <Timer className="w-3.5 h-3.5" /> 簽到未覆核{remaining !== undefined ? `（剩 ${formatCountdown(remaining)}）` : ''}
          </span>
        )}
      </div>
      {a.checkOutTime && (
        <div className="mt-1.5 flex justify-end">
          {a.checkOutHrVerified ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold" data-testid="lookup-checkout-verified">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已簽退 · 簽退已覆核
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-bold" data-testid="lookup-checkout-pending">
              <Timer className="w-3.5 h-3.5" /> 已簽退 · 簽退未覆核
            </span>
          )}
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {boxes.map(b => (
          <div key={b.label} className="bg-slate-50 rounded-xl px-3 py-2 min-w-0">
            <dt className="text-[11px] text-slate-500">{b.label}</dt>
            <dd className={`font-bold text-slate-900 truncate ${b.big ? 'text-xl font-mono text-teal-700' : 'text-base'}`}>{b.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
};
