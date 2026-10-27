import React, { useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { ThemeType } from '../../types';

/**
 * Synthesizes a clean, pleasant, harmonic "Done" completion chime using standard Web Audio API
 */
export function playDoneSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonic completion chime note 1 (D5 ~587.33Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.22, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonic completion chime note 2 (A5 ~880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.28, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.warn('Audio notice:', e);
  }
}

interface EmbeddingVectorProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  current: number;
  total: number;
  currentFilename: string;
  isComplete?: boolean;
  theme?: ThemeType;
  title?: string;
}

export const EmbeddingVectorProgressModal: React.FC<EmbeddingVectorProgressModalProps> = ({
  isOpen,
  onClose,
  current,
  total,
  currentFilename,
  isComplete = false,
  theme = 'Dark',
  title = 'Embedding Vector Metadata'
}) => {
  // Play pleasant Done audio chime when process finishes
  useEffect(() => {
    if (isComplete && isOpen) {
      playDoneSound();
    }
  }, [isComplete, isOpen]);

  if (!isOpen) return null;

  const isLight = theme === 'Light';
  const percentage = isComplete
    ? 100
    : total > 0
    ? Math.min(100, Math.round((current / total) * 100))
    : 0;

  return (
    // Locked modal backdrop: clicking outside does NOT close or hide the modal
    <div
      onClick={(e) => {
        // Prevent background clicks from doing anything or closing the modal
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[500px] rounded border shadow-2xl overflow-hidden transition-all duration-150 animate-in fade-in zoom-in-95 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-[#182635] border-[#22364a] text-slate-200'
        }`}
      >
        {/* Modal Title Bar */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b ${
            isLight
              ? 'bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#15202d] border-[#22364a] text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              /* Colorful multi-dot icon matching screenshot */
              <div className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              </div>
            )}
            <span className="text-[13px] font-semibold tracking-wide">
              {title}
            </span>
          </div>

          <button
            onClick={onClose}
            title={isComplete ? 'Close' : 'Cancel'}
            className="text-slate-400 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 space-y-3.5">
          <p className={`text-[12.5px] font-medium ${
            isComplete
              ? isLight ? 'text-emerald-700' : 'text-emerald-400'
              : isLight ? 'text-slate-700' : 'text-slate-200'
          }`}>
            {isComplete
              ? (title.toLowerCase().includes('image')
                  ? 'All image metadata embedded successfully. Process Complete (Done)!'
                  : 'All vector metadata embedded successfully. Process Complete (Done)!')
              : `${title}. Please wait...`}
          </p>

          {/* Progress Bar Container */}
          <div
            className={`w-full h-4 rounded-xs border overflow-hidden relative ${
              isLight
                ? 'bg-slate-200 border-slate-300'
                : 'bg-[#101923] border-[#263c50]'
            }`}
          >
            <div
              className={`h-full transition-all duration-200 ease-out ${
                isComplete ? 'bg-[#22c55e]' : 'bg-[#22c55e]'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Progress Counter & Current Filename */}
          <div className="flex items-center justify-between text-[11.5px] font-normal">
            <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>
              {isComplete ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span>Complete:</span>
                  <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                    All {total} {title.toLowerCase().includes('image') ? 'image' : 'vector'} files processed successfully!
                  </span>
                </span>
              ) : (
                <>
                  Processing {current}/{total}:{' '}
                  <span className={isLight ? 'text-slate-800 font-medium' : 'text-slate-300 font-medium'}>
                    {currentFilename || 'Preparing...'}
                  </span>
                </>
              )}
            </span>
            <span className={isLight ? 'text-slate-500 font-mono text-[11px]' : 'text-slate-400 font-mono text-[11px]'}>
              {percentage}%
            </span>
          </div>

          {/* Locked State Notification & Done Button */}
          {isComplete && (
            <div className="pt-2 flex items-center justify-between border-t border-[#22364a]/60">
              <span className="text-[11px] text-emerald-400/90 font-medium">
                Status: Done / Complete
              </span>
              <button
                onClick={onClose}
                className="px-5 py-1 rounded bg-[#22c55e] hover:bg-[#16a34a] text-[#0f172a] font-bold text-xs cursor-pointer shadow-sm transition-all active:scale-95"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
