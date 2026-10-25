import React, { useState } from 'react';
import { CombinedAttendeeView, EventInfo } from '../types';
import { Printer, Download, X, Sliders, CheckSquare, Square } from 'lucide-react';

interface PrintableViewProps {
  eventInfo: EventInfo;
  attendees: CombinedAttendeeView[];
  onClose: () => void;
}

export const PrintableView: React.FC<PrintableViewProps> = ({
  eventInfo,
  attendees,
  onClose
}) => {
  const [showCheckInTime, setShowCheckInTime] = useState<boolean>(true);
  const [showCheckOutTime, setShowCheckOutTime] = useState<boolean>(true);
  const [showDuration, setShowDuration] = useState<boolean>(true);
  const [showCompTime, setShowCompTime] = useState<boolean>(true);
  const [showSignatures, setShowSignatures] = useState<boolean>(true);

  const handlePrint = () => {
    window.print();
  };

  const checkedInCount = attendees.filter(a => a.status === 'CHECKED_IN' || a.status === 'WALK_IN').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs p-4 sm:p-6 print:p-0 print:bg-white flex justify-center">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-6xl overflow-hidden my-auto print:border-none print:shadow-none print:w-full print:max-w-none">
        {/* Header / Action bar (hidden when printing) */}
        <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              簽到簽退名冊列印與存根預覽 (含電子簽章與補休時數)
            </h3>
            <p className="text-xs text-slate-500">
              可依機關存查需求自訂勾選是否列印「報到時間」、「簽退時間」或「補休時間」
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>立即列印 / 存為 PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Option Toggles Bar (hidden when printing) */}
        <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-700 print:hidden">
          <span className="font-bold text-blue-900 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>自訂列印欄位：</span>
          </span>

          <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-blue-700">
            <input
              type="checkbox"
              checked={showCheckInTime}
              onChange={e => setShowCheckInTime(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>列印「報到時間」</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-blue-700">
            <input
              type="checkbox"
              checked={showCheckOutTime}
              onChange={e => setShowCheckOutTime(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>列印「簽退時間」</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-blue-700">
            <input
              type="checkbox"
              checked={showDuration}
              onChange={e => setShowDuration(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>列印「參加時間」</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-blue-700">
            <input
              type="checkbox"
              checked={showCompTime}
              onChange={e => setShowCompTime(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>列印「路途時間」與「核予補休時間」</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-blue-700">
            <input
              type="checkbox"
              checked={showSignatures}
              onChange={e => setShowSignatures(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>列印「手寫簽名」</span>
          </label>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 sm:p-12 print:p-4 text-slate-900 bg-white">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="text-center">
              <span className="text-xs font-bold tracking-widest text-slate-500 uppercase">
                苗栗縣三義鄉公所 · 出席與簽到退正式存檔清冊
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">
                {eventInfo.title}
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500">日期：</span>
                <span className="font-semibold">{eventInfo.date}</span>
              </div>
              <div>
                <span className="text-slate-500">時間：</span>
                <span className="font-semibold">{eventInfo.time}</span>
              </div>
              <div>
                <span className="text-slate-500">地點：</span>
                <span className="font-semibold">{eventInfo.location}</span>
              </div>
              <div>
                <span className="text-slate-500">實到率：</span>
                <span className="font-bold text-blue-700">
                  {checkedInCount} / {attendees.length} 人
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 bg-slate-100 font-bold text-slate-800">
                <th className="py-2.5 px-2 w-10 text-center">項次</th>
                <th className="py-2.5 px-2 w-24">姓名</th>
                <th className="py-2.5 px-2 w-28">職稱</th>
                <th className="py-2.5 px-2 w-28">服務單位</th>
                <th className="py-2.5 px-2 w-20 text-center">狀態</th>
                {showCheckInTime && (
                  <th className="py-2.5 px-2 w-24 text-center">報到時間</th>
                )}
                {showCheckOutTime && (
                  <th className="py-2.5 px-2 w-24 text-center">簽退時間</th>
                )}
                {showDuration && (
                  <th className="py-2.5 px-2 w-24 text-center">參加時間</th>
                )}
                {showCompTime && (
                  <>
                    {eventInfo.showTravelTime !== false && (
                      <th className="py-2.5 px-2 w-20 text-center">路途時間</th>
                    )}
                    {eventInfo.showDeductionTime && (
                      <th className="py-2.5 px-2 w-20 text-center text-rose-800">扣除時間</th>
                    )}
                    <th className="py-2.5 px-2 w-24 text-center bg-indigo-50/50">
                      <div>核予補休時間</div>
                      <div className="text-[9px] font-normal text-indigo-700">
                        {eventInfo.showTravelTime !== false && eventInfo.showDeductionTime
                          ? '(參加+路途-扣除)'
                          : eventInfo.showTravelTime !== false
                          ? '(參加+路途)'
                          : eventInfo.showDeductionTime
                          ? '(參加-扣除)'
                          : '(同參加時間)'}
                      </div>
                    </th>
                  </>
                )}
                {showSignatures && (
                  <th className="py-2.5 px-3 text-center">簽到/簽退手寫簽名</th>
                )}
                <th className="py-2.5 px-2 w-20 text-center">簽到覆核</th>
                <th className="py-2.5 px-2 w-20 text-center">簽退覆核</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {attendees.map((a, index) => {
                const isDone = a.status === 'CHECKED_IN' || a.status === 'WALK_IN';
                return (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>
                    <td className="py-2 px-2 font-bold text-slate-900 text-sm">
                      {a.name}
                    </td>
                    <td className="py-2 px-2 text-slate-700 text-[11px]">
                      {a.title}
                    </td>
                    <td className="py-2 px-2 text-slate-600 text-[11px]">
                      {a.department || '—'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          a.status === 'CHECKED_IN'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : a.status === 'WALK_IN'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {a.status === 'CHECKED_IN'
                          ? '已報到'
                          : a.status === 'WALK_IN'
                          ? '現場追加'
                          : '未報到'}
                      </span>
                    </td>
                    {showCheckInTime && (
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                        {a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : '—'}
                      </td>
                    )}
                    {showCheckOutTime && (
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                        {a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' }) : isDone ? '未簽退' : '—'}
                      </td>
                    )}
                    {showDuration && (
                      <td className="py-2 px-2 text-center font-medium text-[11px] text-indigo-700">
                        {a.durationDisplay || (isDone ? '進行中' : '—')}
                      </td>
                    )}
                    {showCompTime && (
                      <>
                        {eventInfo.showTravelTime !== false && (
                          <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                            {a.travelDisplay || `${eventInfo.defaultTravelMinutes ?? 60}分鐘`}
                          </td>
                        )}
                        {eventInfo.showDeductionTime && (
                          <td className="py-2 px-2 text-center font-mono text-[11px] text-rose-700">
                            -{a.deductionDisplay || `${eventInfo.defaultDeductionMinutes ?? 60}分鐘`}
                          </td>
                        )}
                        <td className="py-2 px-2 text-center font-bold text-[11px] text-indigo-900 bg-indigo-50/30">
                          {a.compTimeDisplay || (a.durationDisplay ? a.durationDisplay : '—')}
                        </td>
                      </>
                    )}
                    {showSignatures && (
                      <td className="py-2 px-2 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {a.signatureDataUrl ? (
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] text-slate-400">簽到</span>
                              <img
                                src={a.signatureDataUrl}
                                alt={`${a.name} 簽名`}
                                className="h-8 max-w-[90px] object-contain border border-slate-200 rounded bg-white p-0.5"
                              />
                            </div>
                          ) : null}
                          {a.checkOutSignatureDataUrl ? (
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] text-slate-400">簽退</span>
                              <img
                                src={a.checkOutSignatureDataUrl}
                                alt={`${a.name} 簽退`}
                                className="h-8 max-w-[90px] object-contain border border-slate-200 rounded bg-white p-0.5"
                              />
                            </div>
                          ) : null}
                          {!a.signatureDataUrl && !a.checkOutSignatureDataUrl && (
                            <span className="text-slate-300 italic text-[11px]">未簽名</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="py-2 px-2 text-center">
                      {a.checkInHrVerified || a.hrVerified ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300">
                          已覆核
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-50 border border-slate-200">
                          未覆核
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {a.checkOutHrVerified ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300">
                          已覆核
                        </span>
                      ) : !a.checkOutTime ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-50 border border-slate-200">
                          未覆核
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer sign-off box */}
          <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
            <div>
              承辦人簽章：____________________ &nbsp;&nbsp;&nbsp;&nbsp; 人事單位覆核：____________________ &nbsp;&nbsp;&nbsp;&nbsp; 單位主管核閱：____________________
            </div>
            <div>
              列印時間：{new Date().toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
