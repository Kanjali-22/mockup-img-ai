import { Router, Request, Response, NextFunction } from 'express';
import { getProviderStatus, getSupportedModels } from '../services/imageProvider';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req: Request, res: Response) => {
  const providerStatus = getProviderStatus();

  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      api: {
        activeProvider: providerStatus.activeProvider,
        providerConfigured: providerStatus.configured,
        keyHint: providerStatus.keyHint,
        stabilityConfigured: providerStatus.stabilityConfigured,
        stabilityKeyHint: providerStatus.stabilityKeyHint,
        openaiConfigured: providerStatus.openaiConfigured,
        openaiKeyHint: providerStatus.openaiKeyHint,
        conflict: providerStatus.conflict,
        configError: providerStatus.error || null,
      },
      limits: {
        maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
      },
    },
  });
});

healthRoutes.get('/models', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = getSupportedModels();
    res.json({
      success: true,
      data: {
        models,
      },
    });
  } catch (err) {
    next(err);
  }
});
