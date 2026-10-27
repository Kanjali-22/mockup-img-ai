import { createError } from '../middleware/errorHandler';
import type { ModelId, ProviderType } from '../types';

export interface ProviderModelInfo {
  id: ModelId;
  name: string;
  provider: ProviderType;
  description: string;
  creditCost: string;
  supportedAspectRatios: string[];
  supportsNegativePrompt: boolean;
  supportsStrength: boolean;
  supportsOutputFormat: boolean;
  supportsSeed: boolean;
}

export const PROVIDER_MODELS: Record<ProviderType, ProviderModelInfo[]> = {
  stability: [
    {
      id: 'stable-image-core',
      name: 'Stable Image Core',
      provider: 'stability',
      description: 'Fast, cost-effective product scene generation.',
      creditCost: 'Stability AI credits',
      supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'],
      supportsNegativePrompt: true,
      supportsStrength: true,
      supportsOutputFormat: true,
      supportsSeed: true,
    },
    {
      id: 'stable-image-ultra',
      name: 'Stable Image Ultra',
      provider: 'stability',
      description: 'State-of-the-art photorealism. Best quality results.',
      creditCost: 'Stability AI credits',
      supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'],
      supportsNegativePrompt: true,
      supportsStrength: true,
      supportsOutputFormat: true,
      supportsSeed: true,
    },
  ],
  openai: [
    {
      id: 'dall-e-3',
      name: 'DALL·E 3',
      provider: 'openai',
      description: 'State-of-the-art scene generation with vivid details.',
      creditCost: 'OpenAI API billing',
      supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'],
      supportsNegativePrompt: false,
      supportsStrength: false,
      supportsOutputFormat: true,
      supportsSeed: false,
    },
    {
      id: 'dall-e-2',
      name: 'DALL·E 2',
      provider: 'openai',
      description: 'Fast, standard photorealistic scene generation.',
      creditCost: 'OpenAI API billing',
      supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'],
      supportsNegativePrompt: false,
      supportsStrength: false,
      supportsOutputFormat: true,
      supportsSeed: false,
    },
  ],
};

/**
 * Creates a safe masked hint of an API key (e.g., "sk-...1234").
 * Never exposes the raw key.
 */
export function maskApiKey(key: string | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

/**
 * Validates environment variables and resolves the single active AI provider.
 * 
 * Rules:
 * - OpenAI only when OPENAI_API_KEY is configured and STABILITY_API_KEY is absent.
 * - Stability only when STABILITY_API_KEY is configured and OPENAI_API_KEY is absent.
 * - Reject both configured (500 conflict error).
 * - Reject both missing (503 missing key error).
 */
export function getActiveProvider(): ProviderType {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const stabilityKey = process.env.STABILITY_API_KEY?.trim();

  const hasOpenai = Boolean(openaiKey && openaiKey.length > 0);
  const hasStability = Boolean(stabilityKey && stabilityKey.length > 0);

  if (hasOpenai && hasStability) {
    throw createError(
      'Conflicting provider configuration: Both OPENAI_API_KEY and STABILITY_API_KEY are configured in server/.env. Please configure exactly one provider key.',
      500,
      'PROVIDER_CONFIG_CONFLICT'
    );
  }

  if (!hasOpenai && !hasStability) {
    throw createError(
      'No image generation provider configured. Please configure either OPENAI_API_KEY or STABILITY_API_KEY in server/.env.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  return hasOpenai ? 'openai' : 'stability';
}

/**
 * Returns safe diagnostic provider status without throwing.
 */
export function getProviderStatus() {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const stabilityKey = process.env.STABILITY_API_KEY?.trim();

  const hasOpenai = Boolean(openaiKey && openaiKey.length > 0);
  const hasStability = Boolean(stabilityKey && stabilityKey.length > 0);

  if (hasOpenai && hasStability) {
    return {
      activeProvider: null,
      configured: false,
      conflict: true,
      error: 'Conflicting configuration: Both OPENAI_API_KEY and STABILITY_API_KEY are configured. Please set only one.',
      keyHint: null,
      openaiConfigured: true,
      stabilityConfigured: true,
      openaiKeyHint: maskApiKey(openaiKey),
      stabilityKeyHint: maskApiKey(stabilityKey),
    };
  }

  if (hasOpenai) {
    return {
      activeProvider: 'openai' as ProviderType,
      configured: true,
      conflict: false,
      keyHint: maskApiKey(openaiKey),
      openaiConfigured: true,
      stabilityConfigured: false,
      openaiKeyHint: maskApiKey(openaiKey),
      stabilityKeyHint: null,
    };
  }

  if (hasStability) {
    return {
      activeProvider: 'stability' as ProviderType,
      configured: true,
      conflict: false,
      keyHint: maskApiKey(stabilityKey),
      openaiConfigured: false,
      stabilityConfigured: true,
      openaiKeyHint: null,
      stabilityKeyHint: maskApiKey(stabilityKey),
    };
  }

  return {
    activeProvider: null,
    configured: false,
    conflict: false,
    error: 'No image generation provider configured. Please configure OPENAI_API_KEY or STABILITY_API_KEY in server/.env.',
    keyHint: null,
    openaiConfigured: false,
    stabilityConfigured: false,
    openaiKeyHint: null,
    stabilityKeyHint: null,
  };
}

/**
 * Returns the models supported by the currently active provider.
 */
export function getSupportedModels(): ProviderModelInfo[] {
  const provider = getActiveProvider();
  return PROVIDER_MODELS[provider] || [];
}

/**
 * Resolves and validates a model ID for the active provider.
 * If a model from another provider is provided, either maps it to the provider's default
 * or throws an error if explicitly requested.
 */
export function resolveModelForProvider(requestedModel: ModelId, provider: ProviderType): ModelId {
  const modelsForProvider = PROVIDER_MODELS[provider].map((m) => m.id);

  if (modelsForProvider.includes(requestedModel)) {
    return requestedModel;
  }

  // If a Stability model was sent while OpenAI is active, safely map to DALL-E 3
  if (provider === 'openai') {
    return 'dall-e-3';
  }

  // If an OpenAI model was sent while Stability is active, safely map to Stable Image Core
  return 'stable-image-core';
}
