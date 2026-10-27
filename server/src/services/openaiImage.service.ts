import OpenAI from 'openai';
import { createError } from '../middleware/errorHandler';
import type { AspectRatio, ModelId, OutputFormat } from '../types';

export interface OpenAIBackgroundParams {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  model: ModelId;
  seed?: number;
  outputFormat?: OutputFormat;
}

/**
 * Maps the standard canvas aspect ratio to supported OpenAI image dimensions.
 * DALL-E 3 supports: 1024x1024 (square), 1024x1792 (portrait), 1792x1024 (landscape).
 * DALL-E 2 supports: 1024x1024, 512x512, 256x256.
 */
function resolveOpenAIDimensions(
  model: string,
  aspectRatio: AspectRatio
): '1024x1024' | '1024x1792' | '1792x1024' {
  if (model === 'dall-e-2') {
    return '1024x1024';
  }

  // DALL-E 3
  switch (aspectRatio) {
    case '9:16':
    case '3:4':
      return '1024x1792';
    case '16:9':
    case '21:9':
    case '4:3':
      return '1792x1024';
    case '1:1':
    default:
      return '1024x1024';
  }
}

/**
 * Transforms the user scene prompt into a pristine background generation prompt for OpenAI.
 * Explicitly instructs the model to leave an empty center podium/stage for product compositing
 * and not to generate any actual bottles, cans, shoes, or packaging.
 */
function buildOpenAIBackgroundPrompt(userPrompt: string): string {
  const cleanPrompt = `${userPrompt.trim()}, empty display pedestal, pristine product showcase stage, professional studio environment, commercial advertising background, no products, no bottles, no packaging, completely clear center area`;
  return cleanPrompt;
}

/**
 * Generates a background scene using the official OpenAI Images API.
 */
export async function generateOpenAIBackgroundScene(
  params: OpenAIBackgroundParams
): Promise<{ buffer: Buffer; revisedPrompt?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw createError(
      'OpenAI API key is not configured. Set OPENAI_API_KEY in server/.env',
      503,
      'API_KEY_MISSING'
    );
  }

  const model = params.model === 'dall-e-2' ? 'dall-e-2' : 'dall-e-3';
  const size = resolveOpenAIDimensions(model, params.aspectRatio);
  const prompt = buildOpenAIBackgroundPrompt(params.prompt);

  const openai = new OpenAI({
    apiKey,
    timeout: 120_000,
  });

  try {
    const response = await openai.images.generate({
      model,
      prompt,
      n: 1,
      size,
      quality: 'standard',
      response_format: 'b64_json',
    });

    const imageData = response.data?.[0];
    if (!imageData || !imageData.b64_json) {
      throw createError(
        'OpenAI returned success but no image data was found.',
        502,
        'PROVIDER_NO_IMAGE'
      );
    }

    const buffer = Buffer.from(imageData.b64_json, 'base64');
    return {
      buffer,
      revisedPrompt: imageData.revised_prompt,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as { status?: number; message?: string; code?: string; type?: string };
      const status = apiErr.status || 500;
      const message = apiErr.message || 'OpenAI error';

      if (status === 401) {
        throw createError('Invalid OpenAI API key. Please check your OPENAI_API_KEY in server/.env.', 401, 'INVALID_API_KEY');
      }

      if (status === 429) {
        if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('billing')) {
          throw createError('Insufficient OpenAI credits or quota exceeded. Please check your OpenAI account billing.', 402, 'INSUFFICIENT_CREDITS');
        }
        throw createError('OpenAI rate limit exceeded. Please wait a moment before trying again.', 429, 'PROVIDER_RATE_LIMIT');
      }

      if (status === 400) {
        throw createError(`OpenAI request error: ${message}`, 400, 'INVALID_REQUEST');
      }

      throw createError(`OpenAI image generation failed (HTTP ${status}): ${message}`, status >= 500 ? 502 : 400, 'PROVIDER_ERROR');
    }

    if (err instanceof Error) {
      if (err.message.toLowerCase().includes('timeout') || err.name === 'APIConnectionTimeoutError') {
        throw createError('OpenAI generation timed out.', 504, 'TIMEOUT');
      }
      if (err.name === 'APIConnectionError') {
        throw createError('Network error connecting to OpenAI API.', 503, 'NETWORK_ERROR');
      }
      throw createError(err.message, 502, 'PROVIDER_ERROR');
    }

    throw createError('Unexpected error during OpenAI generation.', 500, 'INTERNAL_ERROR');
  }
}
