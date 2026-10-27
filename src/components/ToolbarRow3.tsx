import React, { useRef } from 'react';
import { MarketplacePreset } from '../utils/csvExporter';
import { ModeType, ThemeType } from '../types';
import { Trash2, Pause, Play } from 'lucide-react';

interface ToolbarRow3Props {
  mode: ModeType;
  theme?: ThemeType;
  onSelectVectors: (files: FileList | null) => void;
  onSelectFolder: (files: FileList | null) => void;
  onStart: () => void;
  onPause?: () => void;
  onResume: () => void;
  onRetry: () => void;
  onClear: () => void;
  isPaused?: boolean;
  selectedCount?: number;
  onDeleteSelected?: () => void;
  marketplace: MarketplacePreset;
  setMarketplace: (m: MarketplacePreset) => void;
  onExportCsv: () => void;
  onRenameFiles: () => void;
  onCleanFilenames: () => void;
  onEmbedMetadata: () => void;
  onEmbedVector: () => void;
  onPsEmbed: () => void;
  isProcessing: boolean;
  onSelectNativeFiles?: (files: any[]) => void;
}

export const ToolbarRow3: React.FC<ToolbarRow3Props> = ({
  mode,
  theme = 'Dark',
  onSelectVectors,
  onSelectFolder,
  onStart,
  onPause,
  onResume,
  onRetry,
  onClear,
  isPaused = false,
  selectedCount = 0,
  onDeleteSelected,
  marketplace,
  setMarketplace,
  onExportCsv,
  onRenameFiles,
  onCleanFilenames,
  onEmbedMetadata,
  onEmbedVector,
  onPsEmbed,
  isProcessing,
  onSelectNativeFiles
}) => {
  const isLight = theme === 'Light';
  const fieldsetBg = isLight ? 'border-slate-300 bg-white shadow-xs' : 'border-[#1e3042] bg-[#131f2b]/80';
  const legendColor = isLight ? 'text-black font-black' : 'text-[#8ba1b7] font-semibold';
  const defaultUtilBtn = isLight
    ? 'bg-white hover:bg-slate-100 text-black font-bold border-slate-300 shadow-2xs'
    : 'bg-[#182635] hover:bg-[#203144] text-slate-300 border-[#26374a]';

  const vectorInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Dynamic accepted extensions based on active Mode
  const getAcceptedExtensions = () => {
    switch (mode) {
      case 'Image':
        return '.jpeg,.png,.jpg,.webp,image/jpeg,image/png,image/webp';
      case 'Vector':
        return '.svg,.eps,.ai,image/svg+xml,application/postscript,application/illustrator';
      case 'Video':
        return '.mp4,.mov,.avi,.mkv,.webm,.wmv,.flv,.m4v,video/*';
      default:
        return '.svg,.eps,.ai';
    }
  };

  const getSelectButtonLabel = () => {
    switch (mode) {
      case 'Image':
        return 'SELECT IMAGES';
      case 'Vector':
        return 'SELECT VECTORS';
      case 'Video':
        return 'SELECT VIDEOS';
      default:
        return 'SELECT VECTORS';
    }
  };

  return (
    <div className="w-full flex items-center flex-nowrap gap-2 pt-1 select-none">
      {/* Hidden bulk file inputs */}
      <input
        type="file"
        ref={vectorInputRef}
        onChange={(e) => {
          onSelectVectors(e.target.files);
          e.target.value = '';
        }}
        multiple
        accept={getAcceptedExtensions()}
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={(e) => {
          onSelectFolder(e.target.files);
          e.target.value = '';
        }}
        // @ts-ignore
        webkitdirectory="true"
        directory=""
        multiple
        className="hidden"
      />

      {/* 1. Input Box */}
      <fieldset className={`border rounded px-2.5 py-1 flex flex-col justify-center shrink-0 transition-colors ${fieldsetBg}`}>
        <legend className={`text-[9.5px] uppercase px-1 ${legendColor}`}>
          Input
        </legend>
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              const bridge = (window as any).electronApi || (typeof (window as any).require === 'function' ? (window as any).electronApi : null);
              if (bridge?.selectFilesOrFolder) {
                const res = await bridge.selectFilesOrFolder(mode, false);
                if (!res.canceled && res.files?.length > 0 && onSelectNativeFiles) {
                  onSelectNativeFiles(res.files);
                  return;
                }
              }
              vectorInputRef.current?.click();
            }}
            title={`Bulk upload ${mode} files (${getAcceptedExtensions()})`}
            className={`${
              isLight ? 'bg-sky-700 hover:bg-sky-800 text-white shadow-xs' : 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm'
            } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95`}
          >
            {getSelectButtonLabel()}
          </button>
          <button
            onClick={async () => {
              const bridge = (window as any).electronApi || (typeof (window as any).require === 'function' ? (window as any).electronApi : null);
              if (bridge?.selectFilesOrFolder) {
                const res = await bridge.selectFilesOrFolder(mode, true);
                if (!res.canceled && res.files?.length > 0 && onSelectNativeFiles) {
                  onSelectNativeFiles(res.files);
                  return;
                }
              }
              folderInputRef.current?.click();
            }}
            title={`Bulk select folder for ${mode} files`}
            className={`${
              isLight ? 'bg-sky-700 hover:bg-sky-800 text-white shadow-xs' : 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm'
            } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95`}
          >
            SELECT FOLDER
          </button>
        </div>
      </fieldset>

      {/* 2. Processing Box */}
      <fieldset className={`border rounded px-2.5 py-1 flex flex-col justify-center shrink-0 transition-colors ${fieldsetBg}`}>
        <legend className={`text-[9.5px] uppercase px-1 ${legendColor}`}>
          Processing
        </legend>
        <div className="flex items-center gap-1.5">
          {/* Start or Pause Button */}
          {isProcessing ? (
            <button
              onClick={onPause}
              className={`${
                isLight
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  : 'bg-[#f59e0b] hover:bg-[#d97706] text-[#0f172a] shadow-sm'
              } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95 flex items-center gap-1.5`}
              title="Pause processing"
            >
              <Pause className="w-3 h-3 fill-current" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              className={`${
                isLight
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-[#22c55e] hover:bg-[#16a34a] text-[#0f172a] shadow-sm'
              } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95 flex items-center gap-1.5`}
              title="Start processing all pending items"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Start</span>
            </button>
          )}

          {/* Resume Button */}
          <button
            onClick={onResume}
            disabled={isProcessing}
            className={`${
              isProcessing
                ? 'opacity-40 cursor-not-allowed bg-slate-700 text-slate-400'
                : isPaused
                ? isLight
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-400/50'
                  : 'bg-[#22c55e] hover:bg-[#16a34a] text-[#0f172a] shadow-md ring-2 ring-[#22c55e]/50'
                : isLight
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
                : 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-sm'
            } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95 flex items-center gap-1`}
            title={isProcessing ? 'Processing is running (click Pause to pause)' : 'Resume processing from current progress'}
          >
            <span>Resume</span>
          </button>

          <button
            onClick={onRetry}
            className={`${
              isLight ? 'bg-sky-700 hover:bg-sky-800 text-white shadow-xs' : 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sm'
            } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95`}
          >
            Retry
          </button>

          {selectedCount > 0 && onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className={`${
                isLight ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs' : 'bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-sm'
              } text-[11px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer active:scale-95 flex items-center gap-1`}
              title={`Delete ${selectedCount} selected file${selectedCount > 1 ? 's' : ''} from queue`}
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete ({selectedCount})</span>
            </button>
          )}

          <button
            onClick={onClear}
            title="Clear all files from queue"
            className={`${
              isLight ? 'bg-slate-600 hover:bg-slate-700 text-white shadow-xs' : 'bg-[#334155] hover:bg-[#475569] text-slate-200 shadow-sm'
            } text-[11px] font-bold px-3 py-1 rounded transition-all cursor-pointer active:scale-95`}
          >
            Clear All
          </button>
        </div>
      </fieldset>

      {/* 3. Export Box */}
      <fieldset className={`border rounded px-2.5 py-1 flex flex-col justify-center shrink-0 transition-colors ${fieldsetBg}`}>
        <legend className={`text-[9.5px] uppercase px-1 ${legendColor}`}>
          Export
        </legend>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className={`text-[10.5px] font-bold ${isLight ? 'text-black' : 'text-[#94a3b8]'}`}>Marketplace:</span>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as MarketplacePreset)}
              className={`${
                isLight ? 'bg-white text-black font-bold border-slate-300 shadow-2xs' : 'bg-[#182635] text-slate-200 border-[#26374a]'
              } border rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer`}
            >
              <option value="All Marketplace">All Marketplace</option>
              <option value="Adobe Stock">Adobe Stock</option>
              <option value="Shutterstock">Shutterstock</option>
              <option value="Freepik">Freepik</option>
              <option value="Vecteezy">Vecteezy</option>
              <option value="Etsy">Etsy</option>
            </select>
          </div>

          <button
            onClick={onExportCsv}
            className={`${
              isLight ? 'bg-teal-700 hover:bg-teal-800 text-white shadow-xs' : 'bg-[#0e7490] hover:bg-[#155e75] text-white shadow-sm'
            } text-[11px] font-semibold px-3 py-1 rounded transition-all cursor-pointer active:scale-95`}
          >
            Export CSV
          </button>
        </div>
      </fieldset>

      {/* 4. Utilities Box */}
      <fieldset className={`border rounded px-2.5 py-1 flex flex-col justify-center flex-1 min-w-[420px] transition-colors ${fieldsetBg}`}>
        <legend className={`text-[9.5px] uppercase px-1 ${legendColor}`}>
          Utilities
        </legend>
        <div className="flex items-center justify-between gap-1.5 w-full">
          <button
            onClick={onRenameFiles}
            className={`flex-1 text-center border text-[11px] font-medium py-1 px-1 rounded transition-colors cursor-pointer whitespace-nowrap ${defaultUtilBtn}`}
          >
            Rename Files
          </button>

          <button
            onClick={onCleanFilenames}
            className={`flex-1 text-center ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100/90 text-amber-900 border-amber-400 font-semibold shadow-2xs'
                : 'bg-[#182635] hover:bg-[#203144] text-[#f59e0b] border-[#f59e0b]'
            } border text-[11px] font-medium py-1 px-1 rounded transition-colors cursor-pointer shadow-sm whitespace-nowrap`}
          >
            Clean Filenames
          </button>

          <button
            onClick={onEmbedMetadata}
            className={`flex-1 text-center border text-[11px] font-medium py-1 px-1 rounded transition-colors cursor-pointer whitespace-nowrap ${defaultUtilBtn}`}
          >
            Embed Metadata
          </button>

          <button
            onClick={onEmbedVector}
            className={`flex-1 text-center ${
              isLight
                ? 'bg-cyan-50 hover:bg-cyan-100/90 text-cyan-900 border-cyan-500 font-semibold shadow-2xs'
                : 'bg-[#182635] hover:bg-[#203144] text-[#06b6d4] border-[#06b6d4]'
            } border text-[11px] font-medium py-1 px-1 rounded transition-colors cursor-pointer shadow-sm whitespace-nowrap`}
          >
            Embed Vector
          </button>

          <button
            onClick={onPsEmbed}
            className={`flex-1 text-center border text-[11px] font-medium py-1 px-1 rounded transition-colors cursor-pointer whitespace-nowrap ${defaultUtilBtn}`}
          >
            P.S Embed imac
          </button>
        </div>
      </fieldset>
    </div>
  );
};
