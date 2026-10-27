import React from 'react';
import { X, Layers, CheckCircle2, CloudUpload, Sparkles, FolderSync } from 'lucide-react';

interface ExtensionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExtensionsModal: React.FC<ExtensionsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const extensions = [
    {
      name: 'Adobe Illustrator Live Sync (CEP)',
      desc: 'Direct bridge plugin for Adobe Illustrator CC 2020-2026. Live metadata inspector inside panel.',
      status: 'Installed & Active',
      icon: Sparkles
    },
    {
      name: 'FTP / SFTP Microstock Auto-Uploader',
      desc: 'Automatically dispatches processed EPS/JPEG files to Adobe Stock, Shutterstock, and Freepik FTP server endpoints.',
      status: 'Ready',
      icon: CloudUpload
    },
    {
      name: 'Freepik CSV Sync & Tag Normalizer',
      desc: 'Removes forbidden copyright terms and formats tags precisely to Freepik 50-keyword taxonomy.',
      status: 'Active',
      icon: FolderSync
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101923] border border-[#1e3042] rounded-lg w-full max-w-lg shadow-2xl text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2e3e] bg-[#162230]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#38bdf8]" />
            <h3 className="font-bold text-sm text-white">Meta Master Extensions & Plugins</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#1f2e40] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {extensions.map((ext, idx) => {
            const Icon = ext.icon;
            return (
              <div
                key={idx}
                className="p-3 bg-[#152230] border border-[#233547] rounded-lg flex items-start gap-3"
              >
                <div className="p-2 rounded bg-[#1e2f42] text-[#38bdf8]">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white">{ext.name}</h4>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {ext.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{ext.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-[#1e2e3e] bg-[#141e2a] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold text-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
