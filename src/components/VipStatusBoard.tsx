import React, { useEffect, useRef, useState } from 'react';
import { Star, CheckCircle2, LogOut, Clock, ArrowRight } from 'lucide-react';
import { CombinedAttendeeView, EventInfo } from '../types';
import { buildVipBoard, isRecent } from '../utils/vip';
import { serverNow } from '../utils/submitWindow';

interface VipStatusBoardProps {
  eventInfo: EventInfo;
  attendees: CombinedAttendeeView[];
}

const HIGHLIGHT_MS = 8000;

const twTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * 「剛報到 / 剛簽退」閃爍提示
 * 只在看板開著時、名單新增了某人，且該報到/簽退確實是最近 5 分鐘內發生才閃爍
 * (第一次打開、剛勾選為貴賓、重新整理時不會誤閃)
 */
function useFreshHighlight(list: CombinedAttendeeView[], timeOf: (a: CombinedAttendeeView) => string | undefined, prefix: string) {
  const seenRef = useRef<Set<string> | null>(null);
  const [until, setUntil] = useState<Record<string, number>>({});
  const key = list.map(a => a.id).join(',');

  useEffect(() => {
    const ids = list.map(a => a.id);
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const now = serverNow();
    const fresh = list.filter(a => !seenRef.current!.has(a.id) && isRecent(timeOf(a), now)).map(a => a.id);
    seenRef.current = new Set(ids);
    if (fresh.length === 0) return;

    const end = Date.now() + HIGHLIGHT_MS;
    setUntil(u => ({ ...u, ...Object.fromEntries(fresh.map(id => [id, end])) }));
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-vip-row="${prefix}:${CSS.escape(fresh[fresh.length - 1])}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    const timer = setTimeout(
      () => setUntil(u => Object.fromEntries(Object.entries(u).filter(([, t]) => t > Date.now()))),
      HIGHLIGHT_MS + 100
    );
    return () => clearTimeout(timer);
  }, [key]);

  return (id: string) => (until[id] ?? 0) > Date.now();
}

/** 前台「貴賓報到情形」：不需密碼，資料即時同步；在場中 → 尚未報到 → 已簽退 */
export const VipStatusBoard: React.FC<VipStatusBoardProps> = ({ eventInfo, attendees }) => {
  const board = buildVipBoard(attendees);
  const isNewArrival = useFreshHighlight(board.present, a => a.checkInTime, 'in');
  const isNewCheckout = useFreshHighlight(board.checkedOut, a => a.checkOutTime, 'out');
  const { counts } = board;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-5" data-testid="vip-board">
      {/* Title & summary (same order as the sections below) */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-center gap-2 text-amber-50 text-xs font-semibold">
          <Star className="w-4 h-4 fill-current" />
          <span>貴賓報到情形 · 即時更新</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black mt-1 truncate">{eventInfo.title}</h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center" data-testid="vip-counts">
          {[
            { label: '貴賓', value: counts.total },
            { label: '在場中', value: counts.present },
            { label: '尚未報到', value: counts.notArrived },
            { label: '已簽退', value: counts.checkedOut }
          ].map(c => (
            <div key={c.label} className="bg-white/15 rounded-xl py-2">
              <div className="text-2xl font-black">{c.value}</div>
              <div className="text-[11px] text-amber-50">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {counts.total === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          <Star className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          目前尚未標記任何貴賓
          <div className="text-xs text-slate-400 mt-1">請承辦人於後台名單的「貴賓」欄位勾選</div>
        </div>
      ) : (
        <>
          {/* 1. Present: earliest check-in on top, newest at the bottom */}
          <Section
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            title="在場中（依報到時間，最早在上）"
            count={board.present.length}
            empty="目前沒有在場的貴賓"
            testId="vip-present"
          >
            {board.present.map(a => {
              const isNew = isNewArrival(a.id);
              return (
                <li
                  key={a.id}
                  data-vip-row={`in:${a.id}`}
                  data-testid="vip-present-item"
                  className={`px-4 py-3 flex items-center gap-3 transition-colors duration-700 ${isNew ? 'bg-emerald-100 animate-pulse' : ''}`}
                >
                  <PersonInfo a={a} />
                  <div className="shrink-0 text-right space-y-1">
                    <div className="text-xs font-semibold text-emerald-700 flex items-center justify-end gap-1">
                      <Clock className="w-3.5 h-3.5" /> {twTime(a.checkInTime)} 報到
                    </div>
                    {isNew && <div className="text-[11px] font-black text-emerald-700">剛剛報到</div>}
                  </div>
                </li>
              );
            })}
          </Section>

          {/* 2. Not yet arrived: by serial */}
          <Section
            icon={<Clock className="w-4 h-4 text-slate-400" />}
            title="尚未報到"
            count={board.notArrived.length}
            empty="貴賓皆已報到"
            emptyClass="text-emerald-600 font-semibold"
            testId="vip-not-arrived"
          >
            {board.notArrived.map(a => (
              <li key={a.id} data-testid="vip-not-arrived-item" className="px-4 py-3 flex items-center gap-3 opacity-80">
                <PersonInfo a={a} />
                <span className="shrink-0 text-xs text-slate-400 font-semibold">未報到</span>
              </li>
            ))}
          </Section>

          {/* 3. Checked out: earliest check-out on top, newest at the bottom */}
          <Section
            icon={<LogOut className="w-4 h-4 text-orange-600" />}
            title="已簽退（依簽退時間，最早在上）"
            count={board.checkedOut.length}
            empty="尚無貴賓簽退"
            testId="vip-checked-out"
          >
            {board.checkedOut.map(a => {
              const isNew = isNewCheckout(a.id);
              return (
                <li
                  key={a.id}
                  data-vip-row={`out:${a.id}`}
                  data-testid="vip-checked-out-item"
                  className={`px-4 py-3 flex items-center gap-3 transition-colors duration-700 ${isNew ? 'bg-orange-100 animate-pulse' : 'bg-slate-50/60'}`}
                >
                  <PersonInfo a={a} />
                  <div className="shrink-0 text-right space-y-1">
                    <div className="text-xs font-semibold text-slate-600 flex items-center justify-end gap-1 flex-wrap">
                      <span className="text-emerald-700">{twTime(a.checkInTime)} 報到</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-orange-700">{twTime(a.checkOutTime)} 簽退</span>
                    </div>
                    {isNew && <div className="text-[11px] font-black text-orange-700">剛剛簽退</div>}
                  </div>
                </li>
              );
            })}
          </Section>
        </>
      )}
    </div>
  );
};

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  emptyClass?: string;
  testId: string;
  children: React.ReactNode;
}> = ({ icon, title, count, empty, emptyClass = 'text-slate-400', testId, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" data-testid={testId}>
    <h3 className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-800 flex items-center gap-2">
      {icon}
      {title}
      <span className="text-xs font-semibold text-slate-400">{count} 位</span>
    </h3>
    {count === 0 ? (
      <p className={`px-4 py-6 text-center text-xs ${emptyClass}`}>{empty}</p>
    ) : (
      <ul className="divide-y divide-slate-100">{children}</ul>
    )}
  </section>
);

const PersonInfo: React.FC<{ a: CombinedAttendeeView }> = ({ a }) => (
  <div className="flex items-center gap-3 min-w-0 flex-1">
    <span className="shrink-0 w-10 text-center font-mono font-black text-slate-500 text-sm">
      {a.serialNo !== undefined ? `#${a.serialNo}` : '—'}
    </span>
    <div className="min-w-0">
      <div className="font-bold text-slate-900 text-base flex items-center gap-1.5">
        <span className="truncate">{a.name}</span>
        {a.isWalkIn && <span className="shrink-0 text-[10px] bg-amber-100 text-amber-800 px-1.5 rounded font-semibold">現場追加</span>}
      </div>
      <div className="text-xs text-slate-500 truncate">
        {[a.title, a.department].filter(Boolean).join('／') || '—'}
      </div>
    </div>
  </div>
);
