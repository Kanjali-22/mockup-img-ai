import fs from 'fs';
import { GenerateRequest } from '../validators/generate.validator';
import { createError } from '../middleware/errorHandler';
import { getActiveProvider, getSupportedModels, resolveModelForProvider } from './imageProvider';
import { replaceBackgroundAndRelight } from './relight.service';
import { removeBackground } from './backgroundRemoval.service';
import { generateStabilityBackgroundScene } from './stabilityImage.service';
import { generateOpenAIBackgroundScene } from './openaiImage.service';
import { compositeProductOntoBackground } from './compositing.service';
import type { GenerationResult } from '../types';

export { getSupportedModels };

/**
 * Main entry point for AI Product Mockup generation.
 * Automatically selects the active provider based on environment configuration.
 *
 * Supported providers:
 * - OpenAI (DALL-E 3, DALL-E 2) + Product segmentation & Sharp compositing
 * - Stability AI (Stable Image Core, Stable Image Ultra) + Relight or Compositing
 */
export async function generateImage(
  filePath: string,
  params: GenerateRequest
): Promise<GenerationResult> {
  // Validate provider configuration (will throw 500 on conflict, 503 if missing)
  const provider = getActiveProvider();
  const startTime = Date.now();
  const resolvedModel = resolveModelForProvider(params.model, provider);

  console.log(`[MOCKUP-STUDIO] Active Provider: '${provider}' | Model: '${resolvedModel}'`);

  if (provider === 'openai') {
    return executeOpenAIWorkflow(filePath, params, resolvedModel, startTime);
  }

  // Stability AI Provider
  return executeStabilityWorkflow(filePath, params, resolvedModel, startTime);
}

/**
 * Executes OpenAI image generation workflow with product segmentation and Sharp compositing.
 */
async function executeOpenAIWorkflow(
  filePath: string,
  params: GenerateRequest,
  resolvedModel: string,
  startTime: number
): Promise<GenerationResult> {
  console.log(`[MOCKUP-STUDIO] Step 1 (OpenAI): Segmenting product (removeBackground: ${params.removeBackground})...`);
  const originalBuffer = fs.readFileSync(filePath);

  let transparentProductBuffer: Buffer;
  if (params.removeBackground) {
    transparentProductBuffer = await removeBackground(originalBuffer);
  } else {
    transparentProductBuffer = originalBuffer;
  }

  console.log(`[MOCKUP-STUDIO] Step 2 (OpenAI): Generating background scene with prompt: "${params.prompt}"...`);
  const bgResult = await generateOpenAIBackgroundScene({
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    aspectRatio: params.aspectRatio,
    model: resolvedModel as any,
    seed: params.seed,
    outputFormat: params.outputFormat,
  });

  console.log(`[MOCKUP-STUDIO] Step 3 (OpenAI): Compositing product onto background with Sharp...`);
  const compositeRes = await compositeProductOntoBackground(
    bgResult.buffer,
    transparentProductBuffer,
    {
      aspectRatio: params.aspectRatio,
      productScale: params.productScale,
      positionX: params.positionX,
      positionY: params.positionY,
      contactShadow: params.contactShadow,
      colorMatch: params.colorMatch,
      outputFormat: params.outputFormat,
    }
  );

  const durationMs = Date.now() - startTime;
  console.log(`[MOCKUP-STUDIO] OpenAI workflow complete in ${durationMs}ms`);

  return {
    imageBase64: compositeRes.imageBuffer.toString('base64'),
    mimeType: compositeRes.mimeType,
    seed: params.seed,
    model: resolvedModel,
    prompt: params.prompt,
    workflowUsed: 'remove-background-and-composite',
    productPreserved: true,
    debugInfo: {
      workflow: 'remove-background-and-composite',
      endpointCalled: `OpenAI API (images.generate / ${resolvedModel}) + Sharp Composite`,
      durationMs,
    },
  };
}

/**
 * Executes Stability AI workflow (Relight or Compositing).
 */
async function executeStabilityWorkflow(
  filePath: string,
  params: GenerateRequest,
  resolvedModel: string,
  startTime: number
): Promise<GenerationResult> {
  const selectedWorkflow = params.workflow || 'auto';

  // 1. Dedicated Relight Workflow
  if (selectedWorkflow === 'relight') {
    console.log(`[MOCKUP-STUDIO] Executing 'replace-background-and-relight' workflow...`);
    const relightRes = await replaceBackgroundAndRelight(filePath, params);
    return {
      imageBase64: relightRes.imageBase64,
      mimeType: relightRes.mimeType,
      seed: relightRes.seed,
      model: relightRes.model,
      prompt: relightRes.prompt,
      workflowUsed: 'replace-background-and-relight',
      productPreserved: true,
      debugInfo: {
        workflow: 'replace-background-and-relight',
        endpointCalled: 'https://api.stability.ai/v2beta/stable-image/edit/replace-background-and-relight',
        durationMs: relightRes.durationMs,
        pollCount: relightRes.pollCount,
      },
    };
  }

  // 2. Dedicated Compositing Workflow
  if (selectedWorkflow === 'composite') {
    return executeStabilityCompositingWorkflow(filePath, params, resolvedModel, startTime);
  }

  // 3. Auto Workflow: Try Relight first, fallback to Compositing on error
  console.log(`[MOCKUP-STUDIO] Executing 'auto' workflow: attempting relight first...`);
  try {
    const relightRes = await replaceBackgroundAndRelight(filePath, params);
    return {
      imageBase64: relightRes.imageBase64,
      mimeType: relightRes.mimeType,
      seed: relightRes.seed,
      model: relightRes.model,
      prompt: relightRes.prompt,
      workflowUsed: 'replace-background-and-relight',
      productPreserved: true,
      debugInfo: {
        workflow: 'replace-background-and-relight',
        endpointCalled: 'https://api.stability.ai/v2beta/stable-image/edit/replace-background-and-relight',
        durationMs: relightRes.durationMs,
        pollCount: relightRes.pollCount,
      },
    };
  } catch (err) {
    console.warn(
      `[MOCKUP-STUDIO] Relight workflow failed, falling back to Compositing workflow:`,
      (err as Error).message
    );
    return executeStabilityCompositingWorkflow(filePath, params, resolvedModel, startTime);
  }
}

async function executeStabilityCompositingWorkflow(
  filePath: string,
  params: GenerateRequest,
  resolvedModel: string,
  startTime: number
): Promise<GenerationResult> {
  console.log(`[MOCKUP-STUDIO] Step 1 (Stability): Processing product image (removeBackground: ${params.removeBackground})...`);
  const originalBuffer = fs.readFileSync(filePath);

  let transparentProductBuffer: Buffer;
  if (params.removeBackground) {
    transparentProductBuffer = await removeBackground(originalBuffer);
  } else {
    transparentProductBuffer = originalBuffer;
  }

  console.log(`[MOCKUP-STUDIO] Step 2 (Stability): Generating background scene with prompt: "${params.prompt}"...`);
  const bgResult = await generateStabilityBackgroundScene({
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    aspectRatio: params.aspectRatio,
    model: resolvedModel as any,
    seed: params.seed,
    outputFormat: params.outputFormat,
  });

  console.log(`[MOCKUP-STUDIO] Step 3 (Stability): Compositing product onto background with Sharp...`);
  const compositeRes = await compositeProductOntoBackground(
    bgResult.buffer,
    transparentProductBuffer,
    {
      aspectRatio: params.aspectRatio,
      productScale: params.productScale,
      positionX: params.positionX,
      positionY: params.positionY,
      contactShadow: params.contactShadow,
      colorMatch: params.colorMatch,
      outputFormat: params.outputFormat,
    }
  );

  const durationMs = Date.now() - startTime;
  console.log(`[MOCKUP-STUDIO] Stability compositing complete in ${durationMs}ms`);

  return {
    imageBase64: compositeRes.imageBuffer.toString('base64'),
    mimeType: compositeRes.mimeType,
    seed: bgResult.seed,
    model: resolvedModel,
    prompt: params.prompt,
    workflowUsed: 'remove-background-and-composite',
    productPreserved: true,
    debugInfo: {
      workflow: 'remove-background-and-composite',
      endpointCalled: `https://api.stability.ai/v2beta/stable-image/generate + remove-background`,
      durationMs,
    },
  };
}

/**
 * Safely removes a temporary file from disk.
 */
export function cleanupFile(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    console.warn(`Failed to clean up temp file: ${filePath}`);
  }
}
