import React, { useState, useRef } from 'react';
import { RegisteredParticipant } from '../types';
import { parseSpreadsheet, downloadSampleRoster } from '../utils/excel';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Plus,
  X,
  Users,
  CheckSquare
} from 'lucide-react';

interface FileUploaderProps {
  onImport: (
    newParticipants: RegisteredParticipant[],
    mode: 'replace' | 'append',
    selectedCompletionColumns?: string[],
    availableColumns?: string[]
  ) => void;
  currentCount: number;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onImport, currentCount }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsedResult, setParsedResult] = useState<{
    participants: RegisteredParticipant[];
    rawRowsCount: number;
    availableColumns: string[];
    recognizedColumns: { nameCol?: string; titleCol?: string; deptCol?: string };
    fileName: string;
  } | null>(null);
  const [selectedCompletionColumns, setSelectedCompletionColumns] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = async (file: File) => {
    setErrorMessage('');
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => lowerName.endsWith(ext));

    if (!isValid) {
      setErrorMessage('請上傳格式為 .xlsx、.xls 或 .csv 之試算表檔案');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const result = parseSpreadsheet(buffer);

      if (result.participants.length === 0) {
        setErrorMessage('檔案中未讀取到有效學員資料，請確認第一列是否有包含「姓名」與「職稱」欄位');
        return;
      }

      setParsedResult({
        ...result,
        fileName: file.name
      });

      // Default select columns for completion screen (exclude name)
      const nonNameCols = (result.availableColumns || []).filter(c => {
        const lower = c.trim().toLowerCase();
        return lower !== '姓名' && lower !== 'name' && lower !== '序號' && lower !== 'id';
      });
      setSelectedCompletionColumns(nonNameCols.length > 0 ? nonNameCols : ['職稱', '部門', '電話']);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`檔案解析失敗: ${err.message || '格式錯誤'}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleConfirmImport = () => {
    if (!parsedResult) return;
    onImport(
      parsedResult.participants,
      importMode,
      selectedCompletionColumns,
      parsedResult.availableColumns
    );
    setParsedResult(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <span>上傳預先報名人員名冊 (Excel / CSV)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            上傳活動前已報名之人員清冊（欄位自動識別：職稱、姓名、部門等）
          </p>
        </div>

        {/* Download Sample Template buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">範本下載：</span>
          <button
            type="button"
            onClick={() => downloadSampleRoster('excel')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel 範本</span>
          </button>
          <button
            type="button"
            onClick={() => downloadSampleRoster('csv')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CSV 範本</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      {!parsedResult && (
        <div
          onDragOver={e => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>

          <h4 className="text-sm font-bold text-slate-800">
            點擊此處或拖曳 Excel / CSV 檔案上傳
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            支援 .xlsx, .xls, .csv 檔案格式。請確保第一列標題包含「姓名」與「職稱」欄位
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="bg-slate-100 px-2 py-0.5 rounded">目前名冊已有 {currentCount} 人</span>
            <span>·</span>
            <span>系統會自動智慧配對各欄位</span>
          </div>
        </div>
      )}

      {/* Parsing Preview Stage */}
      {parsedResult && (
        <div className="border border-blue-200 bg-blue-50/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  成功解析檔案：{parsedResult.fileName}
                </h4>
                <p className="text-xs text-slate-600">
                  共讀取到 <span className="font-bold text-blue-700">{parsedResult.participants.length}</span> 位人員資料
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setParsedResult(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Recognized Columns Tag */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center gap-3">
            <span className="text-slate-500 font-medium">識別欄位：</span>
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold border border-emerald-200">
              姓名: {parsedResult.recognizedColumns.nameCol || '自動辨別'}
            </span>
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-200">
              職稱: {parsedResult.recognizedColumns.titleCol || '未提供'}
            </span>
            {parsedResult.recognizedColumns.deptCol && (
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                部門: {parsedResult.recognizedColumns.deptCol}
              </span>
            )}
          </div>

          {/* Preview Table (First 4 rows) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 flex justify-between">
              <span>名冊前 4 筆預覽</span>
              <span>共 {parsedResult.participants.length} 筆</span>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {parsedResult.participants.slice(0, 4).map((p, idx) => (
                <div key={idx} className="px-3.5 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-slate-400 font-mono text-[11px]">#{idx + 1}</span>
                    <span className="font-bold text-slate-800">{p.name}</span>
                    <span className="text-slate-500">{p.title}</span>
                  </div>
                  {p.department && (
                    <span className="text-slate-400 text-[11px] bg-slate-50 px-2 py-0.5 rounded">
                      {p.department}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* User Request 1: Checkboxes to select which columns to display on completion screen (附件1) */}
          <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200/80 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>勾選要在「學員報到手續完成（附件1）」畫面呈現的名冊欄位：</span>
              </div>
              <span className="text-[11px] font-semibold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 self-start sm:self-auto">
                已選取 {selectedCompletionColumns.length} 項欄位
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              匯入名冊後，學員在手寫簽到完成時，系統彈窗將自動呈現所勾選的欄位內容（如職稱、單位、電話、座位、分組、餐點、備註等），利於學員知悉活動訊息。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(parsedResult.availableColumns || []).filter(c => !['姓名', 'name', 'id', '序號'].includes(c.toLowerCase())).map(col => {
                const isChecked = selectedCompletionColumns.includes(col);
                return (
                  <label
                    key={col}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors border ${
                      isChecked
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedCompletionColumns([...selectedCompletionColumns, col]);
                        } else {
                          setSelectedCompletionColumns(selectedCompletionColumns.filter(c => c !== col));
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>{col}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Import Mode Options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-blue-600"
                />
                <span>替換覆蓋目前名冊 ({currentCount} 人)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="text-blue-600"
                />
                <span>追加合併至現有名冊</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setParsedResult(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>確認匯入 {parsedResult.participants.length} 人</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error notification */}
      {errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
