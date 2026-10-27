import React from 'react';
import { ModeType, ThemeType, GenerationOptions } from '../types';
import { AlertTriangle, Settings, MessageSquare } from 'lucide-react';

interface ToolbarRow2Props {
  mode: ModeType;
  setMode: (m: ModeType) => void;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onOpenSettings: () => void;
  onOpenContact: () => void;
}

export const ToolbarRow2: React.FC<ToolbarRow2Props> = ({
  mode,
  setMode,
  theme,
  setTheme,
  options,
  setOptions,
  onOpenSettings,
  onOpenContact
}) => {
  const isLight = theme === 'Light';
  const fieldsetBg = isLight ? 'border-slate-300 bg-white shadow-xs' : 'border-[#1e3042] bg-[#131f2b]/80';
  const legendColor = isLight ? 'text-black font-black' : 'text-[#8ba1b7] font-semibold';
  const defaultBtnBg = isLight ? 'bg-slate-100 text-black font-bold hover:bg-slate-200 border-slate-300' : 'bg-[#182635] text-slate-300 hover:bg-[#203144] border-[#26374a]';

  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {/* 1. Mode Box (Image, Vector, Video) */}
      <fieldset className={`border rounded px-2.5 py-1.5 flex flex-col justify-center transition-colors ${fieldsetBg}`}>
        <legend className={`text-[10px] uppercase px-1 ${legendColor}`}>
          Mode
        </legend>
        <div className="flex items-center gap-1">
          {(['Image', 'Vector', 'Video'] as ModeType[]).map((m) => {
            const isActive = mode === m;

            let btnStyle = defaultBtnBg + ' border';
            if (isActive) {
              btnStyle = isLight
                ? 'bg-emerald-600 text-white font-bold shadow-xs border-transparent'
                : 'bg-[#22c55e] text-[#0a1a12] font-bold shadow-[0_0_10px_rgba(34,197,94,0.3)] border-transparent';
            }

            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-xs px-2.5 py-1 rounded transition-all cursor-pointer ${btnStyle}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 2. Theme Box (Dark, Light) */}
      <fieldset className={`border rounded px-2.5 py-1.5 flex flex-col justify-center transition-colors ${fieldsetBg}`}>
        <legend className={`text-[10px] uppercase px-1 ${legendColor}`}>
          Theme
        </legend>
        <div className="flex items-center gap-1">
          {(['Dark', 'Light'] as ThemeType[]).map((t) => {
            const isActive = theme === t;
            let themeBtnStyle = defaultBtnBg + ' border';
            if (isActive) {
              themeBtnStyle = isLight
                ? 'bg-sky-700 text-white font-bold border-sky-700 shadow-xs'
                : 'bg-[#0f172a] text-white font-semibold border-[#38bdf8]/40 shadow-inner';
            }

            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${themeBtnStyle}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 3. Generation Options Box */}
      <fieldset className={`border rounded px-3 py-1.5 flex flex-col justify-center flex-1 min-w-[340px] transition-colors ${fieldsetBg}`}>
        <legend className={`text-[10px] uppercase px-1 ${legendColor}`}>
          Generation Options
        </legend>
        <div className="flex items-center flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.description}
              onChange={(e) => setOptions((prev) => ({ ...prev, description: e.target.checked }))}
              className="accent-[#0284c7] w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className={isLight ? 'text-sky-800 font-bold' : 'text-[#38bdf8] font-medium'}>
              Description
            </span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.filenameHint}
              onChange={(e) => setOptions((prev) => ({ ...prev, filenameHint: e.target.checked }))}
              className="accent-[#22c55e] w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className={isLight ? 'text-emerald-800 font-bold' : 'text-[#4ade80] font-medium'}>
              Filename Hint
            </span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.autoEmbed}
              onChange={(e) => setOptions((prev) => ({ ...prev, autoEmbed: e.target.checked }))}
              className="accent-[#f59e0b] w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span className={`${isLight ? 'text-amber-800' : 'text-amber-400'} font-bold flex items-center gap-1`}>
              Auto Embed
              <AlertTriangle className={`w-3 h-3 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />
            </span>
          </label>

          <label className={`flex items-center gap-1.5 cursor-pointer select-none ${isLight ? 'text-black font-semibold' : 'text-slate-400 hover:text-slate-300'}`}>
            <input
              type="checkbox"
              checked={options.pngIsolated}
              onChange={(e) => setOptions((prev) => ({ ...prev, pngIsolated: e.target.checked }))}
              className="accent-slate-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span>PNG Isolated</span>
          </label>

          <label className={`flex items-center gap-1.5 cursor-pointer select-none ${isLight ? 'text-black font-semibold' : 'text-slate-400 hover:text-slate-300'}`}>
            <input
              type="checkbox"
              checked={options.refinePngBg}
              onChange={(e) => setOptions((prev) => ({ ...prev, refinePngBg: e.target.checked }))}
              className="accent-slate-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span>Refine PNG BG</span>
          </label>
        </div>
      </fieldset>

      {/* 4. Application Box */}
      <fieldset className={`border rounded px-2.5 py-1.5 flex flex-col justify-center transition-colors ${fieldsetBg}`}>
        <legend className={`text-[10px] uppercase px-1 ${legendColor}`}>
          Application
        </legend>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            className={`border text-xs px-3 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${defaultBtnBg}`}
          >
            <Settings className="w-3 h-3 text-slate-400" />
            Settings
          </button>
          <button
            onClick={onOpenContact}
            className={`border text-xs px-3 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${defaultBtnBg}`}
          >
            <MessageSquare className="w-3 h-3 text-slate-400" />
            Contact
          </button>
        </div>
      </fieldset>
    </div>
  );
};
