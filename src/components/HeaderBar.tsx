import React from 'react';
import { ProviderType, ThemeType } from '../types';
import { Key, AlertTriangle } from 'lucide-react';
import { getModelsForProvider } from '../data/providerModels';
import { APP_LOGO_SRC } from '../data/logoAsset';

interface HeaderBarProps {
  provider: ProviderType;
  setProvider: (p: ProviderType) => void;
  currentModel?: string;
  onModelChange?: (model: string) => void;
  hasApiKey: boolean;
  theme?: ThemeType;
  onOpenManageKeys: () => void;
  onOpenGetKey?: () => void;
  onTestApi?: () => void;
  onOpenPythonSource?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  provider,
  setProvider,
  currentModel,
  onModelChange,
  hasApiKey,
  theme = 'Dark',
  onOpenManageKeys
}) => {
  const isLight = theme === 'Light';
  return (
    <header className={`flex flex-wrap items-center justify-between gap-4 pb-2 border-b transition-colors ${isLight ? 'border-slate-300' : 'border-[#1e2e3e]'}`}>
      {/* Left: Logo & Developer Info */}
      <div className="flex items-center gap-3">
        {/* Official Meta Data Generator Logo */}
        <div className="relative w-11 h-11 flex items-center justify-center shrink-0 rounded-xl overflow-hidden bg-white/5 p-0.5 border border-white/10 shadow-sm">
          <img
            src={APP_LOGO_SRC}
            alt="Meta Data Generator Logo"
            className="w-full h-full object-contain drop-shadow"
          />
        </div>

        <div>
          <h1 className={`text-2xl font-black tracking-tight leading-none ${isLight ? 'text-black' : 'text-white'}`}>
            Meta Data Generator
          </h1>
          <p className={`text-[11px] font-bold tracking-wide mt-1 ${isLight ? 'text-black' : 'text-[#7dd3fc]'}`}>
            Developed By Neimor Rahim
          </p>
        </div>
      </div>

      {/* Right Controls: Provider, API Status, Action Buttons */}
      <div className="flex items-center flex-wrap gap-2.5 text-xs">
        {/* Provider dropdown */}
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${isLight ? 'text-black' : 'text-[#94a3b8]'}`}>Provider:</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderType)}
            className={`${
              isLight
                ? 'bg-white text-black border-slate-300 hover:bg-slate-50 shadow-2xs font-bold'
                : 'bg-[#172331] text-slate-200 border-[#2a3c50] hover:bg-[#1c2b3d] font-medium'
            } border rounded px-2.5 py-1 text-xs outline-none focus:border-[#0284c7] cursor-pointer transition-colors`}
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="claude">Claude</option>
            <option value="groq">Groq</option>
            <option value="mistral">Mistral AI</option>
          </select>
        </div>

        {/* Model dropdown */}
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${isLight ? 'text-black' : 'text-[#94a3b8]'}`}>Model:</span>
          <select
            value={currentModel}
            onChange={(e) => onModelChange?.(e.target.value)}
            className={`${
              isLight
                ? 'bg-white text-black border-slate-300 hover:bg-slate-50 shadow-2xs font-semibold'
                : 'bg-[#172331] text-slate-200 border-[#2a3c50] hover:bg-[#1c2b3d] font-medium'
            } border rounded px-2 py-1 text-xs outline-none focus:border-[#0284c7] cursor-pointer transition-colors max-w-[190px] truncate`}
          >
            {getModelsForProvider(provider).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* API Key Status */}
        <div className="flex items-center gap-1.5 px-1 py-0.5">
          <span className={`font-bold ${isLight ? 'text-black' : 'text-[#cbd5e1]'}`}>API Key:</span>
          {hasApiKey ? (
            <span className={`${isLight ? 'text-emerald-700' : 'text-[#22c55e]'} font-bold flex items-center gap-1.5`}>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-xs bg-[#16a34a] text-white text-[11px] font-bold shadow-xs">
                ✓
              </span>
              <span>Ready</span>
            </span>
          ) : (
            <span className={`${isLight ? 'text-amber-800' : 'text-[#f59e0b]'} font-bold flex items-center gap-1`}>
              <AlertTriangle className={`w-3.5 h-3.5 ${isLight ? 'text-amber-700' : 'text-[#f59e0b]'}`} />
              <span>Not Set</span>
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <button
          onClick={onOpenManageKeys}
          className={`${
            isLight
              ? 'bg-white hover:bg-slate-100 text-black font-bold border-slate-300 shadow-xs'
              : 'bg-[#162230] hover:bg-[#1e2f42] text-slate-200 font-medium border-[#2c3e53]'
          } border px-3 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1`}
        >
          <Key className="w-3 h-3 text-[#38bdf8]" />
          Manage Keys
        </button>
      </div>
    </header>
  );
};
