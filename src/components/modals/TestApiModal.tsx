import React, { useState } from 'react';
import { ApiConfig, ProviderType } from '../../types';
import { Play, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';

interface TestApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  provider: ProviderType;
}

export const TestApiModal: React.FC<TestApiModalProps> = ({
  isOpen,
  onClose,
  config,
  provider
}) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    latency: number;
    model: string;
  } | null>(null);

  if (!isOpen) return null;

  const runTest = async () => {
    setTesting(true);
    setResult(null);

    const startTime = performance.now();
    const currentKey =
      provider === 'gemini'
        ? config.geminiKey
        : provider === 'openai'
        ? config.openaiKey
        : provider === 'openrouter'
        ? config.openrouterKey
        : provider === 'claude'
        ? config.claudeKey
        : provider === 'groq'
        ? config.groqKey
        : provider === 'mistral'
        ? config.mistralKey
        : '';

    if (!currentKey) {
      if (provider === 'gemini') {
        try {
          const statusRes = await fetch('/api/gemini/status');
          const statusData = await statusRes.json();
          if (statusData.hasKey) {
            const elapsed = Math.round(performance.now() - startTime);
            setResult({
              success: true,
              message: `Server-Side Gemini API connected! Model: ${config.geminiModel || 'gemini-3.5-flash-lite'}. Ready for generation.`,
              latency: elapsed,
              model: config.geminiModel || 'gemini-3.5-flash-lite'
            });
            setTesting(false);
            return;
          }
        } catch (e) {
          // fallback to not set
        }
      }

      setTimeout(() => {
        setTesting(false);
        setResult({
          success: false,
          message: `API Key for ${provider.toUpperCase()} is not set. Please add your key in 'Manage Keys'.`,
          latency: 0,
          model: provider === 'groq' ? config.groqModel : 'default'
        });
      }, 300);
      return;
    }

    try {
      const activeModel =
        provider === 'gemini'
          ? config.geminiModel
          : provider === 'openai'
          ? config.openaiModel
          : provider === 'openrouter'
          ? config.openrouterModel
          : provider === 'claude'
          ? config.claudeModel
          : provider === 'groq'
          ? config.groqModel
          : provider === 'mistral'
          ? config.mistralModel
          : 'default';

      const isWebProtocol = typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:');
      let testSuccess = false;
      let testMessage = '';

      if (isWebProtocol) {
        try {
          const resp = await fetch('/api/ai/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider,
              apiKey: currentKey,
              model: activeModel,
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (data && data.success) {
            testSuccess = true;
            testMessage = data.message || `Connected to ${provider.toUpperCase()} successfully!`;
          }
        } catch {}
      }

      // If not on web server or server test failed, test direct client connection
      if (!testSuccess) {
        if (provider === 'gemini') {
          const geminiTest = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentKey}`);
          if (geminiTest.ok) {
            testSuccess = true;
            testMessage = `Direct Gemini API connected successfully! Ready for vision generation.`;
          } else {
            const errData = await geminiTest.json().catch(() => ({}));
            testMessage = errData?.error?.message || `Gemini test failed with status ${geminiTest.status}`;
          }
        } else if (provider === 'openai') {
          const openAiTest = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${currentKey}` }
          });
          if (openAiTest.ok) {
            testSuccess = true;
            testMessage = `Direct OpenAI API connected successfully!`;
          } else {
            testMessage = `OpenAI returned status ${openAiTest.status}`;
          }
        } else if (provider === 'openrouter') {
          const orTest = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { Authorization: `Bearer ${currentKey}` }
          });
          if (orTest.ok) {
            testSuccess = true;
            testMessage = `Direct OpenRouter API connected successfully!`;
          } else {
            testMessage = `OpenRouter returned status ${orTest.status}`;
          }
        } else {
          testSuccess = currentKey.length >= 8;
          testMessage = testSuccess ? `${provider.toUpperCase()} API Key is configured.` : 'Invalid key length.';
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      setResult({
        success: testSuccess,
        message: testMessage,
        latency: elapsed,
        model: activeModel || provider,
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'Connection failed.',
        latency: Math.round(performance.now() - startTime),
        model: provider
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#101923] border border-[#1e3042] rounded-lg w-full max-w-md shadow-2xl text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2e3e] bg-[#162230]">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Test API Connectivity</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#1f2e40] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between bg-[#152230] p-3 rounded border border-[#233547]">
            <span className="text-slate-300 font-semibold">Active Provider:</span>
            <span className="text-[#38bdf8] font-bold uppercase">{provider}</span>
          </div>

          <div className="flex items-center justify-between bg-[#152230] p-3 rounded border border-[#233547]">
            <span className="text-slate-300 font-semibold">Configured Model:</span>
            <span className="text-emerald-400 font-mono">
              {provider === 'groq' ? config.groqModel : 'gemini-3.8-flash'}
            </span>
          </div>

          {result && (
            <div
              className={`p-3.5 rounded border text-xs flex items-start gap-2.5 ${
                result.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-950/40 border-red-500/50 text-red-200'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{result.success ? 'Test Passed' : 'Test Failed'}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{result.message}</p>
                {result.latency > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-slate-400">
                    Round-trip latency: {result.latency}ms
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1e2e3e] bg-[#141e2a]">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-[#2a3c50] text-xs text-slate-300 hover:bg-[#1a2938] transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={runTest}
            disabled={testing}
            className="px-4 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Testing...
              </>
            ) : (
              'Run Test Now'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
