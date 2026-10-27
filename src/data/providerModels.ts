export interface ModelOption {
  id: string;
  name: string;
  tag?: string;
}

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Fast Multimodal Vision (Recommended)' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: 'High Speed & Efficiency Vision' },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: 'High Intelligence Vision' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', tag: 'High Stability Vision' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', tag: 'Flagship Omni Vision (Recommended)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tag: 'Fast & Smart Vision' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo Vision', tag: 'High Context' }
  ],
  openrouter: [
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash Vision', tag: 'Fast Vision (Recommended)' },
    { id: 'openai/gpt-4o', name: 'GPT-4o Vision', tag: 'Omni Multimodal' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini Vision', tag: 'Fast & Smart' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet Vision', tag: 'Top Quality' },
    { id: 'meta-llama/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision', tag: 'Fast Open Vision' },
    { id: 'meta-llama/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision', tag: 'High-Res Vision' },
    { id: 'qwen/qwen-2.5-vl-72b-instruct', name: 'Qwen 2.5 VL 72B Vision', tag: 'Multilingual Vision' },
    { id: 'mistralai/pixtral-large-2411', name: 'Pixtral Large Vision', tag: 'Mistral Multimodal' }
  ],
  claude: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', tag: 'Hybrid Reasoning Vision (Recommended)' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tag: 'Top Quality Vision' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tag: 'Super Fast Vision' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tag: 'Complex Vision Tasks' }
  ],
  groq: [
    { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision', tag: 'Ultra-Fast Vision (Recommended)' },
    { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', tag: 'High-Res Vision' }
  ],
  mistral: [
    { id: 'pixtral-large-latest', name: 'Pixtral Large', tag: 'Multimodal Vision (Recommended)' }
  ]
};

export function normalizeProviderKey(provider: string): string {
  const p = (provider || '').toLowerCase().trim();
  if (p.includes('gemini') || p.includes('google')) return 'gemini';
  if (p.includes('openrouter')) return 'openrouter';
  if (p.includes('open') || p.includes('chatgpt')) return 'openai';
  if (p.includes('claude') || p.includes('anthropic')) return 'claude';
  if (p.includes('groq')) return 'groq';
  if (p.includes('mistral') || p.includes('pixtral')) return 'mistral';
  return 'gemini';
}

export function getModelsForProvider(provider: string): ModelOption[] {
  const key = normalizeProviderKey(provider);
  return PROVIDER_MODELS[key] || PROVIDER_MODELS['gemini'];
}

export function getDefaultModelForProvider(provider: string): string {
  const models = getModelsForProvider(provider);
  return models[0]?.id || '';
}
