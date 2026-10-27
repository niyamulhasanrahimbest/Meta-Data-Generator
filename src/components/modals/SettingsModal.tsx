import React, { useState } from 'react';
import { Settings as SettingsIcon, X, Sliders, Cpu, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [concurrency, setConcurrency] = useState(4);
  const [cooldown429, setCooldown429] = useState(2);
  const [epsProfile, setEpsProfile] = useState('Adobe Illustrator CS6+ (EPS 10)');
  const [autoSaveHistory, setAutoSaveHistory] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101923] border border-[#1e3042] rounded-lg w-full max-w-lg shadow-2xl text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2e3e] bg-[#162230]">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-[#38bdf8]" />
            <h3 className="font-bold text-sm text-white">Application Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#1f2e40] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Threading */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              Batch Worker Concurrency (Threads): {concurrency}
            </label>
            <input
              type="range"
              min={1}
              max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full accent-[#22c55e] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1 (Safe / Slow)</span>
              <span>4 (Recommended)</span>
              <span>8 (High Throughput)</span>
            </div>
          </div>

          {/* Rate Limit Retry Delay */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              429 Rate Limit Retry Cooldown (Seconds)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={cooldown429}
              onChange={(e) => setCooldown429(Number(e.target.value))}
              className="w-full bg-[#182635] border border-[#2a3c50] rounded px-3 py-1.5 text-slate-100 outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Cooldown period when Groq/Gemini API returns a 429 quota exhaustion.
            </p>
          </div>

          {/* EPS 10 Profile */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              EPS PostScript Level / Profile
            </label>
            <select
              value={epsProfile}
              onChange={(e) => setEpsProfile(e.target.value)}
              className="w-full bg-[#182635] border border-[#2a3c50] rounded px-3 py-1.5 text-slate-100 outline-none cursor-pointer"
            >
              <option value="Adobe Illustrator CS6+ (EPS 10)">Adobe Illustrator CS6+ (EPS 10 - Microstock Standard)</option>
              <option value="EPS Level 2 (Legacy)">EPS Level 2 (Legacy Stock Compatibility)</option>
              <option value="PostScript Level 3 (Full Colorspace)">PostScript Level 3 (Full Colorspace)</option>
            </select>
          </div>

          {/* Auto save */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="chkAutoSave"
              checked={autoSaveHistory}
              onChange={(e) => setAutoSaveHistory(e.target.checked)}
              className="accent-[#0284c7] w-4 h-4 rounded cursor-pointer"
            />
            <label htmlFor="chkAutoSave" className="text-slate-300 cursor-pointer">
              Automatically backup metadata history to local database
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1e2e3e] bg-[#141e2a]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#22c55e] hover:bg-[#16a34a] text-[#0f172a] font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};
