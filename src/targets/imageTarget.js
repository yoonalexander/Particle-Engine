import { generateRasterTarget } from './rasterTarget';

export function generateImageTarget({
  image,
  count,
  width = 1024,
  height = 512,
  alphaThreshold = 30,
  stride = 4,
  worldScale = 8,
}) {
  return generateRasterTarget({
    image,
    count,
    width,
    height,
    alphaThreshold,
    stride,
    worldScale,
    seed: 9001,
  });
}
