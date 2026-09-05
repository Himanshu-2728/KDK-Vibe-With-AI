import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { PNG } from "pngjs";
import { RuleBasedAiService } from "../src/services/ai.js";
import { analyzeImage } from "../src/services/imageSignals.js";

const ai = new RuleBasedAiService();
let tmpDir: string | null = null;

function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function writeImage(buffer: Buffer, name: string): string {
  tmpDir ??= fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-ai-"));
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, buffer);
  return file;
}

afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("analyzeImage", () => {
  it("decodes PNG pixels and reports darkness for a near-black photo", () => {
    const file = writeImage(solidPng(64, 48, [30, 30, 30]), "dark.png");
    const s = analyzeImage(file);
    expect(s).not.toBeNull();
    expect(s!.analyzed).toBe(true);
    expect(s!.darknessRatio).toBeGreaterThan(0.9);
    expect(s!.meanBrightness).toBeLessThan(40);
  });

  it("returns null for unsupported content (SVG/garbage)", () => {
    const file = writeImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "x.svg");
    expect(analyzeImage(file)).toBeNull();
    expect(analyzeImage(null)).toBeNull();
    expect(analyzeImage("/does/not/exist.png")).toBeNull();
  });
});

describe("RuleBasedAiService.classify (photo-aware)", () => {
  it("calls 'Pothole' from text and raises severity when the photo is mostly a dark hole", async () => {
    const file = writeImage(solidPng(80, 60, [30, 30, 30]), "hole.png");
    const r = await ai.classify({ description: "pothole near the bus stop", imagePath: file });
    expect(r.category).toBe("Infrastructure");
    expect(r.type).toBe("Pothole");
    expect(r.severity).toBe("high"); // dark frame raises the low text-based estimate
    expect(r.imageAnalyzed).toBe(true);
    expect(r.signals?.some((s) => s.includes("near-black") || s.includes("dark"))).toBe(true);
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it("guesses Environment from a mostly-green photo when the description is empty", async () => {
    const file = writeImage(solidPng(80, 60, [30, 150, 70]), "tree.png");
    const r = await ai.classify({ description: "", imagePath: file });
    expect(r.category).toBe("Environment");
    expect(r.imageAnalyzed).toBe(true);
    expect(r.explanation).toContain("leans on the image");
    expect(r.signals?.some((s) => s.includes("green"))).toBe(true);
  });

  it("keeps text as the primary signal even when the palette conflicts", async () => {
    const file = writeImage(solidPng(80, 60, [30, 150, 70]), "mismatch.png");
    const r = await ai.classify({ description: "pothole by the curb", imagePath: file });
    expect(r.category).toBe("Infrastructure");
    expect(r.type).toBe("Pothole");
  });

  it("detects a water leak from text and a blue-heavy photo", async () => {
    const file = writeImage(solidPng(80, 60, [40, 110, 220]), "water.png");
    const r = await ai.classify({ description: "water leak on the curb", imagePath: file });
    expect(r.category).toBe("Water");
    expect(r.severity).toBe("high"); // visible blue water corroborates
  });

  it("falls back to text-only classification for undecodable photos", async () => {
    const file = writeImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "z.svg");
    const r = await ai.classify({ description: "broken streetlight flickering", imagePath: file });
    expect(r.category).toBe("Electrical");
    expect(r.imageAnalyzed).toBe(false);
    expect(r.signals?.some((s) => s.includes("couldn't be pixel-analyzed"))).toBe(true);
  });

  it("caps confidence below 100% and never claims certainty", async () => {
    const r = await ai.classify({ description: "deep dangerous pothole flooding near the school" });
    expect(r.confidence).toBeLessThanOrEqual(0.95);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });
});