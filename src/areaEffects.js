export const AREA_EFFECT_TYPES = ["pixel", "liquidGlass", "heatmap", "glitch"];

const LEGACY_AREA_EFFECT_TYPES = {
  kaleidoscope: "liquidGlass",
  glass: "glitch",
};

export function normalizeAreaEffectType(value, fallback = "pixel") {
  if (AREA_EFFECT_TYPES.includes(value)) {
    return value;
  }

  return LEGACY_AREA_EFFECT_TYPES[value] ?? fallback;
}

export function createPixelEffectSettings({ intensity = 0 } = {}) {
  const normalizedIntensity = clampNumber(intensity, 0, 1);

  return {
    pixelSize: Math.round(6 + normalizedIntensity * 14),
    contrastPercent: 100,
    tintAlpha: 0.12 + normalizedIntensity * 0.16,
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}
