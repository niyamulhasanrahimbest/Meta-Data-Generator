import React from 'react';
import { ProcessingStats, ThemeType } from '../types';
import { RefreshCw, Layers } from 'lucide-react';

interface StatusBarProps {
  stats: ProcessingStats;
  theme?: ThemeType;
  onRefresh: () => void;
  onOpenExtensions: () => void;
  isProcessing: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  stats,
  theme = 'Dark',
  onRefresh,
  onOpenExtensions,
  isProcessing
}) => {
  const isLight = theme === 'Light';
  const percentage = stats.selected > 0 ? Math.round((stats.processed / stats.selected) * 100) : 0;

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <footer className={`pt-2 flex flex-col gap-1.5 border-t select-none text-[11px] transition-colors ${
      isLight ? 'border-slate-300' : 'border-[#1e2e3e]'
    }`}>
      {/* Progress Info Header */}
      <div className="flex items-center justify-between">
        <span className={`${isLight ? 'text-emerald-700' : 'text-[#4ade80]'} font-semibold flex items-center gap-1.5 text-xs`}>
          {isProcessing ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-[#4ade80] animate-ping" />
              Processing... {stats.processed}/{stats.selected} files completed
            </>
          ) : stats.selected > 0 ? (
            `Processing... ${stats.processed}/${stats.selected} files completed`
          ) : (
            `Ready — 0 files in queue (Select files or folder to start)`
          )}
        </span>
        <span className={`${isLight ? 'text-black font-bold' : 'text-[#94a3b8]'} font-mono text-xs`}>
          {percentage}%
        </span>
      </div>

      {/* Thin Green Progress Bar */}
      <div className={`w-full rounded-full h-1.5 overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-[#1e293b]'}`}>
        <div
          className="bg-[#22c55e] h-full transition-all duration-300 relative shadow-[0_0_8px_rgba(34,197,94,0.5)]"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        >
          {percentage > 0 && percentage < 100 && (
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#38bdf8] rounded-full" />
          )}
        </div>
      </div>

      {/* Status Row 1: Selected / Processed / Remaining and Elapsed / Total */}
      <div className={`flex items-center justify-between py-0.5 ${isLight ? 'text-black font-medium' : 'text-[#cbd5e1]'}`}>
        <div className="flex items-center gap-3">
          <span>
            Selected: <strong className={isLight ? 'text-black font-black' : 'text-white'}>{stats.selected}</strong>
          </span>
          <span className={isLight ? 'text-slate-400' : 'text-[#475569]'}>|</span>
          <span>
            Processed: <strong className={isLight ? 'text-black font-black' : 'text-white'}>{stats.processed}/{stats.selected}</strong> ({percentage}%)
          </span>
          <span className={isLight ? 'text-slate-400' : 'text-[#475569]'}>|</span>
          <span>
            Remaining: <strong className={isLight ? 'text-black font-black' : 'text-white'}>{stats.remaining}</strong>
          </span>
        </div>

        <div className={`flex items-center gap-3 font-mono ${isLight ? 'text-black font-bold' : 'text-slate-300'}`}>
          <span>Elapsed: {formatTime(stats.elapsedSeconds)}</span>
          <span className={isLight ? 'text-slate-400' : 'text-[#475569]'}>|</span>
          <span>Total: {formatTime(stats.totalSeconds)}</span>
        </div>
      </div>

      {/* Status Row 2: Generation Statistics & License Information & Controls */}
      <div className={`flex flex-wrap items-center justify-between gap-3 pt-1 border-t ${
        isLight ? 'border-slate-200' : 'border-[#182635]'
      }`}>
        <div className="flex items-center flex-wrap gap-4 text-xs">
          {/* Generation Statistics */}
          <div className={`flex items-center gap-1.5 font-medium ${isLight ? 'text-black' : 'text-slate-200'}`}>
            <span className="text-base leading-none">📊</span>
            <span className={`font-black ${isLight ? 'text-black' : 'text-white'}`}>Generation Statistics:</span>
            <span>
              Last 24 Hours: <strong className={isLight ? 'text-black font-black' : 'text-white'}>{stats.last24Hours} files</strong>
            </span>
            <span className={isLight ? 'text-slate-400' : 'text-[#475569]'}>|</span>
            <span>
              All Time: <strong className={isLight ? 'text-black font-black' : 'text-white'}>{stats.allTime.toLocaleString()} files</strong>
            </span>
          </div>

          {/* License Information */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-base leading-none">🔍</span>
            <span className={`font-black ${isLight ? 'text-black' : 'text-white'}`}>License Information</span>
            <span className="text-[#16a34a] font-bold flex items-center gap-1">
              ✔ License Active
            </span>
            <span className={isLight ? 'text-slate-400' : 'text-[#475569]'}>◇</span>
            <span className={isLight ? 'text-black font-medium' : 'text-[#94a3b8]'}>
              Expires on: <span className={isLight ? 'text-black font-bold' : 'text-slate-200'}>{stats.licenseExpires}</span> ({stats.licenseDaysLeft} days left)
            </span>
          </div>
        </div>

        {/* Extensions & Refresh Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenExtensions}
            className={`${
              isLight
                ? 'bg-white hover:bg-slate-100 text-black font-bold border-slate-300 shadow-xs'
                : 'bg-[#182635] hover:bg-[#203144] text-slate-300 border-[#2c3e53]'
            } border px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1`}
          >
            <Layers className="w-3 h-3 text-slate-400" />
            Extensions
          </button>

          <button
            onClick={onRefresh}
            className="bg-[#0284c7] hover:bg-[#0369a1] text-white px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>
    </footer>
  );
};
