import { SUPPORTED_GESTURES } from "./gestures.js";
import { normalizeAreaEffectType } from "./areaEffects.js";
import { STORAGE_KEYS } from "./projectConfig.js";

export const STORAGE_KEY = STORAGE_KEYS.settings;
export const PRESETS_STORAGE_KEY = STORAGE_KEYS.presets;
export const PRESET_SLOTS = [1, 2, 3];

const DEFAULT_ENABLED_GESTURES = Object.fromEntries(
  SUPPORTED_GESTURES.map((gesture) => [gesture.categoryName, true]),
);

export const DEFAULT_SETTINGS = {
  showLandmarks: true,
  showCircle: true,
  showValues: false,
  showAreaEffect: true,
  areaEffectType: "pixel",
  areaEffectIntensity: 0.6,
  areaEffectSpeed: 1,
  areaEffectOpacity: 0.65,
  handAreaMode: "independent",
  leftMode: "line",
  rightMode: "circle",
  audioEnabled: false,
  audioMasterVolume: 0.35,
  audioBpm: 120,
  audioRhythmDensity: 0.55,
  circleColor: "#00d084",
  lineWidth: 4,
  smoothing: 0.35,
  showGestures: true,
  gestureScoreThreshold: 0.5,
  gestureLabelLanguage: "zh",
  enabledGestures: DEFAULT_ENABLED_GESTURES,
  aspectRatioMode: "current",
};

const SHAPES = new Set(["line", "circle"]);
const HAND_AREA_MODES = new Set(["independent", "connected"]);
const GESTURE_LABEL_LANGUAGES = new Set(["zh", "en"]);
const ASPECT_RATIO_MODES = new Set(["current", "square"]);

export function readSettings(storage = getDefaultStorage()) {
  const storedSettings = readStoredSettings(storage);
  return normalizeSettings(storedSettings);
}

export function writeSettings(storageOrSettings, maybeSettings) {
  const hasExplicitStorage = maybeSettings !== undefined;
  const storage = hasExplicitStorage ? storageOrSettings : getDefaultStorage();
  const settings = hasExplicitStorage ? maybeSettings : storageOrSettings;

  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Persistence is optional; blocked storage should not break the live controls.
  }
}

export function readPreset(storageOrSlot, maybeSlot) {
  const hasExplicitStorage = maybeSlot !== undefined;
  const storage = hasExplicitStorage ? storageOrSlot : getDefaultStorage();
  const slot = hasExplicitStorage ? maybeSlot : storageOrSlot;
  const preset = readStoredPresets(storage)[normalizePresetSlot(slot)];

  return preset ? normalizeSettings(preset) : null;
}

export function writePreset(storageOrSlot, slotOrSettings, maybeSettings) {
  const hasExplicitStorage = maybeSettings !== undefined;
  const storage = hasExplicitStorage ? storageOrSlot : getDefaultStorage();
  const slot = hasExplicitStorage ? slotOrSettings : storageOrSlot;
  const settings = hasExplicitStorage ? maybeSettings : slotOrSettings;
  const normalizedSlot = normalizePresetSlot(slot);

  if (!normalizedSlot) {
    return;
  }

  try {
    const presets = readStoredPresets(storage);
    presets[normalizedSlot] = normalizeSettings(settings);
    storage?.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Presets are optional; blocked storage should not break the live controls.
  }
}

export function hasPreset(storageOrSlot, maybeSlot) {
  const hasExplicitStorage = maybeSlot !== undefined;
  const storage = hasExplicitStorage ? storageOrSlot : getDefaultStorage();
  const slot = hasExplicitStorage ? maybeSlot : storageOrSlot;

  return Boolean(readStoredPresets(storage)[normalizePresetSlot(slot)]);
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function normalizeSettings(settings = {}) {
  return {
    showLandmarks: normalizeBoolean(settings.showLandmarks, DEFAULT_SETTINGS.showLandmarks),
    showCircle: normalizeBoolean(settings.showCircle, DEFAULT_SETTINGS.showCircle),
    showValues: normalizeBoolean(settings.showValues, DEFAULT_SETTINGS.showValues),
    showAreaEffect: normalizeBoolean(settings.showAreaEffect, DEFAULT_SETTINGS.showAreaEffect),
    areaEffectType: normalizeAreaEffectType(settings.areaEffectType, DEFAULT_SETTINGS.areaEffectType),
    areaEffectIntensity: normalizeNumber(
      settings.areaEffectIntensity,
      DEFAULT_SETTINGS.areaEffectIntensity,
      0,
      1,
    ),
    areaEffectSpeed: normalizeNumber(settings.areaEffectSpeed, DEFAULT_SETTINGS.areaEffectSpeed, 0, 2),
    areaEffectOpacity: normalizeNumber(
      settings.areaEffectOpacity,
      DEFAULT_SETTINGS.areaEffectOpacity,
      0,
      1,
    ),
    handAreaMode: normalizeHandAreaMode(settings.handAreaMode, DEFAULT_SETTINGS.handAreaMode),
    leftMode: normalizeShape(settings.leftMode, DEFAULT_SETTINGS.leftMode),
    rightMode: normalizeShape(settings.rightMode, DEFAULT_SETTINGS.rightMode),
    audioEnabled: normalizeBoolean(settings.audioEnabled, DEFAULT_SETTINGS.audioEnabled),
    audioMasterVolume: normalizeNumber(settings.audioMasterVolume, DEFAULT_SETTINGS.audioMasterVolume, 0, 1),
    audioBpm: normalizeNumber(settings.audioBpm, DEFAULT_SETTINGS.audioBpm, 70, 160),
    audioRhythmDensity: normalizeNumber(
      settings.audioRhythmDensity,
      DEFAULT_SETTINGS.audioRhythmDensity,
      0,
      1,
    ),
    circleColor: normalizeColor(settings.circleColor, DEFAULT_SETTINGS.circleColor),
    lineWidth: normalizeNumber(settings.lineWidth, DEFAULT_SETTINGS.lineWidth, 1, 20),
    smoothing: normalizeNumber(settings.smoothing, DEFAULT_SETTINGS.smoothing, 0, 1),
    showGestures: normalizeBoolean(settings.showGestures, DEFAULT_SETTINGS.showGestures),
    gestureScoreThreshold: normalizeNumber(
      settings.gestureScoreThreshold,
      DEFAULT_SETTINGS.gestureScoreThreshold,
      0,
      1,
    ),
    gestureLabelLanguage: normalizeLanguage(
      settings.gestureLabelLanguage,
      DEFAULT_SETTINGS.gestureLabelLanguage,
    ),
    enabledGestures: normalizeEnabledGestures(settings.enabledGestures),
    aspectRatioMode: normalizeAspectRatioMode(
      settings.aspectRatioMode,
      DEFAULT_SETTINGS.aspectRatioMode,
    ),
  };
}

function readStoredSettings(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function readStoredPresets(storage) {
  try {
    const value = storage?.getItem(PRESETS_STORAGE_KEY);
    const presets = value ? JSON.parse(value) : {};
    return presets && typeof presets === "object" ? presets : {};
  } catch {
    return {};
  }
}

function normalizePresetSlot(slot) {
  const number = Number(slot);
  return PRESET_SLOTS.includes(number) ? String(number) : null;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeShape(value, fallback) {
  return SHAPES.has(value) ? value : fallback;
}

function normalizeHandAreaMode(value, fallback) {
  return HAND_AREA_MODES.has(value) ? value : fallback;
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeLanguage(value, fallback) {
  return GESTURE_LABEL_LANGUAGES.has(value) ? value : fallback;
}

function normalizeAspectRatioMode(value, fallback) {
  if (value === "portrait") return "square";
  return ASPECT_RATIO_MODES.has(value) ? value : fallback;
}

function normalizeEnabledGestures(value) {
  const settings = value && typeof value === "object" ? value : {};

  return Object.fromEntries(
    SUPPORTED_GESTURES.map((gesture) => [
      gesture.categoryName,
      normalizeBoolean(settings[gesture.categoryName], DEFAULT_ENABLED_GESTURES[gesture.categoryName]),
    ]),
  );
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}
