export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
export type OutputFormat = 'png' | 'jpeg' | 'webp';
export type ModelId = 'stable-image-core' | 'stable-image-ultra' | 'dall-e-3' | 'dall-e-2';
export type ProviderType = 'openai' | 'stability';

export interface GenerationResult {
  imageBase64: string;
  mimeType: string;
  seed?: number;
  model: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  outputFormat?: OutputFormat;
  originalImageBase64?: string;
  productPreserved: boolean;
  workflowUsed?: string;
  debugInfo?: {
    workflow: string;
    endpointCalled: string;
    durationMs: number;
    pollCount?: number;
  };
}

