import React, { useState } from 'react';
import { X, Edit3 } from 'lucide-react';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (prefix: string, startNum: number) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onApply }) => {
  const [prefix, setPrefix] = useState('Vector_Asset_');
  const [startNum, setStartNum] = useState(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101923] border border-[#1e3042] rounded-lg w-full max-w-sm shadow-2xl text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2e3e] bg-[#162230]">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#38bdf8]" />
            <h3 className="font-bold text-sm text-white">Batch Rename Files</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Prefix / Pattern</label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="w-full bg-[#182635] border border-[#2a3c50] rounded px-3 py-1.5 text-slate-100 outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Starting Number</label>
            <input
              type="number"
              value={startNum}
              onChange={(e) => setStartNum(Number(e.target.value))}
              className="w-full bg-[#182635] border border-[#2a3c50] rounded px-3 py-1.5 text-slate-100 outline-none"
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Preview: <span className="font-mono text-emerald-400">{prefix}{String(startNum).padStart(4, '0')}.svg</span>
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#1e2e3e] bg-[#141e2a]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[#2a3c50] text-xs text-slate-300 hover:bg-[#1a2938] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApply(prefix, startNum);
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs cursor-pointer shadow-sm"
          >
            Rename All
          </button>
        </div>
      </div>
    </div>
  );
};
