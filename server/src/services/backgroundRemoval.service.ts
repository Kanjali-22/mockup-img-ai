import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { createError } from '../middleware/errorHandler';
import { getActiveProvider } from './imageProvider';

const STABILITY_REMOVE_BG_ENDPOINT = 'https://api.stability.ai/v2beta/stable-image/edit/remove-background';

/**
 * Checks whether an image buffer already has meaningful alpha transparency.
 */
export async function imageHasTransparency(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.hasAlpha) return false;

    const stats = await sharp(buffer).stats();
    if (stats.channels.length >= 4) {
      const alphaChannel = stats.channels[3];
      // If minimum alpha is below 250, there are transparent pixels
      return alphaChannel.min < 250;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Independent color-distance & luminance segmentation for removing solid/studio backgrounds
 * without external network calls or third-party paid APIs.
 * Preserves the inner product pixels while keying out white, light, or uniform studio backdrops.
 */
export async function removeBackgroundIndependent(imageBuffer: Buffer): Promise<Buffer> {
  // If the image already has transparency, return as PNG immediately
  if (await imageHasTransparency(imageBuffer)) {
    return sharp(imageBuffer).png().toBuffer();
  }

  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels < 4) {
    return sharp(imageBuffer).png().toBuffer();
  }

  // Sample corner pixels to determine background reference color
  const sampleOffsets = [
    0, // Top-left
    (width - 1) * 4, // Top-right
    (width * (height - 1)) * 4, // Bottom-left
    (width * height - 1) * 4 - 3, // Bottom-right
    Math.floor(width / 2) * 4, // Top-center
  ];

  let bgR = 255;
  let bgG = 255;
  let bgB = 255;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let validSamples = 0;

  for (const offset of sampleOffsets) {
    if (offset >= 0 && offset + 2 < data.length) {
      totalR += data[offset];
      totalG += data[offset + 1];
      totalB += data[offset + 2];
      validSamples++;
    }
  }

  if (validSamples > 0) {
    bgR = totalR / validSamples;
    bgG = totalG / validSamples;
    bgB = totalB / validSamples;
  }

  const thresholdLow = 16;
  const thresholdHigh = 36;
  let transparentPixelCount = 0;
  const totalPixels = width * height;

  const outputBuffer = Buffer.from(data);

  for (let i = 0; i < outputBuffer.length; i += 4) {
    const r = outputBuffer[i];
    const g = outputBuffer[i + 1];
    const b = outputBuffer[i + 2];

    const dist = Math.sqrt(
      Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
    );

    if (dist <= thresholdLow) {
      outputBuffer[i + 3] = 0; // Completely transparent
      transparentPixelCount++;
    } else if (dist < thresholdHigh) {
      // Soft anti-aliased edge
      const factor = (dist - thresholdLow) / (thresholdHigh - thresholdLow);
      outputBuffer[i + 3] = Math.round(factor * 255);
      transparentPixelCount++;
    }
  }

  // Sanity check: If segmentation removed everything or removed nothing, return original with alpha
  if (transparentPixelCount > totalPixels * 0.98 || transparentPixelCount === 0) {
    return sharp(imageBuffer).png().toBuffer();
  }

  return sharp(outputBuffer, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Removes the background from a product image to produce a transparent PNG cutout.
 *
 * Mode behavior:
 * - If the image already has transparency, returns the buffer as PNG directly.
 * - In OpenAI mode: uses independent segmentation (no external provider dependencies).
 * - In Stability mode: uses Stability AI remove-background API, falling back to independent segmentation if needed.
 */
export async function removeBackground(
  imageBuffer: Buffer,
  force = false
): Promise<Buffer> {
  // If the image already has transparency and removal is not forced, return as-is
  if (!force) {
    const alreadyTransparent = await imageHasTransparency(imageBuffer);
    if (alreadyTransparent) {
      return sharp(imageBuffer).png().toBuffer();
    }
  }

  let provider: string;
  try {
    provider = getActiveProvider();
  } catch {
    // If no provider resolved, fallback to independent segmentation
    return removeBackgroundIndependent(imageBuffer);
  }

  // In OpenAI mode, strictly use independent segmentation to avoid mixing providers
  if (provider === 'openai') {
    return removeBackgroundIndependent(imageBuffer);
  }

  // Stability AI mode
  const apiKey = process.env.STABILITY_API_KEY?.trim();
  if (!apiKey) {
    return removeBackgroundIndependent(imageBuffer);
  }

  // Prepare image dimensions complying with Stability API constraints
  let preparedBuffer = imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  if (meta.width && meta.height) {
    const totalPixels = meta.width * meta.height;
    if (totalPixels > 4_194_304 || meta.width > 2048 || meta.height > 2048) {
      preparedBuffer = await sharp(imageBuffer)
        .resize(1536, 1536, { fit: 'inside' })
        .png()
        .toBuffer();
    }
  }

  const form = new FormData();
  form.append('image', preparedBuffer, {
    filename: 'product.png',
    contentType: 'image/png',
  });
  form.append('output_format', 'png');

  try {
    const response = await axios.post(STABILITY_REMOVE_BG_ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      timeout: 120_000,
      maxContentLength: 50 * 1024 * 1024,
    });

    const data = response.data as { image?: string };
    if (!data.image) {
      throw createError(
        'Background removal service returned empty image.',
        502,
        'PROVIDER_ERROR'
      );
    }

    return Buffer.from(data.image, 'base64');
  } catch (err) {
    const axiosErr = err as AxiosError;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const body = axiosErr.response.data as Record<string, unknown>;
      const message = typeof body?.message === 'string' ? body.message : 'Removal failed';

      if (status === 402 || message.toLowerCase().includes('credit')) {
        throw createError(
          'Insufficient Stability AI credits for background removal.',
          402,
          'INSUFFICIENT_CREDITS'
        );
      }

      throw createError(
        `Background removal failed (HTTP ${status}): ${message}`,
        status >= 500 ? 502 : 400,
        'BACKGROUND_REMOVAL_FAILED'
      );
    }

    if (axiosErr.code === 'ECONNABORTED') {
      throw createError('Background removal timed out.', 504, 'TIMEOUT');
    }

    // Network error connecting to Stability AI
    throw createError(
      'Network error connecting to background removal service.',
      503,
      'NETWORK_ERROR'
    );
  }
}
