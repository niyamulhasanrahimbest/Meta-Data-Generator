export type ProviderType =
  | 'gemini'
  | 'openai'
  | 'openrouter'
  | 'claude'
  | 'groq'
  | 'mistral';

export type ModeType = 'Image' | 'Vector' | 'Video';
export type ThemeType = 'Dark' | 'Light';

export interface MetadataItem {
  id: string;
  filename: string;
  originalName: string;
  title: string;
  keywords: string;
  description: string;
  category: string;
  rating: number; // 0 to 5
  status: 'pending' | 'processing' | 'processed' | 'error';
  errorMessage?: string;
  fileType: 'svg' | 'image' | 'video' | 'eps';
  svgContent?: string;
  dataUrl?: string;
  fileSize?: number;
  fileBlob?: File | Blob;
  filePath?: string;
  isEmbedded?: boolean;
  subjectHint?: string;
}

export interface GenerationOptions {
  description: boolean;
  filenameHint: boolean;
  autoEmbed: boolean;
  pngIsolated: boolean;
  refinePngBg: boolean;
}

export interface StoredApiKey {
  id: string;
  label: string;
  provider: string;
  model?: string;
  rawKey: string;
  maskedKey: string;
  status: 'Valid' | 'Invalid';
  lastUsed: string;
  isActive: boolean;
}

export interface ApiConfig {
  provider: ProviderType;
  geminiKey: string;
  openaiKey: string;
  openrouterKey?: string;
  claudeKey?: string;
  groqKey: string;
  mistralKey?: string;
  geminiModel: string;
  openaiModel?: string;
  openrouterModel?: string;
  claudeModel?: string;
  groqModel: string;
  mistralModel?: string;
  activeModel?: string;
  savedKeys?: StoredApiKey[];
}

export interface ProcessingStats {
  selected: number;
  processed: number;
  remaining: number;
  elapsedSeconds: number;
  totalSeconds: number;
  last24Hours: number;
  allTime: number;
  licenseExpires: string;
  licenseDaysLeft: number;
  licenseActive: boolean;
}
