import fs from "node:fs";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Lightweight, dependency-free-by-design image analysis. The MVP can't run a
 * pretrained vision model, but it CAN decode uploaded photos and read real
 * pixel statistics — which makes the "AI" visibly react to the actual image
 * rather than only the text description.
 *
 * Signals extracted:
 *  - mean brightness / darkness ratio      → dark asphalt, night scenes
 *  - green dominance                       → vegetation / fallen trees
 *  - blue dominance                        → water
 *  - warm highlight ratio                  → streetlights, brake lights
 *  - color variance                        → mixed clutter (dumping)
 *
 * Unsupported formats (SVG, HEIC, WebP…) fall back to `null` and the classifier
 * simply relies on the description — same interface, honest degradation.
 */
export interface ImageSignals {
  analyzed: boolean;
  format: string;
  meanBrightness: number; // 0..255
  darknessRatio: number; // luminance < 55
  darknessMidRatio: number; // 55..120 (asphalt-ish)
  greenRatio: number;
  blueRatio: number;
  warmRatio: number; // bright warm pixels (lights)
  variance: number; // colorfulness of the scene
  width: number;
  height: number;
}

export function analyzeImage(filePath: string | null | undefined): ImageSignals | null {
  if (!filePath) return null;
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buffer.length < 16) return null;

  let width: number;
  let height: number;
  let data: Buffer;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    try {
      const png = PNG.sync.read(buffer);
      width = png.width;
      height = png.height;
      data = png.data;
    } catch {
      return null;
    }
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    try {
      const jpeg = decodeJpeg(buffer, { useTArray: false });
      width = jpeg.width;
      height = jpeg.height;
      data = jpeg.data;
    } catch {
      return null;
    }
  } else {
    return null; // SVG / WebP / HEIC — not pixel-addressable here.
  }

  // Downsample so we never iterate more than ~60k pixels.
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 40000)));

  let samples = 0;
  let sumLum = 0;
  let dark = 0;
  let darkMid = 0;
  let green = 0;
  let blue = 0;
  let warm = 0;
  let sumR = 0, sumG = 0, sumB = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLum += lum;
      sumR += r;
      sumG += g;
      sumB += b;
      if (lum < 55) dark++;
      else if (lum < 130) darkMid++;
      // Green dominance (vegetation).
      if (g > r * 1.12 && g > b * 1.12 && g > 50) green++;
      // Blue dominance (water/sky).
      if (b > r * 1.15 && b > g * 1.05 && b > 60) blue++;
      // Bright warm pixels (lights, brake lights, sun glints).
      if (r > 170 && g > 90 && b < 160 && lum > 170) warm++;
      samples++;
    }
  }

  if (samples === 0) return null;

  const meanR = sumR / samples;
  const meanG = sumG / samples;
  const meanB = sumB / samples;
  const variance =
    Math.sqrt(
      (Math.abs(meanR - sumLum / samples) +
        Math.abs(meanG - sumLum / samples) +
        Math.abs(meanB - sumLum / samples)) /
        3,
    ) / 255;

  return {
    analyzed: true,
    format: buffer[1] === 0x50 ? "png" : "jpeg",
    meanBrightness: Math.round(sumLum / samples),
    darknessRatio: dark / samples,
    darknessMidRatio: darkMid / samples,
    greenRatio: green / samples,
    blueRatio: blue / samples,
    warmRatio: warm / samples,
    variance: Math.round(variance * 100) / 100,
    width,
    height,
  };
}

export function describeSignals(signals: ImageSignals): string[] {
  const parts: string[] = [];
  const lum = signals.meanBrightness;
  if (lum < 55) parts.push("the photo is very dark overall — consistent with night or a dark hole");
  else if (lum < 110) parts.push("mostly dark, asphalt-like tones");
  else if (lum > 190) parts.push("a bright, daylight scene");
  else parts.push("moderate lighting, typical of an outdoor daytime shot");

  if (signals.darknessRatio > 0.35)
    parts.push(`${Math.round(signals.darknessRatio * 100)}% of the frame is near-black`);
  if (signals.darknessMidRatio > 0.4)
    parts.push(`mid-dark pavement tones dominate (${Math.round(signals.darknessMidRatio * 100)}%)`);
  if (signals.greenRatio > 0.3)
    parts.push(`strong green content (${Math.round(signals.greenRatio * 100)}%) — vegetation`);
  if (signals.blueRatio > 0.25)
    parts.push(`a large blue area (${Math.round(signals.blueRatio * 100)}%) — standing water or sky`);
  if (signals.warmRatio > 0.02 && lum < 110)
    parts.push(`bright warm spots in a dark frame — like a lamp or vehicle light`);
  return parts;
}