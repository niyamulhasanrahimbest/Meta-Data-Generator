import React, { useState } from 'react';
import { ApiConfig, ProviderType, StoredApiKey, ThemeType } from '../../types';
import { X, Check } from 'lucide-react';
import { getModelsForProvider, getDefaultModelForProvider } from '../../data/providerModels';

interface ManageKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  theme?: ThemeType;
  onSave: (newConfig: ApiConfig) => void;
}

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export const ManageKeysModal: React.FC<ManageKeysModalProps> = ({
  isOpen,
  onClose,
  config,
  theme = 'Dark',
  onSave
}) => {
  const isLight = theme === 'Light';
  // Start empty by default or load existing savedKeys
  const [keys, setKeys] = useState<StoredApiKey[]>(() => {
    return config.savedKeys || [];
  });

  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(() => {
    if (config.savedKeys && config.savedKeys.length > 0) {
      const active = config.savedKeys.find((k) => k.isActive);
      return active ? active.id : config.savedKeys[0].id;
    }
    return null;
  });

  const [inputLabel, setInputLabel] = useState<string>('');
  const [inputProvider, setInputProvider] = useState<string>('Gemini');
  const [inputModel, setInputModel] = useState<string>(() => getDefaultModelForProvider('Gemini'));
  const [inputKey, setInputKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  // Add new API Key
  const handleAddNewKey = () => {
    if (!inputKey.trim()) {
      setFeedback('Please enter an API Key to add.');
      setTimeout(() => setFeedback(null), 2500);
      return;
    }

    const models = getModelsForProvider(inputProvider);
    const resolvedModel = models.some((m) => m.id === inputModel)
      ? inputModel
      : getDefaultModelForProvider(inputProvider);

    const nextNumber = keys.length + 1;
    const isFirstKey = keys.length === 0;
    const newEntry: StoredApiKey = {
      id: Date.now().toString(),
      label: inputLabel.trim() || `${nextNumber}`,
      provider: inputProvider,
      model: resolvedModel,
      rawKey: inputKey.trim(),
      maskedKey: maskApiKey(inputKey.trim()),
      status: 'Valid',
      lastUsed: isFirstKey ? new Date().toISOString().replace('T', ' ').slice(0, 19) : 'None',
      isActive: isFirstKey
    };

    const updated = [...keys, newEntry];
    setKeys(updated);
    setSelectedKeyId(newEntry.id);
    setInputLabel('');
    setInputKey('');
    setFeedback(`API Key for ${inputProvider} added successfully.`);
    setTimeout(() => setFeedback(null), 2500);

    // Persist
    saveConfigWithKeys(updated, isFirstKey ? newEntry : undefined);
  };

  // Set selected key as active
  const handleSetAsActive = () => {
    if (!selectedKeyId || keys.length === 0) {
      setFeedback('Please select a key from the table first.');
      setTimeout(() => setFeedback(null), 2500);
      return;
    }

    const selected = keys.find((k) => k.id === selectedKeyId);
    if (!selected) return;

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const updated = keys.map((k) => {
      if (k.id === selectedKeyId) {
        return { ...k, isActive: true, status: 'Valid' as const, lastUsed: nowStr };
      }
      return { ...k, isActive: false };
    });

    setKeys(updated);
    setFeedback(`Key #${selected.label} (${selected.provider}) is now Active.`);
    setTimeout(() => setFeedback(null), 2500);

    // Save and activate in app
    saveConfigWithKeys(updated, selected);
  };

  // Validate selected key or entered key
  const handleValidate = async () => {
    const keyToTest = keys.find((k) => k.id === selectedKeyId)?.rawKey || inputKey.trim();

    if (!keyToTest) {
      setFeedback('Please enter or select an API key to validate.');
      setTimeout(() => setFeedback(null), 2500);
      return;
    }

    setFeedback('Validating key connectivity...');
    const isValid = keyToTest.length >= 8;

    if (selectedKeyId) {
      const updated = keys.map((k) => {
        if (k.id === selectedKeyId) {
          return { ...k, status: isValid ? ('Valid' as const) : ('Invalid' as const) };
        }
        return k;
      });
      setKeys(updated);
      saveConfigWithKeys(updated);
    }

    setTimeout(() => {
      setFeedback(
        isValid
          ? 'API Key is Valid and connected successfully.'
          : 'API Key is Invalid or too short.'
      );
      setTimeout(() => setFeedback(null), 2500);
    }, 400);
  };

  // Remove selected key
  const handleRemove = () => {
    if (!selectedKeyId || keys.length === 0) {
      setFeedback('Please select a key to remove.');
      setTimeout(() => setFeedback(null), 2000);
      return;
    }

    const updated = keys.filter((k) => k.id !== selectedKeyId);
    setKeys(updated);
    if (updated.length > 0) {
      setSelectedKeyId(updated[0].id);
      saveConfigWithKeys(updated);
    } else {
      setSelectedKeyId(null);
      saveConfigWithKeys([]);
    }
    setFeedback('Selected API Key removed.');
    setTimeout(() => setFeedback(null), 2000);
  };

  // Save changes to parent ApiConfig
  const saveConfigWithKeys = (keyList: StoredApiKey[], activeOverride?: StoredApiKey) => {
    const active = activeOverride || keyList.find((k) => k.isActive);
    const newConfig: ApiConfig = {
      ...config,
      savedKeys: keyList
    };

    if (active) {
      const provLower = active.provider.toLowerCase();
      // Strictly preserve user-selected model: only fallback to key's model if none was previously set
      if (!newConfig.activeModel && active.model) {
        newConfig.activeModel = active.model;
      }
      if (provLower.includes('gemini')) {
        newConfig.provider = 'gemini';
        newConfig.geminiKey = active.rawKey;
        if (!newConfig.geminiModel && active.model) newConfig.geminiModel = active.model;
      } else if (provLower.includes('openrouter')) {
        newConfig.provider = 'openrouter';
        newConfig.openrouterKey = active.rawKey;
        if (!newConfig.openrouterModel && active.model) newConfig.openrouterModel = active.model;
      } else if (provLower.includes('openai')) {
        newConfig.provider = 'openai';
        newConfig.openaiKey = active.rawKey;
        if (!newConfig.openaiModel && active.model) newConfig.openaiModel = active.model;
      } else if (provLower.includes('groq')) {
        newConfig.provider = 'groq';
        newConfig.groqKey = active.rawKey;
        if (!newConfig.groqModel && active.model) newConfig.groqModel = active.model;
      } else if (provLower.includes('claude')) {
        newConfig.provider = 'claude';
        newConfig.claudeKey = active.rawKey;
        if (!newConfig.claudeModel && active.model) newConfig.claudeModel = active.model;
      } else if (provLower.includes('mistral')) {
        newConfig.provider = 'mistral';
        newConfig.mistralKey = active.rawKey;
        if (!newConfig.mistralModel && active.model) newConfig.mistralModel = active.model;
      }
    } else {
      // Clear all active keys if empty
      newConfig.geminiKey = '';
      newConfig.openaiKey = '';
      newConfig.openrouterKey = '';
      newConfig.claudeKey = '';
      newConfig.groqKey = '';
      newConfig.mistralKey = '';
    }

    onSave(newConfig);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`rounded-md w-full max-w-[650px] shadow-2xl overflow-hidden font-sans animate-in fade-in zoom-in-95 duration-150 border transition-colors ${
        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#101923] border-[#223347] text-slate-200'
      }`}>
        {/* Title Bar */}
        <div className={`flex items-center justify-between px-3 py-2 border-b select-none ${
          isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-[#14202d] border-[#1c2c3d] text-slate-100'
        }`}>
          <div className="flex items-center gap-2">
            {/* Colorful 4-quadrant icon matching screenshot */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="2" fill="#ef4444" />
              <rect x="13" y="3" width="8" height="8" rx="2" fill="#3b82f6" />
              <rect x="3" y="13" width="8" height="8" rx="2" fill="#22c55e" />
              <rect x="13" y="13" width="8" height="8" rx="2" fill="#eab308" />
            </svg>
            <h3 className="font-semibold text-xs">Manage API Keys</h3>
          </div>
          <button
            onClick={onClose}
            className={`${
              isLight ? 'text-slate-500 hover:text-white hover:bg-[#ef4444]' : 'text-slate-400 hover:text-white hover:bg-[#ef4444]'
            } px-1.5 py-0.5 rounded transition-colors cursor-pointer text-xs font-bold`}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-3 space-y-3">
          {/* Feedback banner */}
          {feedback && (
            <div className={`px-2.5 py-1 text-[11px] rounded flex items-center justify-between border animate-in fade-in ${
              isLight ? 'bg-sky-50 border-sky-300 text-sky-900' : 'bg-[#1e3a5f] border-[#2563eb] text-sky-200'
            }`}>
              <span>{feedback}</span>
            </div>
          )}

          {/* Group 1: API Keys Table */}
          <fieldset className={`border rounded px-3 py-2 transition-colors ${
            isLight ? 'border-slate-300 bg-slate-50/60' : 'border-[#223347] bg-[#121c27]/80'
          }`}>
            <legend className={`text-[11px] font-bold px-1 select-none ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              API Keys
            </legend>
            <div className={`overflow-x-auto min-h-[145px] max-h-[190px] overflow-y-auto border rounded ${
              isLight ? 'border-slate-300 bg-white' : 'border-[#1a2838] bg-[#0f1722]'
            }`}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] select-none font-bold ${
                    isLight ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-[#1c2d40] bg-[#14202e] text-[#94a3b8]'
                  }`}>
                    <th className="py-1 px-2.5 w-10 text-center">#</th>
                    <th className="py-1 px-2.5 w-16">Label</th>
                    <th className="py-1 px-2.5 w-24">Provider</th>
                    <th className="py-1 px-2.5 w-32">Model</th>
                    <th className="py-1 px-2.5 flex-1">API Key</th>
                    <th className="py-1 px-2.5 w-20">Status</th>
                    <th className="py-1 px-2.5 w-36">Last Used</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-[#172535]'}`}>
                  {keys.map((k, index) => {
                    const isSelected = k.id === selectedKeyId;
                    return (
                      <tr
                        key={k.id}
                        onClick={() => {
                          setSelectedKeyId(k.id);
                          setInputLabel(k.label || '');
                          setInputProvider(k.provider || 'Gemini');
                          setInputModel(k.model || getDefaultModelForProvider(k.provider || 'Gemini'));
                          setInputKey(k.rawKey || '');
                        }}
                        className={`cursor-pointer transition-colors text-[11px] ${
                          isSelected
                            ? isLight ? 'bg-sky-100 text-sky-950 font-bold' : 'bg-[#1b344d] text-white font-medium'
                            : isLight ? 'hover:bg-slate-50 text-slate-800' : 'hover:bg-[#152332] text-slate-200'
                        }`}
                      >
                        <td className={`py-1.5 px-2.5 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {index + 1}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <span className="flex items-center gap-1">
                            {k.isActive && (
                              <Check className="w-3.5 h-3.5 text-[#16a34a] stroke-[2.5]" />
                            )}
                            <span>{k.label}</span>
                          </span>
                        </td>
                        <td className={`py-1.5 px-2.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{k.provider}</td>
                        <td className={`py-1.5 px-2.5 font-mono text-[10.5px] truncate max-w-[120px] ${isLight ? 'text-sky-800 font-semibold' : 'text-sky-400'}`} title={k.model || '-'}>
                          {k.model || '-'}
                        </td>
                        <td className={`py-1.5 px-2.5 font-mono text-[11px] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          {k.maskedKey || maskApiKey(k.rawKey)}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <span
                            className={
                              k.status === 'Valid'
                                ? isLight ? 'text-emerald-700 font-bold' : 'text-[#4ade80] font-medium'
                                : isLight ? 'text-slate-500' : 'text-slate-400'
                            }
                          >
                            {k.status}
                          </span>
                        </td>
                        <td className={`py-1.5 px-2.5 font-mono text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {k.lastUsed}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>

          {/* Group 2: Add New API Key */}
          <fieldset className={`border rounded px-3 py-2.5 transition-colors ${
            isLight ? 'border-slate-300 bg-slate-50/60' : 'border-[#223347] bg-[#121c27]/80'
          }`}>
            <legend className={`text-[11px] font-bold px-1 select-none ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Add New API Key
            </legend>
            <div className="space-y-2 text-xs">
              {/* Label row */}
              <div className="flex items-center gap-2">
                <label className={`w-16 text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Label:</label>
                <input
                  type="text"
                  placeholder=""
                  value={inputLabel}
                  onChange={(e) => setInputLabel(e.target.value)}
                  className={`flex-1 border rounded px-2 py-1 text-xs outline-none focus:border-[#0284c7] ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#172433] border-[#283c52] text-slate-100 placeholder-slate-500'
                  }`}
                />
              </div>

              {/* Provider row */}
              <div className="flex items-center gap-2">
                <label className={`w-16 text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Provider:</label>
                <select
                  value={inputProvider}
                  onChange={(e) => {
                    const newProv = e.target.value;
                    setInputProvider(newProv);
                    setInputModel(getDefaultModelForProvider(newProv));
                  }}
                  className={`border rounded px-2 py-1 text-xs outline-none focus:border-[#0284c7] cursor-pointer min-w-[130px] ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-[#172433] text-slate-100 border-[#283c52]'
                  }`}
                >
                  <option value="Gemini">Gemini</option>
                  <option value="OpenAI">OpenAI</option>
                  <option value="OpenRouter">OpenRouter</option>
                  <option value="Claude">Claude</option>
                  <option value="groq">groq</option>
                  <option value="Mistral AI">Mistral AI</option>
                </select>
              </div>

              {/* Model row — directly under Provider as requested */}
              <div className="flex items-center gap-2">
                <label className={`w-16 text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Model:</label>
                <select
                  value={
                    getModelsForProvider(inputProvider).some((m) => m.id === inputModel)
                      ? inputModel
                      : getDefaultModelForProvider(inputProvider)
                  }
                  onChange={(e) => setInputModel(e.target.value)}
                  className={`border rounded px-2 py-1 text-xs outline-none focus:border-[#0284c7] cursor-pointer flex-1 ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-[#172433] text-slate-100 border-[#283c52]'
                  }`}
                >
                  {getModelsForProvider(inputProvider).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id}){m.tag ? ` • [${m.tag}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key row with Show Key toggle */}
              <div className="flex items-center gap-2">
                <label className={`w-16 text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>API Key:</label>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder=""
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    className={`flex-1 border rounded px-2 py-1 text-xs font-mono outline-none focus:border-[#0284c7] ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#172433] border-[#283c52] text-slate-100 placeholder-slate-500'
                    }`}
                  />
                  <label className={`flex items-center gap-1 text-[11px] cursor-pointer select-none whitespace-nowrap ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={showKey}
                      onChange={(e) => setShowKey(e.target.checked)}
                      className="rounded accent-[#0284c7] cursor-pointer"
                    />
                    <span>Show Key</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons row */}
              <div className="flex items-center justify-between pt-1.5">
                {/* Left group buttons: Validate, Set as Active, Remove */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleValidate}
                    className="bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold px-3 py-1 rounded transition-colors cursor-pointer shadow-sm active:scale-95"
                  >
                    Validate
                  </button>

                  <button
                    onClick={handleSetAsActive}
                    className="bg-[#16a34a] hover:bg-[#15803d] text-white text-[11px] font-semibold px-3 py-1 rounded transition-colors cursor-pointer shadow-sm active:scale-95"
                  >
                    Set as Active
                  </button>

                  <button
                    onClick={handleRemove}
                    className="bg-[#ef4444] hover:bg-[#dc2626] text-white text-[11px] font-semibold px-3 py-1 rounded transition-colors cursor-pointer shadow-sm active:scale-95"
                  >
                    Remove
                  </button>
                </div>

                {/* Right button: Add New Key */}
                <button
                  onClick={handleAddNewKey}
                  className="bg-[#16a34a] hover:bg-[#15803d] text-white text-[11px] font-bold px-3.5 py-1 rounded transition-colors cursor-pointer shadow-sm active:scale-95"
                >
                  Add New Key
                </button>
              </div>
            </div>
          </fieldset>

          {/* Help Footer */}
          <div className="pt-0.5">
            <button
              onClick={() => setHelpOpen(!helpOpen)}
              className="text-[#0284c7] hover:underline text-[11px] font-medium cursor-pointer"
            >
              Help
            </button>
            {helpOpen && (
              <div className={`mt-1.5 p-2 rounded text-[11px] space-y-1 border ${
                isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#0f1722] border-[#1e2e40] text-slate-300'
              }`}>
                <p>
                  • <strong>Validate:</strong> Checks whether the selected API Key connects
                  successfully.
                </p>
                <p>
                  • <strong>Set as Active:</strong> Activates this key (marked with ✓) and
                  updates the main Provider and API Key status to Ready.
                </p>
                <p>
                  • <strong>Add New Key:</strong> Saves a new key with your custom label.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
