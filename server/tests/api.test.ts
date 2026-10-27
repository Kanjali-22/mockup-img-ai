import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { getActiveProvider, getProviderStatus, getSupportedModels } from '../src/services/imageProvider';
import { removeBackgroundIndependent } from '../src/services/backgroundRemoval.service';
import sharp from 'sharp';

// Mock generation service to avoid calling real paid APIs during HTTP endpoint tests
vi.mock('../src/services/generation.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/services/generation.service');
  return {
    ...actual,
    generateImage: vi.fn(),
    cleanupFile: vi.fn(),
  };
});

// Also mock stability.service since it re-exports generation.service
vi.mock('../src/services/stability.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/services/stability.service');
  return {
    ...actual,
    generateImage: vi.fn(),
    cleanupFile: vi.fn(),
  };
});

import { generateImage, cleanupFile } from '../src/services/generation.service';

const mockedGenerateImage = vi.mocked(generateImage);
const mockedCleanupFile = vi.mocked(cleanupFile);

describe('API & Provider Test Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // 1. Health endpoint
  describe('1. Health Endpoint (GET /api/health)', () => {
    it('returns health status ok with safe metadata', async () => {
      process.env.STABILITY_API_KEY = 'sk-mock-stability-key-1234';
      delete process.env.OPENAI_API_KEY;

      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.api.activeProvider).toBe('stability');
      expect(res.body.data.api.providerConfigured).toBe(true);
      expect(res.body.data.api.keyHint).toBe('sk-...1234');
      // Never expose the actual key
      expect(JSON.stringify(res.body)).not.toContain('sk-mock-stability-key-1234');
    });

    it('does not expose OpenAI or Stability secret keys in health responses', async () => {
      process.env.OPENAI_API_KEY = 'sk-super-secret-openai-key-5678';
      delete process.env.STABILITY_API_KEY;

      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('sk-super-secret-openai-key-5678');
      expect(res.body.data.api.activeProvider).toBe('openai');
      expect(res.body.data.api.keyHint).toBe('sk-...5678');
    });
  });

  // 2. Models endpoint
  describe('2. Models Endpoint (GET /api/models)', () => {
    it('returns models for active provider (Stability)', async () => {
      process.env.STABILITY_API_KEY = 'sk-stability-test-key';
      delete process.env.OPENAI_API_KEY;

      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.models)).toBe(true);
      const modelIds = res.body.data.models.map((m: any) => m.id);
      expect(modelIds).toContain('stable-image-core');
      expect(modelIds).toContain('stable-image-ultra');
    });

    it('returns models for active provider (OpenAI)', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test-key';
      delete process.env.STABILITY_API_KEY;

      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.models)).toBe(true);
      const modelIds = res.body.data.models.map((m: any) => m.id);
      expect(modelIds).toContain('dall-e-3');
      expect(modelIds).toContain('dall-e-2');
    });
  });

  // 5. OpenAI selected when only OpenAI key is configured
  describe('5. Provider Resolution: OpenAI Selection', () => {
    it('selects openai when only OPENAI_API_KEY is configured', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key-test';
      delete process.env.STABILITY_API_KEY;

      expect(getActiveProvider()).toBe('openai');
      const status = getProviderStatus();
      expect(status.activeProvider).toBe('openai');
      expect(status.configured).toBe(true);
      expect(status.conflict).toBe(false);
    });
  });

  // 6. Stability selected when only Stability key is configured
  describe('6. Provider Resolution: Stability Selection', () => {
    it('selects stability when only STABILITY_API_KEY is configured', () => {
      process.env.STABILITY_API_KEY = 'sk-stability-key-test';
      delete process.env.OPENAI_API_KEY;

      expect(getActiveProvider()).toBe('stability');
      const status = getProviderStatus();
      expect(status.activeProvider).toBe('stability');
      expect(status.configured).toBe(true);
      expect(status.conflict).toBe(false);
    });
  });

  // 7. Both keys configured returns configuration error
  describe('7. Provider Conflict: Both Keys Configured', () => {
    it('throws 500 error when both keys are present', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      process.env.STABILITY_API_KEY = 'sk-stability-key';

      expect(() => getActiveProvider()).toThrow(/Conflicting provider configuration/i);

      const status = getProviderStatus();
      expect(status.conflict).toBe(true);
      expect(status.configured).toBe(false);
    });

    it('returns 500 configuration error on /api/models when both keys are present', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      process.env.STABILITY_API_KEY = 'sk-stability-key';

      const res = await request(app).get('/api/models');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROVIDER_CONFIG_CONFLICT');
    });
  });

  // 8. Neither key configured returns configuration error
  describe('8. Provider Missing: Neither Key Configured', () => {
    it('throws 503 error when neither key is configured', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.STABILITY_API_KEY;

      expect(() => getActiveProvider()).toThrow(/No image generation provider configured/i);

      const status = getProviderStatus();
      expect(status.configured).toBe(false);
      expect(status.conflict).toBe(false);
    });

    it('returns 503 error on /api/models when neither key is configured', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.STABILITY_API_KEY;

      const res = await request(app).get('/api/models');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
    });
  });

  // 3 & 17. Successful generation with OpenAI mocked and frontend response compatibility
  describe('3 & 17. Successful Generation with OpenAI Mocked & Frontend Contract', () => {
    it('returns compatible frontend response with OpenAI mocked', async () => {
      mockedGenerateImage.mockResolvedValueOnce({
        imageBase64: 'base64OpenAiMockData==',
        mimeType: 'image/png',
        seed: 42,
        model: 'dall-e-3',
        prompt: 'A sleek perfume on a marble counter',
        workflowUsed: 'remove-background-and-composite',
        productPreserved: true,
        debugInfo: {
          workflow: 'remove-background-and-composite',
          endpointCalled: 'OpenAI API (images.generate / dall-e-3) + Sharp Composite',
          durationMs: 1400,
        },
      });

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'perfume.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A sleek perfume on a marble counter')
        .field('aspectRatio', '1:1')
        .field('model', 'dall-e-3')
        .field('productScale', '0.70')
        .field('positionX', '0')
        .field('positionY', '0');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify all contract fields expected by client
      const data = res.body.data;
      expect(data.imageBase64).toBe('base64OpenAiMockData==');
      expect(data.mimeType).toBe('image/png');
      expect(data.model).toBe('dall-e-3');
      expect(data.prompt).toBe('A sleek perfume on a marble counter');
      expect(data.aspectRatio).toBe('1:1');
      expect(data.outputFormat).toBe('png');
      expect(data.workflowUsed).toBe('remove-background-and-composite');
      expect(data.productPreserved).toBe(true);
      expect(data.debugInfo).toBeDefined();
      expect(data.generatedAt).toBeDefined();

      // Verify cleanup called
      expect(mockedCleanupFile).toHaveBeenCalled();
    });
  });

  // 4. Successful generation with Stability AI mocked
  describe('4. Successful Generation with Stability AI Mocked', () => {
    it('returns compatible frontend response with Stability AI mocked', async () => {
      mockedGenerateImage.mockResolvedValueOnce({
        imageBase64: 'base64StabilityMockData==',
        mimeType: 'image/png',
        seed: 98765,
        model: 'stable-image-core',
        prompt: 'A luxury watch in high-tech studio',
        workflowUsed: 'remove-background-and-composite',
        productPreserved: true,
        debugInfo: {
          workflow: 'remove-background-and-composite',
          endpointCalled: 'https://api.stability.ai/v2beta/stable-image/generate + remove-background',
          durationMs: 2100,
        },
      });

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'watch.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A luxury watch in high-tech studio')
        .field('aspectRatio', '16:9')
        .field('model', 'stable-image-core')
        .field('workflow', 'composite');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.imageBase64).toBe('base64StabilityMockData==');
      expect(res.body.data.model).toBe('stable-image-core');
      expect(res.body.data.productPreserved).toBe(true);
      expect(mockedCleanupFile).toHaveBeenCalled();
    });
  });

  // 9. No image uploaded
  describe('9. No Image Uploaded', () => {
    it('returns 400 with NO_IMAGE code', async () => {
      const res = await request(app)
        .post('/api/generate')
        .field('prompt', 'A scene without image')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_IMAGE');
    });
  });

  // 10. Missing prompt
  describe('10. Missing Prompt', () => {
    it('returns 400 when prompt is omitted', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when prompt is shorter than 3 characters', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'ab')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // 11. Invalid aspect ratio or model
  describe('11. Invalid Aspect Ratio or Model', () => {
    it('returns 400 for unsupported aspect ratio', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '99:1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Aspect ratio must be one of');
    });

    it('returns 400 for unsupported model', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1')
        .field('model', 'unsupported-model-x');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Model must be one of');
    });
  });

  // 12. Unsupported file type
  describe('12. Unsupported File Type', () => {
    it('returns 400 for text or executable files', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('console.log("danger")'), {
          filename: 'malicious.js',
          contentType: 'application/javascript',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    });
  });

  // 13. Provider authentication failure
  describe('13. Provider Authentication Failure', () => {
    it('returns 401 when provider rejects credentials', async () => {
      mockedGenerateImage.mockRejectedValueOnce(
        Object.assign(new Error('Invalid OpenAI API key.'), {
          statusCode: 401,
          code: 'INVALID_API_KEY',
        })
      );

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_API_KEY');
    });
  });

  // 14. Rate-limit / Quota errors
  describe('14. Rate-limit and Quota Errors', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockedGenerateImage.mockRejectedValueOnce(
        Object.assign(new Error('Rate limit exceeded.'), {
          statusCode: 429,
          code: 'PROVIDER_RATE_LIMIT',
        })
      );

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROVIDER_RATE_LIMIT');
    });

    it('returns 402 when quota or credits are insufficient', async () => {
      mockedGenerateImage.mockRejectedValueOnce(
        Object.assign(new Error('Insufficient quota/credits.'), {
          statusCode: 402,
          code: 'INSUFFICIENT_CREDITS',
        })
      );

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS');
    });
  });

  // 15. Background-removal errors & independent segmentation
  describe('15. Background Removal & Product Segmentation', () => {
    it('segments product with independent Sharp segmentation', async () => {
      // Create a solid white background with a dark circle product in center
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 40,
                height: 40,
                channels: 3,
                background: { r: 10, g: 10, b: 10 },
              },
            }).png().toBuffer(),
            top: 30,
            left: 30,
          },
        ])
        .png()
        .toBuffer();

      const segmented = await removeBackgroundIndependent(inputBuffer);
      const meta = await sharp(segmented).metadata();
      expect(meta.hasAlpha).toBe(true);

      const stats = await sharp(segmented).stats();
      expect(stats.channels.length).toBe(4);
      // Minimum alpha should be 0 (background removed)
      expect(stats.channels[3].min).toBe(0);
      // Maximum alpha should be 255 (product retained)
      expect(stats.channels[3].max).toBe(255);
    });

    it('handles background removal service errors gracefully', async () => {
      mockedGenerateImage.mockRejectedValueOnce(
        Object.assign(new Error('Background removal failed: upstream service error'), {
          statusCode: 502,
          code: 'BACKGROUND_REMOVAL_FAILED',
        })
      );

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'product.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BACKGROUND_REMOVAL_FAILED');
    });
  });

  // 16. Temporary-file cleanup on success and failure
  describe('16. Temporary File Cleanup', () => {
    it('cleans up temporary file on generation success', async () => {
      mockedGenerateImage.mockResolvedValueOnce({
        imageBase64: 'fakeBase64',
        mimeType: 'image/png',
        model: 'stable-image-core',
        prompt: 'Test prompt',
        workflowUsed: 'remove-background-and-composite',
        productPreserved: true,
      });

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(200);
      expect(mockedCleanupFile).toHaveBeenCalled();
    });

    it('cleans up temporary file on generation failure', async () => {
      mockedGenerateImage.mockRejectedValueOnce(new Error('Generation boom'));

      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .field('prompt', 'A test scene')
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(500);
      expect(mockedCleanupFile).toHaveBeenCalled();
    });

    it('cleans up temporary file on validation failure', async () => {
      const res = await request(app)
        .post('/api/generate')
        .attach('image', Buffer.from('fake-png-data'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .field('prompt', 'ab') // too short
        .field('aspectRatio', '1:1');

      expect(res.status).toBe(400);
      expect(mockedCleanupFile).toHaveBeenCalled();
    });
  });
});
