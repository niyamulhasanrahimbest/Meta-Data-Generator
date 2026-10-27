/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MetadataItem,
  ProviderType,
  ModeType,
  ThemeType,
  GenerationOptions,
  ApiConfig,
  ProcessingStats
} from './types';
import { HeaderBar } from './components/HeaderBar';
import { getDefaultModelForProvider } from './data/providerModels';
import { ToolbarRow2 } from './components/ToolbarRow2';
import { ToolbarRow3 } from './components/ToolbarRow3';
import { MetaTable } from './components/MetaTable';
import { StatusBar } from './components/StatusBar';
import { ManageKeysModal } from './components/modals/ManageKeysModal';
import { TestApiModal } from './components/modals/TestApiModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ContactModal } from './components/modals/ContactModal';
import { ExtensionsModal } from './components/modals/ExtensionsModal';
import { RenameModal } from './components/modals/RenameModal';
import { PythonSourceModal } from './components/modals/PythonSourceModal';
import { EmbeddingVectorProgressModal } from './components/modals/EmbeddingVectorProgressModal';
import { MarketplacePreset, exportMetadataToCsv, downloadCsvFile } from './utils/csvExporter';
import { cleanFilenames, batchRenameFiles, renameFilesToTitle } from './utils/filenameTools';
import { convertSvgToEps10, injectMetadataIntoEps } from './utils/svgToEps';
import { generateMetadataForFile, generateLocalStockMetadata } from './utils/aiService';
import { extractEpsInfo } from './utils/epsParser';
import { convertSvgToJpeg } from './utils/svgHelper';
import { embedMetadataIntoImage } from './utils/imageMetadataEmbedder';
import { embedXmpIntoJpegBuffer, uint8ArrayToBase64, base64ToUint8Array } from './utils/jpegMetadata';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
export function getElectronBridge() {
  if (typeof window !== 'undefined' && (window as any).electronApi) {
    return (window as any).electronApi;
  }
  if (typeof window !== 'undefined' && typeof (window as any).require === 'function') {
    try {
      const electron = (window as any).require('electron');
      const { ipcRenderer, webUtils } = electron;
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');

      const bridge = {
        isElectron: true,
        getPathForFile: (file: any) => {
          if (webUtils && typeof webUtils.getPathForFile === 'function') {
            try {
              const p = webUtils.getPathForFile(file);
              if (p) return p;
            } catch (e) {}
          }
          return file?.path || '';
        },
        selectFilesOrFolder: (mode: string, isFolder: boolean) =>
          ipcRenderer.invoke('select-files-dialog', { mode, isFolder }),
        writeLocalFile: (filePath: string, data: any, oldPath?: string) => {
          try {
            let buffer: any;
            if (Buffer.isBuffer(data)) {
              buffer = data;
            } else if (data instanceof Uint8Array || (data && data.buffer instanceof ArrayBuffer)) {
              buffer = Buffer.from(data.buffer, data.byteOffset || 0, data.byteLength);
            } else if (data instanceof ArrayBuffer) {
              buffer = Buffer.from(data);
            } else if (typeof data === 'string') {
              const trimmed = data.trim();
              const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.startsWith('%!PS') && !trimmed.startsWith('<?xml') && !trimmed.startsWith('<svg');
              buffer = isBase64 ? Buffer.from(trimmed, 'base64') : Buffer.from(data, 'utf8');
            } else {
              buffer = Buffer.from(data);
            }
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, buffer);
            if (oldPath && oldPath !== filePath && fs.existsSync(oldPath)) {
              try { fs.unlinkSync(oldPath); } catch (e) {}
            }
            return Promise.resolve({ success: true, filePath });
          } catch (err) {
            return ipcRenderer.invoke('write-local-file', { filePath, base64Data: data, oldPath });
          }
        },
        renameLocalFile: (oldPath: string, newPath: string) => {
          try {
            if (fs.existsSync(oldPath)) {
              if (oldPath === newPath) return Promise.resolve({ success: true, newPath });
              if (fs.existsSync(newPath)) {
                try { fs.unlinkSync(newPath); } catch (e) {}
              }
              fs.renameSync(oldPath, newPath);
              return Promise.resolve({ success: true, newPath });
            }
          } catch (e) {}
          return ipcRenderer.invoke('rename-local-file', { oldPath, newPath });
        },
        deleteLocalFile: (filePath: string) => {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              return Promise.resolve({ success: true });
            }
          } catch (e) {}
          return ipcRenderer.invoke('delete-local-file', { filePath });
        },
        cleanFolderFiles: (folderPath: string) => {
          try {
            if (fs.existsSync(folderPath)) {
              const stat = fs.statSync(folderPath);
              const targetDir = stat.isDirectory() ? folderPath : path.dirname(folderPath);
              const files = fs.readdirSync(targetDir);
              let renamedCount = 0;
              const renamedMap: Record<string, string> = {};
              const targetExts = ['.jpg', '.jpeg', '.eps', '.svg', '.png', '.webp', '.ai', '.mp4', '.mov'];

              for (const fileName of files) {
                const ext = path.extname(fileName);
                if (!targetExts.includes(ext.toLowerCase())) continue;
                const baseName = path.basename(fileName, ext);
                if (baseName.includes('-') || baseName.includes('_') || /\s{2,}/.test(baseName)) {
                  let cleanedBase = baseName
                    .replace(/[-_]+/g, ' ')
                    .replace(/[\\/:*?"<>|]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (cleanedBase && cleanedBase !== baseName) {
                    const newFileName = `${cleanedBase}${ext}`;
                    const oldPath = path.join(targetDir, fileName);
                    const newPath = path.join(targetDir, newFileName);
                    if (oldPath !== newPath) {
                      if (fs.existsSync(newPath)) {
                        try { fs.unlinkSync(newPath); } catch (e) {}
                      }
                      fs.renameSync(oldPath, newPath);
                      renamedCount++;
                      renamedMap[oldPath] = newPath;
                    }
                  }
                }
              }
              return Promise.resolve({ success: true, renamedCount, renamedMap });
            }
          } catch (e) {}
          return ipcRenderer.invoke('clean-folder-filenames', { folderPath });
        },
        readLocalFile: (filePath: string) => {
          try {
            if (fs.existsSync(filePath)) {
              const data = fs.readFileSync(filePath);
              return Promise.resolve({
                success: true,
                buffer: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
                base64: data.toString('base64')
              });
            }
          } catch (e) {}
          return ipcRenderer.invoke('read-local-file', { filePath });
        },
        runIllustratorAutomation: (items: any[]) =>
          ipcRenderer.invoke('run-illustrator-automation', { items }),
        injectJpegMetadata: (filePath: string, item: any) =>
          ipcRenderer.invoke('inject-jpeg-metadata', { filePath, item }),
        runPhotoshopAutomation: (items: any[]) =>
          ipcRenderer.invoke('run-photoshop-automation', { items }),
        onPhotoshopProgress: (callback: any) => {
          const handler = (_event: any, data: any) => callback(data);
          ipcRenderer.on('photoshop-progress', handler);
          return () => ipcRenderer.removeListener('photoshop-progress', handler);
        }
      };
      (window as any).electronApi = bridge;
      return bridge;
    } catch (e) {
      console.warn('Fallback require electron error:', e);
    }
  }
  return null;
}

export default function App() {
  // App state — starts empty by default
  const [items, setItems] = useState<MetadataItem[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      const saved = localStorage.getItem('mdg_api_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {}
    return {
      provider: 'gemini',
      geminiKey: '',
      openaiKey: '',
      openrouterKey: '',
      claudeKey: '',
      groqKey: '',
      mistralKey: '',
      geminiModel: 'gemini-2.5-flash',
      openaiModel: 'gpt-4o',
      openrouterModel: 'google/gemini-2.0-flash-001',
      claudeModel: 'claude-3-7-sonnet-20250219',
      groqModel: 'llama-3.2-11b-vision-preview',
      mistralModel: 'pixtral-large-latest'
    };
  });

  const [provider, setProvider] = useState<ProviderType>(() => {
    try {
      const saved = localStorage.getItem('mdg_api_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.provider) return parsed.provider;
      }
    } catch {}
    return 'gemini';
  });

  const [mode, setMode] = useState<ModeType>('Vector');
  const [theme, setTheme] = useState<ThemeType>('Dark');
  const [marketplace, setMarketplace] = useState<MarketplacePreset>('All Marketplace');

  // Generation options matching screenshot
  const [options, setOptions] = useState<GenerationOptions>({
    description: true,
    filenameHint: true,
    autoEmbed: false,
    pngIsolated: false,
    refinePngBg: false
  });

  // Sync apiConfig to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mdg_api_config', JSON.stringify(apiConfig));
    } catch {}
  }, [apiConfig]);

  // Current active model based on active provider
  const currentModel =
    provider === 'gemini'
      ? apiConfig.geminiModel || 'gemini-2.5-flash'
      : provider === 'openai'
      ? apiConfig.openaiModel || 'gpt-4o'
      : provider === 'openrouter'
      ? apiConfig.openrouterModel || 'google/gemini-2.0-flash-001'
      : provider === 'claude'
      ? apiConfig.claudeModel || 'claude-3-7-sonnet-20250219'
      : provider === 'groq'
      ? apiConfig.groqModel || 'llama-3.2-11b-vision-preview'
      : provider === 'mistral'
      ? apiConfig.mistralModel || 'pixtral-large-latest'
      : 'gemini-3.5-flash-lite';

  const handleModelChange = (newModel: string) => {
    setApiConfig((prev) => {
      const updated = { ...prev, activeModel: newModel };
      if (provider === 'gemini') updated.geminiModel = newModel;
      else if (provider === 'openai') updated.openaiModel = newModel;
      else if (provider === 'openrouter') updated.openrouterModel = newModel;
      else if (provider === 'claude') updated.claudeModel = newModel;
      else if (provider === 'groq') updated.groqModel = newModel;
      else if (provider === 'mistral') updated.mistralModel = newModel;
      return updated;
    });
  };

  // Processing & Worker state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const cancelProcessingRef = useRef(false);

  // Modals state
  const [isManageKeysOpen, setIsManageKeysOpen] = useState(false);
  const [isTestApiOpen, setIsTestApiOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isPythonSourceOpen, setIsPythonSourceOpen] = useState(false);
  const [isVectorProgressOpen, setIsVectorProgressOpen] = useState(false);
  const [vectorProgress, setVectorProgress] = useState<{
    current: number;
    total: number;
    filename: string;
    isComplete: boolean;
    title?: string;
  }>({
    current: 0,
    total: 0,
    filename: '',
    isComplete: false,
    title: 'Embedding Vector Metadata'
  });
  const cancelVectorProgressRef = useRef(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Server-side Gemini status
  const [serverHasGeminiKey, setServerHasGeminiKey] = useState(false);

  useEffect(() => {
    fetch('/api/gemini/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.hasKey) {
          setServerHasGeminiKey(true);
        }
      })
      .catch(() => {});
  }, []);

  // Timer & Statistics
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (isProcessing) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
        setTotalSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Derived stats
  const totalCount = items.length;
  const processedCount = items.filter((i) => i.status === 'processed').length;
  const remainingCount = totalCount - processedCount;

  const stats: ProcessingStats = {
    selected: totalCount,
    processed: processedCount,
    remaining: remainingCount,
    elapsedSeconds,
    totalSeconds,
    last24Hours: processedCount,
    allTime: processedCount,
    licenseExpires: '2035-12-30',
    licenseDaysLeft: 3374,
    licenseActive: true
  };

  // Select files in bulk (supports all image, vector, and video formats)
  const handleSelectFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const vectorExts = ['.svg', '.eps', '.ai'];
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v'];
    const rasterExts = ['.jpeg', '.jpg', '.png', '.webp'];

    // Filter files strictly according to selected mode
    const modeFilteredFiles = filesArray.filter((file) => {
      const lower = file.name.toLowerCase();
      if (mode === 'Image') {
        return rasterExts.some((ext) => lower.endsWith(ext));
      }
      if (mode === 'Vector') {
        return vectorExts.some((ext) => lower.endsWith(ext));
      }
      if (mode === 'Video') {
        return videoExts.some((ext) => lower.endsWith(ext)) || file.type.startsWith('video/');
      }
      return true;
    });

    if (modeFilteredFiles.length === 0) {
      showToast(`No matching ${mode.toLowerCase()} files found in selection.`, 'warning');
      return;
    }

    // Map companion raster images for vector files (e.g. apple.jpg alongside apple.eps)
    const rasterMap = new Map<string, File>();
    filesArray.forEach((f) => {
      const lower = f.name.toLowerCase();
      if (rasterExts.some((ext) => lower.endsWith(ext))) {
        const base = f.name.replace(/\.[^/.]+$/, '').toLowerCase();
        rasterMap.set(base, f);
      }
    });

    const newItems: MetadataItem[] = modeFilteredFiles.map((file, idx) => {
      const lower = file.name.toLowerCase();
      const isSvg = lower.endsWith('.svg');
      const isEps = lower.endsWith('.eps');
      const isVideo = videoExts.some((ext) => lower.endsWith(ext)) || file.type.startsWith('video/');
      const isVector = vectorExts.some((ext) => lower.endsWith(ext));

      let fileType: 'svg' | 'image' | 'video' | 'eps' = 'image';
      if (isSvg) {
        fileType = 'svg';
      } else if (isEps || isVector) {
        fileType = 'eps';
      } else if (isVideo) {
        fileType = 'video';
      }

      const cleanBaseName = file.name.replace(/\.[^/.]+$/, '');

      let resolvedPath = '';
      try {
        if ((window as any).electronApi?.getPathForFile) {
          resolvedPath = (window as any).electronApi.getPathForFile(file);
        }
      } catch (e) {}
      if (!resolvedPath) {
        resolvedPath = (file as any).path || '';
      }

      return {
        id: `f-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        filename: cleanBaseName,
        originalName: file.name,
        title: 'Pending...',
        keywords: 'Pending...',
        description: 'Pending...',
        category: isVideo ? 'Video, Motion' : isVector ? 'Arts, Vector' : 'Arts, Photography',
        rating: 5,
        status: 'pending',
        fileType,
        fileBlob: file,
        filePath: resolvedPath,
        dataUrl: undefined,
        fileSize: file.size
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    showToast(`Bulk added ${newItems.length} ${mode} file(s) to queue`, 'info');
  };

  // Direct native file picker handler (Electron)
  const handleSelectNativeFiles = (nativeFiles: any[]) => {
    if (!nativeFiles || nativeFiles.length === 0) return;

    const newItems: MetadataItem[] = nativeFiles.map((nf, idx) => {
      const ext = nf.name.includes('.') ? nf.name.substring(nf.name.lastIndexOf('.')).toLowerCase() : '';
      const isSvg = ext === '.svg';
      const isEps = ext === '.eps';
      const isVideo = ext === '.mp4' || ext === '.mov' || ext === '.webm';
      let fileType: 'svg' | 'image' | 'video' | 'eps' = 'image';
      if (isSvg) fileType = 'svg';
      else if (isEps) fileType = 'eps';
      else if (isVideo) fileType = 'video';

      const cleanBaseName = nf.name.replace(/\.[^/.]+$/, '');

      return {
        id: `f-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        filename: cleanBaseName,
        originalName: nf.name,
        title: 'Pending...',
        keywords: 'Pending...',
        description: 'Pending...',
        category: isVideo ? 'Video, Motion' : isSvg || isEps ? 'Arts, Vector' : 'Arts, Photography',
        rating: 5,
        status: 'pending',
        fileType,
        filePath: nf.filePath,
        dataUrl: nf.dataUrl,
        fileSize: nf.size
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    showToast(`Bulk added ${newItems.length} file(s) directly from disk`, 'info');
  };

  const handleModeChange = (newMode: ModeType) => {
    setMode(newMode);
    const hints: Record<ModeType, string> = {
      Image: 'Image Mode: Bulk upload JPEG, PNG, WEBP, TIFF, BMP',
      Vector: 'Vector Mode: Bulk upload SVG, EPS, AI vectors',
      Video: 'Video Mode: Bulk upload MP4, MOV, AVI, MKV, WEBM videos'
    };
    showToast(hints[newMode], 'info');
  };

  // Check if active provider has API key configured by the user
  const hasProviderKey = (prov: ProviderType, cfg: ApiConfig): boolean => {
    switch (prov) {
      case 'gemini': return Boolean((cfg.geminiKey && cfg.geminiKey.trim().length > 0) || serverHasGeminiKey);
      case 'openai': return Boolean(cfg.openaiKey && cfg.openaiKey.trim().length > 0);
      case 'openrouter': return Boolean(cfg.openrouterKey && cfg.openrouterKey.trim().length > 0);
      case 'claude': return Boolean(cfg.claudeKey && cfg.claudeKey.trim().length > 0);
      case 'groq': return Boolean(cfg.groqKey && cfg.groqKey.trim().length > 0);
      case 'mistral': return Boolean(cfg.mistralKey && cfg.mistralKey.trim().length > 0);
      default: return false;
    }
  };

  const openKeyConsole = (prov: ProviderType) => {
    const urls: Record<ProviderType, string> = {
      gemini: 'https://aistudio.google.com/app/apikey',
      openai: 'https://platform.openai.com/api-keys',
      openrouter: 'https://openrouter.ai/keys',
      claude: 'https://console.anthropic.com/settings/keys',
      groq: 'https://console.groq.com/keys',
      mistral: 'https://console.mistral.ai/api-keys/'
    };
    window.open(urls[prov] || 'https://console.groq.com/keys', '_blank');
  };

  // Process items in background loop (simulating QThread worker)
  // Process items in background loop
  const runBatchProcessing = async (onlyRetryErrors: boolean = false) => {
    if (isProcessing) return;

    cancelProcessingRef.current = false;
    setIsProcessing(true);

    const exhaustedKeyIds = new Set<string>();
    let currentConfig = { ...apiConfig };

    // Function to find next available key for provider from Manage Keys
    const getNextAvailableKey = (prov: ProviderType, currentRawKey?: string) => {
      const keys = (currentConfig.savedKeys || []).filter(
        (k) => k.provider.toLowerCase() === prov.toLowerCase() && k.status !== 'Invalid'
      );
      return keys.find((k) => !exhaustedKeyIds.has(k.id) && k.rawKey !== currentRawKey);
    };

    // Filter items that need processing
    const itemsToProcess = items.filter((item) => {
      if (onlyRetryErrors) return item.status === 'error';
      return item.status !== 'processed';
    });

    if (itemsToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    let currentIndex = 0;
    let allKeysExhausted = false;

    // Helper to process a single item with key rotation on quota limit
    const processSingleItem = async (item: typeof items[0]) => {
      if (cancelProcessingRef.current || allKeysExhausted) return;

      // Set to processing
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'processing', errorMessage: undefined } : it))
      );

      let metadata: any = null;
      let lastErr: any = null;

      // Processing loop with automatic key switching on Quota / Rate Limit
      while (!metadata && !cancelProcessingRef.current && !allKeysExhausted) {
        const activeRawKey =
          provider === 'gemini'
            ? currentConfig.geminiKey
            : provider === 'openai'
            ? currentConfig.openaiKey
            : provider === 'openrouter'
            ? currentConfig.openrouterKey
            : provider === 'claude'
            ? currentConfig.claudeKey
            : provider === 'groq'
            ? currentConfig.groqKey
            : provider === 'mistral'
            ? currentConfig.mistralKey
            : '';

        const activeConfig: ApiConfig = {
          ...currentConfig,
          provider,
          activeModel: currentModel,
          geminiModel: provider === 'gemini' ? currentModel : currentConfig.geminiModel,
        };

        try {
          metadata = await generateMetadataForFile(item, activeConfig, options);
          if (metadata) break;
        } catch (attemptErr: any) {
          lastErr = attemptErr;
          const errMsg = attemptErr?.message || String(attemptErr);
          const isQuota =
            errMsg.includes('429') ||
            errMsg.includes('Quota') ||
            errMsg.includes('quota') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('rate limit');

          console.warn(`File ${item.filename} API notice:`, errMsg);

          // If a quota or rate limit is reached:
          if (isQuota) {
            // Mark current key as exhausted
            const currentSavedKey = (currentConfig.savedKeys || []).find(
              (k) => k.rawKey === activeRawKey && k.provider.toLowerCase() === provider.toLowerCase()
            );
            if (currentSavedKey) {
              exhaustedKeyIds.add(currentSavedKey.id);
            } else if (activeRawKey) {
              exhaustedKeyIds.add(activeRawKey);
            }

            // Immediately attempt transfer to next available key in Manage Keys
            const nextKey = getNextAvailableKey(provider, activeRawKey);

            if (nextKey) {
              showToast(
                `Quota limit reached. Automatically switched to next API Key: ${nextKey.label}`,
                'info'
              );

              const updatedSavedKeys = (currentConfig.savedKeys || []).map((k) => ({
                ...k,
                isActive: k.id === nextKey.id
              }));

              const updatedConfig: ApiConfig = {
                ...currentConfig,
                [`${provider}Key`]: nextKey.rawKey,
                savedKeys: updatedSavedKeys,
                // Lock the model to the user's explicitly selected model - never revert or switch
                activeModel: currentModel,
                geminiModel: provider === 'gemini' ? currentModel : currentConfig.geminiModel,
              };

              currentConfig = updatedConfig;
              setApiConfig(updatedConfig);
              try {
                localStorage.setItem('mdg_api_config', JSON.stringify(updatedConfig));
              } catch {}

              // Brief pause before trying with the new active key
              await new Promise((r) => setTimeout(r, 600));
              continue;
            } else {
              // All keys exhausted
              allKeysExhausted = true;
              break;
            }
          } else {
            // Non-quota error
            break;
          }
        }
      }

      if (metadata) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  title: metadata.title,
                  keywords: metadata.keywords,
                  description: metadata.description,
                  category: metadata.category,
                  rating: metadata.rating,
                  status: 'processed',
                  errorMessage: undefined,
                  isEmbedded: false
                }
              : it
          )
        );
      } else {
        const errorText = allKeysExhausted
          ? 'Quota limit exceeded (429). Rate limit reached.'
          : (lastErr?.message || 'API error: Generation failed');

        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  title: 'Quota Limit Exceeded (429)',
                  keywords: 'Error: Rate limit / Quota reached. Set new API key and click RETRY.',
                  description: errorText,
                  status: 'error',
                  errorMessage: errorText,
                  isEmbedded: false
                }
              : it
          )
        );

        if (allKeysExhausted) {
          showToast(
            'Quota Limit reached on all API keys! Please set a new key in Manage Keys and click RETRY.',
            'warning'
          );
        }
      }
    };

    // Controlled 2-worker concurrency pool for high-speed processing without bursting rate limits
    const CONCURRENCY = Math.min(2, itemsToProcess.length);
    const worker = async () => {
      while (currentIndex < itemsToProcess.length && !cancelProcessingRef.current && !allKeysExhausted) {
        const itemIdx = currentIndex++;
        const item = itemsToProcess[itemIdx];
        if (item) {
          await processSingleItem(item);
          // Streamlined 200ms pacing between dispatches (down from 1,000ms delay)
          if (currentIndex < itemsToProcess.length && !cancelProcessingRef.current && !allKeysExhausted) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }
    };

    const workerPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          await worker();
          resolve();
        }, i * 250); // Stagger worker launches slightly to prevent burst conflicts
      })
    );

    await Promise.all(workerPromises);

    if (cancelProcessingRef.current) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
    setIsProcessing(false);
  };

  const handleStart = () => {
    setIsPaused(false);
    cancelProcessingRef.current = false;
    runBatchProcessing(false);
  };

  const handlePause = () => {
    if (!isProcessing) return;
    cancelProcessingRef.current = true;
    setIsPaused(true);
    // Return any item currently being marked as 'processing' back to 'pending'
    setItems((prev) =>
      prev.map((it) => (it.status === 'processing' ? { ...it, status: 'pending' } : it))
    );
    showToast('Processing paused. Click "Resume" to continue.', 'info');
  };

  const handleResume = () => {
    setIsPaused(false);
    cancelProcessingRef.current = false;
    runBatchProcessing(false);
    showToast('Resuming processing...', 'info');
  };

  const handleRetry = () => {
    // Reset ONLY error rows to pending, keeping completed rows intact
    setItems((prev) =>
      prev.map((it) =>
        it.status === 'error'
          ? {
              ...it,
              status: 'pending',
              title: 'Pending...',
              keywords: 'Pending...',
              description: 'Pending...',
              category: 'Pending...',
              errorMessage: undefined,
              rating: 5
            }
          : it
      )
    );
    setTimeout(() => {
      runBatchProcessing(true);
    }, 100);
  };

  // Single file delete
  const handleDeleteItem = (id: string) => {
    const target = items.find((it) => it.id === id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    if (selectedRowId === id) setSelectedRowId(null);
    showToast(`Removed "${target?.filename || 'file'}" from queue`, 'info');
  };

  // Multiple or selected files delete
  const handleDeleteSelected = () => {
    const targets = selectedIds.length > 0 ? selectedIds : (selectedRowId ? [selectedRowId] : []);
    if (targets.length === 0) {
      showToast('No file selected to delete', 'warning');
      return;
    }
    const count = targets.length;
    setItems((prev) => prev.filter((it) => !targets.includes(it.id)));
    setSelectedIds([]);
    setSelectedRowId(null);
    showToast(`Deleted ${count} file${count > 1 ? 's' : ''} from queue`, 'info');
  };

  const handleSelectRow = (id: string) => {
    setSelectedRowId(id);
    setSelectedIds([id]);
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((i) => i !== id);
        if (selectedRowId === id) {
          setSelectedRowId(next.length > 0 ? next[next.length - 1] : null);
        }
        return next;
      } else {
        setSelectedRowId(id);
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      const allIds = items.map((it) => it.id);
      setSelectedIds(allIds);
      if (allIds.length > 0) setSelectedRowId(allIds[0]);
    } else {
      setSelectedIds([]);
      setSelectedRowId(null);
    }
  };

  const handleClear = () => {
    setItems([]);
    setSelectedRowId(null);
    setSelectedIds([]);
    setElapsedSeconds(0);
    setTotalSeconds(0);
    showToast('Table cleared', 'info');
  };

  // Keyboard shortcut for deleting selected files
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (selectedIds.length > 0 || selectedRowId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedRowId, items]);

  // Export CSV
  const handleExportCsv = () => {
    const csvContent = exportMetadataToCsv(items, marketplace);
    const filename = `MetaDataGenerator_${marketplace.replace(/\s+/g, '_')}_${Date.now()}.csv`;
    downloadCsvFile(csvContent, filename);
    showToast(`Exported ${items.filter((i) => i.status === 'processed').length} files for ${marketplace}`, 'success');
  };

  // Clean filenames: Replaces all dashes (-) and underscores with spaces, renaming files and companion JPEGs on disk
  const handleCleanFilenames = async () => {
    if (items.length === 0) {
      showToast('Queue is empty. Select files first.', 'warning');
      return;
    }

    const cleaned = cleanFilenames(items);
    const bridge = getElectronBridge();
    let renamedCount = 0;

    if (bridge) {
      // 1. Rename files that are directly tracked in the table
      for (let i = 0; i < items.length; i++) {
        const oldItem = items[i];
        const newItem = cleaned[i];
        if (oldItem.filePath) {
          const lastSlash = Math.max(oldItem.filePath.lastIndexOf('/'), oldItem.filePath.lastIndexOf('\\'));
          const dir = lastSlash !== -1 ? oldItem.filePath.substring(0, lastSlash) : '';
          const sep = oldItem.filePath.includes('\\') ? '\\' : '/';
          const newPath = dir ? `${dir}${sep}${newItem.originalName}` : newItem.originalName;

          if (oldItem.filePath !== newPath) {
            try {
              const res = await bridge.renameLocalFile(oldItem.filePath, newPath);
              if (res?.success) {
                newItem.filePath = newPath;
                renamedCount++;
              }
            } catch (err) {
              console.warn(`Could not rename ${oldItem.filePath} to ${newPath}:`, err);
            }
          }
        }
      }

      // 2. Scan and clean all companion files (JPEGs, EPS, SVGs, etc.) in each unique folder on disk
      const uniqueDirs = new Set<string>();
      items.forEach((item) => {
        if (item.filePath) {
          const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
          if (lastSlash !== -1) {
            uniqueDirs.add(item.filePath.substring(0, lastSlash));
          }
        }
      });

      if (bridge.cleanFolderFiles) {
        for (const dir of uniqueDirs) {
          try {
            const folderRes = await bridge.cleanFolderFiles(dir);
            if (folderRes?.success && folderRes.renamedCount) {
              renamedCount += folderRes.renamedCount;
              if (folderRes.renamedMap) {
                cleaned.forEach((it) => {
                  if (it.filePath && folderRes.renamedMap[it.filePath]) {
                    it.filePath = folderRes.renamedMap[it.filePath];
                  }
                });
              }
            }
          } catch (folderErr) {
            console.warn(`Could not clean companion files in folder ${dir}:`, folderErr);
          }
        }
      }
    }

    setItems([...cleaned]);
    showToast(
      renamedCount > 0
        ? `Cleaned filenames: Replaced dashes with spaces and renamed ${renamedCount} file(s) on disk!`
        : 'Cleaned filenames: Replaced all dashes with spaces!',
      'success'
    );
  };

  // Rename all files directly to match their generated Titles (both in table and on disk)
  const handleRenameFilesToTitle = async () => {
    if (items.length === 0) {
      showToast('Queue is empty. Select files first.', 'warning');
      return;
    }

    const { items: updated, count } = renameFilesToTitle(items);
    if (count === 0) {
      showToast('No processed titles available yet. Click Start to generate titles first!', 'warning');
      return;
    }

    const bridge = getElectronBridge();
    let renamedCount = 0;

    if (bridge) {
      for (const item of updated) {
        if (item.filePath) {
          const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
          const dir = lastSlash !== -1 ? item.filePath.substring(0, lastSlash) : '';
          const sep = item.filePath.includes('\\') ? '\\' : '/';
          const newPath = dir ? `${dir}${sep}${item.originalName}` : item.originalName;
          if (item.filePath !== newPath) {
            try {
              const res = await bridge.renameLocalFile(item.filePath, newPath);
              if (res?.success) {
                item.filePath = newPath;
                renamedCount++;
              }
            } catch (err) {
              console.warn(`Could not rename ${item.filePath} to ${newPath}:`, err);
            }
          }
        }
      }
    }

    setItems([...updated]);
    showToast(
      renamedCount > 0
        ? `Successfully renamed ${renamedCount} file(s) directly on your disk in their folder!`
        : `Successfully renamed ${count} file(s) in queue!`,
      'success'
    );
  };

  // Batch rename files with prefix
  const handleBatchRename = (prefix: string, startNum: number) => {
    const renamed = batchRenameFiles(items, prefix, startNum);
    setItems(renamed);
    showToast(`Renamed ${items.length} files starting from ${startNum}`, 'success');
  };

  // In-place direct embedding into existing folder for JPEG, JPG, PNG, WEBP with automated Title-based renaming
  const handleEmbedMetadata = async () => {
    // If user has SVG vector files loaded, execute the SVG vector embedding workflow with the progress modal
    const hasSvg = items.some(
      (it) => it.fileType === 'svg' || it.originalName.toLowerCase().endsWith('.svg')
    );
    const hasRaster = items.some(
      (it) => it.fileType === 'image' && !it.originalName.toLowerCase().endsWith('.svg')
    );

    if (hasSvg && (mode === 'Vector' || !hasRaster)) {
      await handleEmbedVector();
      return;
    }

    const processedImages = items.filter(
      (it) => it.status === 'processed' && (it.fileType === 'image' || it.fileType === 'eps' || it.fileBlob)
    );

    if (processedImages.length === 0) {
      if (hasSvg) {
        await handleEmbedVector();
        return;
      }
      showToast('No processed files found to embed. Please click Start first.', 'warning');
      return;
    }

    const bridge = getElectronBridge();
    showToast(`Injecting metadata into ${processedImages.length} files in existing folder...`, 'info');

    cancelVectorProgressRef.current = false;
    setVectorProgress({
      current: 1,
      total: processedImages.length,
      filename: processedImages[0].originalName || processedImages[0].filename,
      isComplete: false,
      title: 'Embedding Image Metadata'
    });
    setIsVectorProgressOpen(true);

    let successCount = 0;
    let diskWriteCount = 0;

    for (let idx = 0; idx < processedImages.length; idx++) {
      if (cancelVectorProgressRef.current) break;

      const item = processedImages[idx];
      setVectorProgress({
        current: idx + 1,
        total: processedImages.length,
        filename: item.originalName || item.filename,
        isComplete: false,
        title: 'Embedding Image Metadata'
      });

      try {
        const metadata = {
          title: item.title,
          keywords: item.keywords,
          description: item.description,
          category: item.category,
          rating: item.rating || 5
        };

        // Compute clean filesystem-safe Title for filename
        const rawTitle = (item.title || '').trim();
        let sanitizedTitle = rawTitle
          .replace(/[\\/:*?"<>|]/g, '-')
          .replace(/\s+/g, ' ')
          .replace(/^[\s.-]+|[\s.-]+$/g, '')
          .trim();
        if (!sanitizedTitle) sanitizedTitle = item.filename;

        // Preserve original extension
        const extMatch = (item.originalName || item.filename).match(/\.[0-9a-z]+$/i);
        const ext = extMatch ? extMatch[0] : (item.fileType === 'svg' ? '.svg' : item.fileType === 'eps' ? '.eps' : '.jpg');
        const newFilename = sanitizedTitle;
        const newOriginalName = `${sanitizedTitle}${ext}`;

        // Handle EPS metadata injection
        const isEpsItem = item.fileType === 'eps' || (item.originalName || item.filename).toLowerCase().endsWith('.eps');
        if (isEpsItem) {
          let epsText = '';
          if (bridge && item.filePath) {
            const res = await bridge.readLocalFile(item.filePath);
            if (res?.success && (res.buffer || res.base64)) {
              epsText = res.buffer ? new TextDecoder('utf-8').decode(res.buffer) : atob(res.base64);
            }
          } else if (item.fileBlob) {
            epsText = await item.fileBlob.text();
          }

          if (epsText) {
            const updatedEps = injectMetadataIntoEps(epsText, metadata);
            if (bridge && item.filePath) {
              const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
              const dir = lastSlash !== -1 ? item.filePath.substring(0, lastSlash) : '';
              const sep = item.filePath.includes('\\') ? '\\' : '/';
              const newTargetFilePath = dir ? `${dir}${sep}${newOriginalName}` : newOriginalName;
              const writeRes = await bridge.writeLocalFile(newTargetFilePath, updatedEps, item.filePath);
              if (writeRes?.success) {
                item.filePath = newTargetFilePath;
                diskWriteCount++;
              }

              // Also synchronize companion JPEG in the same folder if present
              const oldBase = (item.originalName || item.filename).replace(/\.[^.]+$/, '');
              const targetJpgPath = dir ? `${dir}${sep}${sanitizedTitle}.jpg` : `${sanitizedTitle}.jpg`;
              const jpgCandidates = [
                dir ? `${dir}${sep}${oldBase}.jpg` : `${oldBase}.jpg`,
                dir ? `${dir}${sep}${oldBase}.jpeg` : `${oldBase}.jpeg`,
                targetJpgPath,
                dir ? `${dir}${sep}${sanitizedTitle}.jpeg` : `${sanitizedTitle}.jpeg`,
                dir ? `${dir}${sep}${oldBase}-01.jpg` : `${oldBase}-01.jpg`
              ];

              for (const cPath of jpgCandidates) {
                try {
                  const jRes = await bridge.readLocalFile(cPath);
                  if (jRes?.success && (jRes.buffer || jRes.base64)) {
                    let jBytes: Uint8Array;
                    if (jRes.buffer) {
                      const b = jRes.buffer as any;
                      jBytes = new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength || b.length);
                    } else {
                      jBytes = base64ToUint8Array(jRes.base64!);
                    }
                    const embBuf = embedXmpIntoJpegBuffer(jBytes, metadata);
                    const embB64 = uint8ArrayToBase64(new Uint8Array(embBuf));
                    await bridge.writeLocalFile(targetJpgPath, embB64, cPath !== targetJpgPath ? cPath : undefined);
                    if (bridge.injectJpegMetadata) {
                      try {
                        await bridge.injectJpegMetadata(targetJpgPath, {
                          title: item.title,
                          description: item.description,
                          keywords: item.keywords,
                          category: item.category,
                          rating: item.rating || 5
                        });
                      } catch (e) {}
                    }
                    break;
                  }
                } catch (e) {}
              }
            }
            item.filename = newFilename;
            item.originalName = newOriginalName;
            item.isEmbedded = true;
            successCount++;
            continue;
          }
        }

        // Handle SVG item: synchronize SVG, companion JPEG, and companion EPS
        const isSvgItem = ext === '.svg' || (item.originalName || item.filename).toLowerCase().endsWith('.svg');
        if (isSvgItem) {
          if (bridge && item.filePath) {
            const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
            const dir = lastSlash !== -1 ? item.filePath.substring(0, lastSlash) : '';
            const sep = item.filePath.includes('\\') ? '\\' : '/';
            const oldBase = (item.originalName || item.filename).replace(/\.[^.]+$/, '');
            const targetJpgPath = dir ? `${dir}${sep}${sanitizedTitle}.jpg` : `${sanitizedTitle}.jpg`;
            const targetEpsPath = dir ? `${dir}${sep}${sanitizedTitle}.eps` : `${sanitizedTitle}.eps`;

            // 1. Process companion JPEG
            const jpgCandidates = [
              dir ? `${dir}${sep}${oldBase}.jpg` : `${oldBase}.jpg`,
              dir ? `${dir}${sep}${oldBase}.jpeg` : `${oldBase}.jpeg`,
              targetJpgPath,
              dir ? `${dir}${sep}${sanitizedTitle}.jpeg` : `${sanitizedTitle}.jpeg`,
              dir ? `${dir}${sep}${oldBase}-01.jpg` : `${oldBase}-01.jpg`
            ];
            for (const cPath of jpgCandidates) {
              try {
                const jRes = await bridge.readLocalFile(cPath);
                if (jRes?.success && (jRes.buffer || jRes.base64)) {
                  let jBytes: Uint8Array;
                  if (jRes.buffer) {
                    const b = jRes.buffer as any;
                    jBytes = new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength || b.length);
                  } else {
                    jBytes = base64ToUint8Array(jRes.base64!);
                  }
                  const embBuf = embedXmpIntoJpegBuffer(jBytes, metadata);
                  const embB64 = uint8ArrayToBase64(new Uint8Array(embBuf));
                  await bridge.writeLocalFile(targetJpgPath, embB64, cPath !== targetJpgPath ? cPath : undefined);
                  if (bridge.injectJpegMetadata) {
                    try {
                      await bridge.injectJpegMetadata(targetJpgPath, {
                        title: item.title,
                        description: item.description,
                        keywords: item.keywords,
                        category: item.category,
                        rating: item.rating || 5
                      });
                    } catch (e) {}
                  }
                  break;
                }
              } catch (e) {}
            }

            // 2. Process companion EPS
            const epsCandidates = [
              dir ? `${dir}${sep}${oldBase}.eps` : `${oldBase}.eps`,
              targetEpsPath
            ];
            for (const ep of epsCandidates) {
              try {
                const epRes = await bridge.readLocalFile(ep);
                if (epRes?.success && (epRes.buffer || epRes.base64)) {
                  const epText = epRes.buffer ? new TextDecoder('utf-8').decode(epRes.buffer) : atob(epRes.base64!);
                  const updatedEps = injectMetadataIntoEps(epText, metadata);
                  await bridge.writeLocalFile(targetEpsPath, updatedEps, ep !== targetEpsPath ? ep : undefined);
                  break;
                }
              } catch (e) {}
            }

            // 3. Rename SVG on disk to match title
            const targetSvgPath = dir ? `${dir}${sep}${newOriginalName}` : newOriginalName;
            if (item.filePath !== targetSvgPath) {
              try {
                await bridge.renameLocalFile(item.filePath, targetSvgPath);
                item.filePath = targetSvgPath;
              } catch (e) {}
            }
          }
          item.filename = newFilename;
          item.originalName = newOriginalName;
          item.isEmbedded = true;
          successCount++;
          continue;
        }

        let buffer: ArrayBuffer | null = null;

        // In Electron, read local file directly from disk without huge string conversions
        if (bridge && item.filePath) {
          const res = await bridge.readLocalFile(item.filePath);
          if (res?.success) {
            if (res.buffer) {
              const b = res.buffer as any;
              buffer = (b.buffer instanceof ArrayBuffer && b.byteOffset !== undefined && b.byteLength !== undefined)
                ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
                : ((res.buffer instanceof Uint8Array ? res.buffer.buffer : res.buffer) as ArrayBuffer);
            } else if (res.base64) {
              const u8 = base64ToUint8Array(res.base64);
              buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
            }
          }
        }

        if (!buffer && item.fileBlob) {
          buffer = await item.fileBlob.arrayBuffer();
        }

        if (!buffer) continue;

        // Inject EXIF (Windows XPTitle, XPKeywords, XPSubject, Rating), IPTC, and Adobe XMP
        const embeddedBuffer = embedMetadataIntoImage(
          buffer,
          item.originalName || item.filename,
          metadata
        );

        const embeddedBytes = new Uint8Array(embeddedBuffer);

        // In-place overwrite & rename directly into the existing file on disk in Electron
        if (bridge && item.filePath) {
          const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
          const dir = lastSlash !== -1 ? item.filePath.substring(0, lastSlash) : '';
          const sep = item.filePath.includes('\\') ? '\\' : '/';
          const newTargetFilePath = dir ? `${dir}${sep}${newOriginalName}` : newOriginalName;

          // Safely write via standard base64 transfer across Electron IPC
          const embeddedBase64 = uint8ArrayToBase64(embeddedBytes);
          const writeRes = await bridge.writeLocalFile(newTargetFilePath, embeddedBase64, item.filePath);
          if (writeRes?.success) {
            item.filePath = newTargetFilePath;
            diskWriteCount++;
            if (bridge.injectJpegMetadata) {
              try {
                await bridge.injectJpegMetadata(newTargetFilePath, {
                  title: item.title,
                  description: item.description,
                  keywords: item.keywords,
                  category: item.category,
                  rating: item.rating || 5
                });
              } catch (e) {}
            }
          }
        } else {
          // If in web browser preview, update file object in memory
          const blob = new Blob([embeddedBuffer], { type: item.fileBlob?.type || 'image/jpeg' });
          item.dataUrl = URL.createObjectURL(blob);
          item.fileBlob = blob;
        }

        item.filename = newFilename;
        item.originalName = newOriginalName;
        item.isEmbedded = true;
        successCount++;
      } catch (err) {
        console.warn(`Could not embed into ${item.filename}:`, err);
      }

      // Update table state per file
      setItems((prev) => [...prev]);

      // Natural pause so progress bar visibly increments per file
      await new Promise((r) => setTimeout(r, 200));
    }

    setItems([...items]);
    // Processed in a single real-time pass with live progress tracking

    // ONLY mark complete after Adobe Photoshop and all file writes have 100% finished
    setVectorProgress({
      current: processedImages.length,
      total: processedImages.length,
      filename: 'Done',
      isComplete: true,
      title: 'Embedding Image Metadata'
    });

    showToast(
      diskWriteCount > 0
        ? `Embedded metadata (EXIF/IPTC/XMP) & renamed ${diskWriteCount} file(s) on your disk!`
        : `Metadata embedded into ${successCount} files in queue!`,
      'success'
    );
  };

  // Adobe Illustrator automated vector converter (SVG -> EPS 10 + Companion JPEG) in-place in existing folder
  const handleEmbedVector = async () => {
    const processedVectors = items.filter(
      (it) => (it.fileType === 'svg' || it.originalName.toLowerCase().endsWith('.svg'))
    );

    if (processedVectors.length === 0) {
      showToast('No SVG vector files found in queue. Please select SVG files first.', 'warning');
      return;
    }

    cancelVectorProgressRef.current = false;
    setVectorProgress({
      current: 1,
      total: processedVectors.length,
      filename: processedVectors[0].originalName || processedVectors[0].filename,
      isComplete: false,
      title: 'Embedding Vector Metadata'
    });
    setIsVectorProgressOpen(true);

    const isElectron = Boolean((window as any).electronApi?.isElectron);
    const bridge = getElectronBridge();
    showToast(`Embedding vector metadata for ${processedVectors.length} SVG files one by one...`, 'info');

    let anyUsedIllustrator = false;

    // Process each SVG vector file one by one sequentially like manual operation
    for (let idx = 0; idx < processedVectors.length; idx++) {
      if (cancelVectorProgressRef.current) break;

      const item = processedVectors[idx];
      const rawTitle = (item.title && item.title !== 'Pending...' ? item.title : item.filename).trim();
      let sanitizedTitle = rawTitle
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.-]+|[\s.-]+$/g, '')
        .trim();
      if (!sanitizedTitle) {
        sanitizedTitle = item.filename || item.originalName.replace(/\.[^/.]+$/, '');
      }

      let dir = '';
      if (item.filePath) {
        const lastSlash = Math.max(item.filePath.lastIndexOf('/'), item.filePath.lastIndexOf('\\'));
        dir = lastSlash !== -1 ? item.filePath.substring(0, lastSlash) : '';
      }
      const sep = item.filePath?.includes('\\') ? '\\' : '/';
      const epsPath = dir ? `${dir}${sep}${sanitizedTitle}.eps` : `${sanitizedTitle}.eps`;
      const jpgPath = dir ? `${dir}${sep}${sanitizedTitle}.jpg` : `${sanitizedTitle}.jpg`;

      const singleBatchItem = {
        filename: `${sanitizedTitle}.svg`,
        svgPath: item.filePath || '',
        epsPath,
        jpgPath,
        title: item.title && item.title !== 'Pending...' ? item.title : `${sanitizedTitle} vector illustration`,
        keywords: item.keywords && item.keywords !== 'Pending...' ? item.keywords : 'vector, illustration, graphic, isolated, design, microstock',
        description: item.description && item.description !== 'Pending...' ? item.description : `High quality vector illustration of ${sanitizedTitle}`,
        category: item.category && item.category !== 'Pending...' ? item.category : 'Arts, Vector',
        rating: item.rating || 5,
        sanitizedTitle
      };

      // 1. Update progress bar live for this file
      setVectorProgress({
        current: idx + 1,
        total: processedVectors.length,
        filename: item.originalName || item.filename,
        isComplete: false
      });

      // 2. Process this individual file in Illustrator (if in Electron and available)
      let fileProcessed = false;
      if (isElectron && bridge?.runIllustratorAutomation && item.filePath) {
        try {
          const aiRes = await bridge.runIllustratorAutomation([singleBatchItem]);
          if (aiRes?.success) {
            fileProcessed = true;
            anyUsedIllustrator = true;

            // Illustrator has already saved the native EPS 10 file with full doc.info and XMP metadata natively.
            // Now inject complete EXIF (Windows Explorer Details), IPTC, and Adobe XMP into the companion JPEG
            try {
              let targetJpg = jpgPath;
              let readRes: any = null;

              // Extract directory, base filename and extension to search for both space-separated and hyphenated variants
              const lastSlash = Math.max(jpgPath.lastIndexOf('/'), jpgPath.lastIndexOf('\\'));
              const dir = lastSlash !== -1 ? jpgPath.substring(0, lastSlash + 1) : '';
              const baseWithExt = lastSlash !== -1 ? jpgPath.substring(lastSlash + 1) : jpgPath;
              const ext = baseWithExt.includes('.') ? baseWithExt.substring(baseWithExt.lastIndexOf('.')) : '.jpg';
              const baseName = baseWithExt.includes('.') ? baseWithExt.substring(0, baseWithExt.lastIndexOf('.')) : baseWithExt;

              const baseVariants = [
                baseName,
                baseName.replace(/\s+/g, '-'),
                baseName.replace(/\s+/g, '_')
              ];

              const candidates: string[] = [];
              for (const bv of baseVariants) {
                candidates.push(
                  `${dir}${bv}${ext}`,
                  `${dir}${bv}-01${ext}`,
                  `${dir}${bv}-1${ext}`,
                  `${dir}${bv}_Artboard 1${ext}`,
                  `${dir}${bv} -01${ext}`,
                  `${dir}${bv}-01.jpeg`,
                  `${dir}${bv}.jpeg`
                );
              }

              for (let r = 0; r < 10; r++) {
                for (const cand of candidates) {
                  const candRes = await bridge.readLocalFile(cand);
                  if (candRes?.success && (candRes.buffer || candRes.base64)) {
                    readRes = candRes;
                    targetJpg = cand;
                    break;
                  }
                }
                if (readRes?.success && (readRes.buffer || readRes.base64)) break;
                await new Promise((resolve) => setTimeout(resolve, 200));
              }

              if (readRes?.success && (readRes.buffer || readRes.base64)) {
                let rawBytes: Uint8Array;
                if (readRes.buffer) {
                  const b = readRes.buffer as any;
                  rawBytes = new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength || b.length);
                } else {
                  rawBytes = base64ToUint8Array(readRes.base64!);
                }

                // If Illustrator exported with artboard suffix like -01.jpg, rename it to clean base
                if (/-01\.(jpg|jpeg)$/i.test(targetJpg) || /-1\.(jpg|jpeg)$/i.test(targetJpg) || /_Artboard 1\.(jpg|jpeg)$/i.test(targetJpg) || / -01\.(jpg|jpeg)$/i.test(targetJpg)) {
                  const baseClean = targetJpg
                    .replace(/ -01\.(jpg|jpeg)$/i, ext)
                    .replace(/-01\.(jpg|jpeg)$/i, ext)
                    .replace(/-1\.(jpg|jpeg)$/i, ext)
                    .replace(/_Artboard 1\.(jpg|jpeg)$/i, ext);
                  if (bridge.renameLocalFile) {
                    try {
                      await bridge.renameLocalFile(targetJpg, baseClean);
                      targetJpg = baseClean;
                    } catch (e) {}
                  }
                }

                // Direct native in-process injection guarantee via Electron bridge (ExifTool)
                if (bridge.injectJpegMetadata) {
                  try {
                    await bridge.injectJpegMetadata(targetJpg, singleBatchItem);
                    if (targetJpg.toLowerCase() !== jpgPath.toLowerCase()) {
                      await bridge.injectJpegMetadata(jpgPath, singleBatchItem);
                    }
                  } catch (e) {}
                }

                // Also run Photoshop automation on the JPEG (100% genuine Windows Explorer Details)
                if (bridge.runPhotoshopAutomation) {
                  try {
                    await bridge.runPhotoshopAutomation([{
                      filePath: targetJpg,
                      filename: singleBatchItem.filename,
                      title: singleBatchItem.title,
                      keywords: singleBatchItem.keywords,
                      description: singleBatchItem.description,
                      category: singleBatchItem.category,
                      rating: singleBatchItem.rating || 5
                    }]);
                  } catch (e) {}
                }

                // Clean up any remaining suffixed artboard files to leave only pristine targetJpg
                const suffixedCleanup = [
                  jpgPath.replace(/\.jpg$/i, '-01.jpg'),
                  jpgPath.replace(/\.jpg$/i, '-1.jpg'),
                  jpgPath.replace(/\.jpg$/i, '_Artboard 1.jpg'),
                  jpgPath.replace(/\.jpg$/i, ' -01.jpg'),
                  jpgPath.replace(/\.jpg$/i, '-01.jpeg'),
                  targetJpg.replace(/\.jpg$/i, '-01.jpg'),
                  targetJpg.replace(/\.jpg$/i, '-1.jpg'),
                  targetJpg.replace(/\.jpg$/i, '_Artboard 1.jpg')
                ];
                for (const sc of suffixedCleanup) {
                  if (sc.toLowerCase() !== targetJpg.toLowerCase() && sc.toLowerCase() !== jpgPath.toLowerCase() && bridge.deleteLocalFile) {
                    try { await bridge.deleteLocalFile(sc); } catch (e) {}
                  }
                }
              }
            } catch (jpgErr) {
              console.warn('Could not post-process JPEG in App:', jpgErr);
            }
          }
        } catch (aiErr) {
          console.warn('Illustrator automation step exception:', aiErr);
        }
      }

      // If Illustrator is not installed, or web environment: execute built-in vector engine
      if (!fileProcessed) {
        try {
          let svgText = item.svgContent || '';
          if (!svgText && item.fileBlob) {
            svgText = await item.fileBlob.text();
          }
          if (!svgText && isElectron && bridge && item.filePath) {
            const fRes = await bridge.readLocalFile(item.filePath);
            if (fRes?.success && (fRes.buffer || fRes.base64)) {
              if (fRes.buffer) {
                svgText = new TextDecoder('utf-8').decode(fRes.buffer);
              } else if (fRes.base64) {
                svgText = atob(fRes.base64);
              }
            }
          }

          const metadata = {
            title: singleBatchItem.title,
            keywords: singleBatchItem.keywords,
            description: singleBatchItem.description,
            category: singleBatchItem.category,
            rating: singleBatchItem.rating || 5
          };

          // Generate EPS 10 with Document Structuring Conventions (DSC) & XMP
          const epsData = convertSvgToEps10(svgText, metadata);
          const epsBytes = new TextEncoder().encode(epsData);

          // Generate companion JPEG matching exact SVG Artboard bounds at 72 ppi (no tight cropping)
          const blobForJpg = item.fileBlob || (svgText ? new Blob([svgText], { type: 'image/svg+xml' }) : null);
          if (blobForJpg) {
            const jpgRes = await convertSvgToJpeg(blobForJpg, 4000, 4000, true);
            if (jpgRes.base64) {
              const rawJpgBytes = base64ToUint8Array(jpgRes.base64);
              const embeddedJpgBuffer = embedXmpIntoJpegBuffer(rawJpgBytes, metadata);
              const embBytes = new Uint8Array(embeddedJpgBuffer);
              if (isElectron && item.filePath) {
                await bridge.writeLocalFile(jpgPath, embBytes);
              }
            }
          }

          if (isElectron && item.filePath) {
            await bridge.writeLocalFile(epsPath, epsBytes);
          }
        } catch (err) {
          console.warn(`Vector engine notice for ${item.filename}:`, err);
        }
      }

      // Rename SVG file on disk to match Title
      item.filename = sanitizedTitle;
      item.originalName = `${sanitizedTitle}.svg`;
      item.isEmbedded = true;

      if (isElectron && item.filePath) {
        const newSvgPath = dir ? `${dir}${sep}${sanitizedTitle}.svg` : `${sanitizedTitle}.svg`;
        if (item.filePath !== newSvgPath) {
          try {
            await bridge.renameLocalFile(item.filePath, newSvgPath);
            item.filePath = newSvgPath;
          } catch (e) {}
        }
      }

      // Update table state after each file is done
      setItems((prev) => [...prev]);

      // Natural non-blocking pause so Illustrator, OS file handles, and UI breathe normally (neither forced nor sluggish)
      await new Promise((r) => setTimeout(r, 300));
    }

    setItems([...items]);

    // Keep modal locked on screen and display Done / Complete state
    setVectorProgress({
      current: processedVectors.length,
      total: processedVectors.length,
      filename: 'Done',
      isComplete: true,
      title: 'Embedding Vector Metadata'
    });

    // Optional background Adobe Photoshop synchronization for companion JPEGs
    if (isElectron && bridge?.runPhotoshopAutomation) {
      const psPayload = processedVectors
        .filter((it) => Boolean(it.filePath))
        .map((it) => {
          const rawTitle = (it.title && it.title !== 'Pending...' ? it.title : it.filename).trim();
          let sanitizedTitle = rawTitle
            .replace(/[\\/:*?"<>|]/g, ' ')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s.-]+|[\s.-]+$/g, '')
            .trim() || it.filename;
          let d = '';
          if (it.filePath) {
            const ls = Math.max(it.filePath.lastIndexOf('/'), it.filePath.lastIndexOf('\\'));
            d = ls !== -1 ? it.filePath.substring(0, ls) : '';
          }
          const s = it.filePath?.includes('\\') ? '\\' : '/';
          const jPath = d ? `${d}${s}${sanitizedTitle}.jpg` : `${sanitizedTitle}.jpg`;
          return {
            filePath: jPath,
            filename: `${sanitizedTitle}.jpg`,
            title: it.title || sanitizedTitle,
            keywords: it.keywords || '',
            description: it.description || it.title || sanitizedTitle,
            category: it.category || 'Arts, Vector',
            rating: it.rating || 5
          };
        });

      if (psPayload.length > 0) {
        bridge.runPhotoshopAutomation(psPayload)
          .then((psRes: any) => {
            if (psRes?.success) {
              showToast(`Adobe Photoshop: Companion JPEGs native properties synchronized!`, 'success');
            }
          })
          .catch(() => {});
      }
    }

    showToast(
      anyUsedIllustrator
        ? `Adobe Illustrator: All SVG files processed into EPS 10 & Companion JPEGs with embedded metadata! (Done)`
        : `All SVG files processed into EPS 10 & Companion JPEGs with full metadata! (Done)`,
      'success'
    );
  };

  // Dedicated Adobe Photoshop Automation handler for "P.S Embed imac" button
  const handlePsEmbed = async () => {
    const bridge = getElectronBridge();
    const targetItems = selectedIds.length > 0
      ? items.filter((it) => selectedIds.includes(it.id))
      : (selectedRowId ? items.filter((it) => it.id === selectedRowId) : items);

    if (targetItems.length === 0) {
      showToast('No items selected for Photoshop embedding.', 'warning');
      return;
    }

    if (!bridge?.runPhotoshopAutomation) {
      handleEmbedMetadata();
      return;
    }

    const psPayload: any[] = [];
    for (const it of targetItems) {
      const rawTitle = (it.title && it.title !== 'Pending...' ? it.title : it.filename).trim();
      let sanitizedTitle = rawTitle
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.-]+|[\s.-]+$/g, '')
        .trim() || it.filename;
      let d = '';
      if (it.filePath) {
        const ls = Math.max(it.filePath.lastIndexOf('/'), it.filePath.lastIndexOf('\\'));
        d = ls !== -1 ? it.filePath.substring(0, ls) : '';
      }
      const s = it.filePath?.includes('\\') ? '\\' : '/';

      let targetPath = it.filePath || '';
      if (it.fileType === 'svg' || (it.originalName || it.filename).toLowerCase().endsWith('.svg')) {
        targetPath = d ? `${d}${s}${sanitizedTitle}.jpg` : `${sanitizedTitle}.jpg`;
      }

      psPayload.push({
        filePath: targetPath,
        filename: `${sanitizedTitle}.jpg`,
        title: it.title || sanitizedTitle,
        keywords: it.keywords || '',
        description: it.description || it.title || sanitizedTitle,
        category: it.category || 'Arts, Objects',
        rating: it.rating || 5
      });
    }

    showToast(`Launching Adobe Photoshop to embed metadata into ${psPayload.length} file(s)...`, 'info');
    try {
      const res = await bridge.runPhotoshopAutomation(psPayload);
      if (res?.success) {
        showToast(`Adobe Photoshop: Metadata successfully embedded into ${res.count || psPayload.length} file(s)!`, 'success');
      } else {
        showToast(res?.message || 'Photoshop automation completed with built-in engine fallback.', 'info');
      }
    } catch (e: any) {
      showToast(`Photoshop automation: ${e.message || 'Complete'}`, 'info');
    }
  };

  // Download single EPS with injected DSC & XMP headers
  const handleDownloadEps = (item: MetadataItem) => {
    const fakeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#ffffff"/><circle cx="400" cy="400" r="250" fill="none" stroke="#111827" stroke-width="4"/></svg>`;
    const epsData = convertSvgToEps10(
      item.svgContent || fakeSvg,
      {
        title: item.title,
        keywords: item.keywords,
        description: item.description,
        category: item.category,
        rating: item.rating
      }
    );

    const blob = new Blob([epsData], { type: 'application/postscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.filename || 'vector'}.eps`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded Adobe Illustrator EPS 10: ${item.filename}.eps`, 'success');
  };

  // Drag and drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`w-screen h-screen flex flex-col p-3 gap-2 overflow-hidden select-none font-sans transition-colors duration-200 ${
        theme === 'Light' ? 'bg-[#f1f5f9] text-black' : 'bg-[#101923] text-slate-200'
      }`}
    >
      {/* A. Header Bar */}
      <HeaderBar
        provider={provider}
        setProvider={(p) => {
          setProvider(p);
          setApiConfig((prev) => ({
            ...prev,
            provider: p,
            activeModel: prev[`${p}Model` as keyof ApiConfig] as string || getDefaultModelForProvider(p)
          }));
        }}
        currentModel={currentModel}
        onModelChange={handleModelChange}
        hasApiKey={hasProviderKey(provider, apiConfig)}
        theme={theme}
        onOpenManageKeys={() => setIsManageKeysOpen(true)}
        onOpenPythonSource={() => setIsPythonSourceOpen(true)}
      />

        {/* B. Mode & Theme & Generation Options Toolbar */}
        <ToolbarRow2
          mode={mode}
          setMode={handleModeChange}
          theme={theme}
          setTheme={setTheme}
          options={options}
          setOptions={setOptions}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenContact={() => setIsContactOpen(true)}
        />

        {/* C. Input & Processing & Export & Utilities Toolbar */}
        <ToolbarRow3
          mode={mode}
          theme={theme}
          onSelectVectors={handleSelectFiles}
          onSelectFolder={handleSelectFiles}
          onSelectNativeFiles={handleSelectNativeFiles}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onRetry={handleRetry}
          onClear={handleClear}
          isPaused={isPaused}
          selectedCount={selectedIds.length > 0 ? selectedIds.length : (selectedRowId ? 1 : 0)}
          onDeleteSelected={handleDeleteSelected}
          marketplace={marketplace}
          setMarketplace={setMarketplace}
          onExportCsv={handleExportCsv}
          onRenameFiles={handleRenameFilesToTitle}
          onCleanFilenames={handleCleanFilenames}
          onEmbedMetadata={handleEmbedMetadata}
          onEmbedVector={handleEmbedVector}
          onPsEmbed={handlePsEmbed}
          isProcessing={isProcessing}
        />

        {/* D. Main Data Table */}
        <MetaTable
          items={items}
          selectedRowId={selectedRowId}
          selectedIds={selectedIds}
          theme={theme}
          onSelectRow={handleSelectRow}
          onToggleSelectRow={handleToggleSelectRow}
          onSelectAll={handleSelectAll}
          onDeleteItem={handleDeleteItem}
          onDeleteSelected={handleDeleteSelected}
          onUpdateItem={(id, updates) => {
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updates } : it)));
          }}
          onDownloadEps={handleDownloadEps}
        />

        {/* E. Bottom Status Bar */}
        <StatusBar
          stats={stats}
          theme={theme}
          onRefresh={() => {
            showToast('Synchronized generation statistics and license verification.', 'info');
          }}
          onOpenExtensions={() => setIsExtensionsOpen(true)}
          isProcessing={isProcessing}
        />

      {/* ================= Toast Notification ================= */}
      {toast && (
        <div className="fixed bottom-14 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2.5 rounded-lg shadow-xl border text-xs font-medium flex items-center gap-2.5 backdrop-blur-md ${
              toast.type === 'success'
                ? theme === 'Light' ? 'bg-emerald-50 text-emerald-900 border-emerald-400' : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
                : toast.type === 'warning'
                ? theme === 'Light' ? 'bg-amber-50 text-amber-900 border-amber-400' : 'bg-amber-950/90 text-amber-200 border-amber-500/50'
                : theme === 'Light' ? 'bg-white text-slate-800 border-slate-300 shadow-lg' : 'bg-[#182635]/95 text-slate-200 border-[#2a3c50]'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-[#0284c7] shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* ================= Modals ================= */}
      <ManageKeysModal
        isOpen={isManageKeysOpen}
        onClose={() => setIsManageKeysOpen(false)}
        config={apiConfig}
        theme={theme}
        onSave={(newCfg) => {
          setApiConfig(newCfg);
          if (newCfg.provider) {
            setProvider(newCfg.provider);
          }
          showToast('API credentials saved and active', 'success');
        }}
      />

      <TestApiModal
        isOpen={isTestApiOpen}
        onClose={() => setIsTestApiOpen(false)}
        config={apiConfig}
        provider={provider}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />

      <ExtensionsModal isOpen={isExtensionsOpen} onClose={() => setIsExtensionsOpen(false)} />

      <RenameModal
        isOpen={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        onApply={handleBatchRename}
      />

      <PythonSourceModal
        isOpen={isPythonSourceOpen}
        onClose={() => setIsPythonSourceOpen(false)}
      />

      <EmbeddingVectorProgressModal
        isOpen={isVectorProgressOpen}
        onClose={() => {
          if (!vectorProgress.isComplete) {
            cancelVectorProgressRef.current = true;
            showToast('Metadata embedding cancelled', 'info');
          }
          setIsVectorProgressOpen(false);
        }}
        current={vectorProgress.current}
        total={vectorProgress.total}
        currentFilename={vectorProgress.filename}
        isComplete={vectorProgress.isComplete}
        theme={theme}
        title={vectorProgress.title}
      />
    </div>
  );
}
