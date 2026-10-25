import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { RotateCcw, PenTool, Check, Eraser } from 'lucide-react';

export interface SignaturePadHandle {
  clear: () => void;
  getDataUrl: () => string;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  onSignatureChange?: (isEmpty: boolean) => void;
  height?: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ onSignatureChange, height = 200 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [penColor, setPenColor] = useState('#0f172a');
    const [penWidth, setPenWidth] = useState(3.5);

    // Setup canvas resolution and DPI
    const setupCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Only resize if different to avoid clearing existing strokes on re-renders
      const displayWidth = rect.width;
      const displayHeight = height;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        // Save current contents if any
        let tempCanvas: HTMLCanvasElement | null = null;
        if (canvas.width > 0 && canvas.height > 0) {
          tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) tempCtx.drawImage(canvas, 0, 0);
        }

        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, displayWidth, displayHeight);

          if (tempCanvas) {
            ctx.drawImage(tempCanvas, 0, 0, displayWidth, displayHeight);
          }
        }
      }
    };

    useEffect(() => {
      setupCanvas();
      const handleResize = () => setupCanvas();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [height]);

    // Imperative API
    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        setHasDrawn(false);
        onSignatureChange?.(true);
      },
      getDataUrl: () => {
        const canvas = canvasRef.current;
        if (!canvas) return '';
        // High-quality compressed JPEG for lightweight cloud sync
        return canvas.toDataURL('image/jpeg', 0.8);
      },
      isEmpty: () => !hasDrawn
    }));

    const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { x, y } = getCanvasCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = penWidth;
      ctx.strokeStyle = penColor;

      setIsDrawing(true);
      if (!hasDrawn) {
        setHasDrawn(true);
        onSignatureChange?.(false);
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { x, y } = getCanvasCoordinates(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isDrawing) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setIsDrawing(false);
      }
    };

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      setHasDrawn(false);
      onSignatureChange?.(true);
    };

    const colors = [
      { id: '#0f172a', name: '深黑色', bg: 'bg-slate-900' },
      { id: '#1d4ed8', name: '正式藍', bg: 'bg-blue-700' },
      { id: '#047857', name: '深綠色', bg: 'bg-emerald-700' }
    ];

    const widths = [
      { value: 2, label: '細' },
      { value: 3.5, label: '適中' },
      { value: 5, label: '粗' }
    ];

    return (
      <div className="w-full select-none">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
            <PenTool className="w-4 h-4 text-blue-600" />
            <span>參加人員手寫簽署區</span>
            <span className="text-xs text-rose-500 font-semibold">*必填</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Color buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {colors.map(c => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setPenColor(c.id)}
                  className={`w-5 h-5 rounded-full ${c.bg} transition-all ${
                    penColor === c.id ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                  title={c.name}
                />
              ))}
            </div>

            {/* Width buttons */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              {widths.map(w => (
                <button
                  type="button"
                  key={w.value}
                  onClick={() => setPenWidth(w.value)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                    penWidth === w.value ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>

            {/* Clear Button */}
            <button
              type="button"
              onClick={clearCanvas}
              disabled={!hasDrawn}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                hasDrawn
                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新簽名</span>
            </button>
          </div>
        </div>

        {/* Drawing Canvas Area */}
        <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white shadow-inner focus-within:border-blue-500 transition-colors">
          <canvas
            ref={canvasRef}
            style={{ height: `${height}px`, touchAction: 'none' }}
            className="w-full block cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Guide Watermark when empty */}
          {!hasDrawn && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400 select-none">
              <p className="text-base font-medium text-slate-400">請使用手指、觸控筆或滑鼠在此處簽名</p>
              <p className="text-xs text-slate-400 mt-1">Sign Here</p>
            </div>
          )}

          {/* Signature Guideline */}
          <div className="pointer-events-none absolute bottom-7 left-8 right-8 border-b border-slate-200 border-dashed flex justify-between items-center text-[11px] text-slate-300 pb-1">
            <span>簽名基準線 (Signature Line)</span>
            <span>✕ 請簽於上方</span>
          </div>

          {hasDrawn && (
            <div className="absolute top-2 right-2 bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shadow-xs">
              <Check className="w-3 h-3" />
              <span>已簽署</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
          <span>支援手機/平板觸控螢幕手寫或電腦滑鼠筆跡</span>
          <span className="text-slate-400">{hasDrawn ? '✓ 筆跡已記錄' : '待簽名'}</span>
        </p>
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';
