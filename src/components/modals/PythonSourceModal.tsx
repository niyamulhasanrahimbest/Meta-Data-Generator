import React, { useState } from 'react';
import { pythonProjectFiles } from '../../data/pythonSourceCode';
import { Download, Copy, Check, Code, X, FileCode, FolderArchive, Terminal } from 'lucide-react';
import JSZip from 'jszip';

interface PythonSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PythonSourceModal: React.FC<PythonSourceModalProps> = ({ isOpen, onClose }) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const currentFile = pythonProjectFiles[activeFileIndex];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    try {
      setDownloading(true);
      const zip = new JSZip();
      const folder = zip.folder('MetaDataGenerator_Desktop');

      pythonProjectFiles.forEach((file) => {
        folder?.file(file.filename, file.code);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'MetaDataGenerator_Python_Desktop.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create zip:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-[#0e1620] border border-[#1e3042] rounded-xl w-full max-w-5xl h-[88vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2e3e] bg-[#141f2c]">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Meta Data Generator - Complete Python (PyQt5) Desktop Application Source Code
              </h3>
              <p className="text-[11px] text-slate-400">
                1:1 Native Desktop Implementation • PyQt5 • CairoSVG • DSC Header & XMP Embedder • QThread
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-[#0f172a] font-bold text-xs px-3.5 py-1.5 rounded flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
            >
              <FolderArchive className="w-4 h-4" />
              {downloading ? 'Packing ZIP...' : 'Download Full Project (.zip)'}
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#1f2e40] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: File Tree */}
          <div className="w-64 border-r border-[#1e2e3e] bg-[#101923] flex flex-col">
            <div className="p-3 border-b border-[#1a2736] text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />
              Project Files
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {pythonProjectFiles.map((file, idx) => {
                const isActive = activeFileIndex === idx;
                return (
                  <button
                    key={file.filename}
                    onClick={() => setActiveFileIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#1b344e] text-[#38bdf8] font-bold border-l-2 border-[#38bdf8]'
                        : 'text-slate-300 hover:bg-[#152332]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{file.filename}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Windows Run Tip */}
            <div className="p-3 bg-[#0d141d] border-t border-[#1a2736] text-[11px] text-slate-400">
              <p className="font-semibold text-emerald-400">⚡ Quick Run (Windows):</p>
              <p className="font-mono text-[10px] mt-1 text-slate-300 bg-[#162230] p-1.5 rounded border border-[#233547]">
                pip install -r requirements.txt<br />
                python main.py
              </p>
            </div>
          </div>

          {/* Right Panel: File Preview & Copy */}
          <div className="flex-1 flex flex-col bg-[#0b1219] overflow-hidden">
            {/* File info bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2e3e] bg-[#131d27]">
              <div>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {currentFile.filename}
                </span>
                <span className="text-slate-400 text-xs ml-3 hidden sm:inline">
                  — {currentFile.description}
                </span>
              </div>

              <button
                onClick={handleCopy}
                className="bg-[#1b2b3c] hover:bg-[#25394f] text-slate-200 border border-[#2f4358] text-xs px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Copy File</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Content */}
            <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200 select-text">
              <pre className="whitespace-pre">{currentFile.code}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#121c27] border-t border-[#1e2e3e] flex items-center justify-between text-xs text-slate-400">
          <span>
            Meta Data Generator • Developed By Neimor Rahim • Adobe Illustrator EPS 10 & EXIF Native Support
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1 rounded bg-[#1e2e3e] hover:bg-[#273a4e] text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
