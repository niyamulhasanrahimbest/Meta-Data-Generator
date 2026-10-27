import React from 'react';
import { X, Award, ShieldCheck, Mail, Heart } from 'lucide-react';
import { APP_LOGO_SRC } from '../../data/logoAsset';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101923] border border-[#1e3042] rounded-lg w-full max-w-md shadow-2xl text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2e3e] bg-[#162230]">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">About Meta Data Generator</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#1f2e40] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-center">
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-2xl overflow-hidden bg-white/5 p-1 border border-white/10 shadow-lg">
            <img
              src={APP_LOGO_SRC}
              alt="Meta Data Generator Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <h4 className="text-xl font-black text-white">Meta Data Generator</h4>
            <p className="text-sm font-semibold text-[#38bdf8] mt-0.5">Developed By Neimor Rahim</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Professional Microstock Automation Tool for Vector Artists & Photographers.
              Converts SVGs to Adobe Illustrator EPS 10, writes lossless DSC headers, and batches EXIF/XMP tags.
            </p>
          </div>

          <div className="p-3 bg-[#162230] border border-[#233547] rounded-lg text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">License Status:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Active Pro Lifetime
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Expiration:</span>
              <span className="text-slate-200 font-mono">2035-12-30 (3,374 days left)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Target Platforms:</span>
              <span className="text-slate-200">Adobe Stock, Freepik, Shutterstock, Vecteezy</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            <span>Built with passion for vector artists</span>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#1e2e3e] bg-[#141e2a] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
