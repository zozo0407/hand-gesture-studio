import { describe, expect, it } from "vitest";
import {
  createPixelEffectSettings,
  normalizeAreaEffectType,
} from "./areaEffects.js";

describe("normalizeAreaEffectType", () => {
  it("keeps supported area effects and falls back for unknown values", () => {
    expect(normalizeAreaEffectType("pixel")).toBe("pixel");
    expect(normalizeAreaEffectType("liquidGlass")).toBe("liquidGlass");
    expect(normalizeAreaEffectType("heatmap")).toBe("heatmap");
    expect(normalizeAreaEffectType("glitch")).toBe("glitch");
    expect(normalizeAreaEffectType("removed-effect", "pixel")).toBe("pixel");
    expect(normalizeAreaEffectType("shader-toy-copy", "pixel")).toBe("pixel");
  });

  it("maps legacy kaleidoscope presets to the liquid glass replacement", () => {
    expect(normalizeAreaEffectType("kaleidoscope")).toBe("liquidGlass");
  });

  it("maps legacy glass presets to the replacement glitch effect", () => {
    expect(normalizeAreaEffectType("glass")).toBe("glitch");
  });
});

describe("createPixelEffectSettings", () => {
  it("does not map hand lengths to contrast or grain size", () => {
    const baseline = createPixelEffectSettings({ intensity: 0.5, leftLength: 0.1, rightLength: 0.1 });
    const highLeft = createPixelEffectSettings({ intensity: 0.5, leftLength: 0.8, rightLength: 0.1 });
    const highRight = createPixelEffectSettings({ intensity: 0.5, leftLength: 0.1, rightLength: 0.8 });

    expect(highLeft.contrastPercent).toBe(baseline.contrastPercent);
    expect(highLeft.pixelSize).toBe(baseline.pixelSize);
    expect(highRight.pixelSize).toBe(baseline.pixelSize);
    expect(highRight.contrastPercent).toBe(baseline.contrastPercent);
  });

  it("keeps the existing intensity control as the base mosaic strength", () => {
    const lowIntensity = createPixelEffectSettings({ intensity: 0, leftLength: 0.5, rightLength: 0.5 });
    const highIntensity = createPixelEffectSettings({ intensity: 1, leftLength: 0.5, rightLength: 0.5 });

    expect(highIntensity.pixelSize).toBeGreaterThan(lowIntensity.pixelSize);
    expect(highIntensity.tintAlpha).toBeGreaterThan(lowIntensity.tintAlpha);
  });
});
