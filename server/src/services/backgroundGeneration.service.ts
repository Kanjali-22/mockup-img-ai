import {
  generateStabilityBackgroundScene,
  StabilityBackgroundParams,
} from './stabilityImage.service';

export type BackgroundGenerationParams = StabilityBackgroundParams;
export const generateBackgroundScene = generateStabilityBackgroundScene;
