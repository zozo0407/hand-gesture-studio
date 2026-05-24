import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  PRESETS_STORAGE_KEY,
  STORAGE_KEY,
  hasPreset,
  readPreset,
  readSettings,
  writePreset,
  writeSettings,
} from "./settings.js";

describe("readSettings", () => {
  it("returns defaults when storage is empty", () => {
    const storage = createStorage();

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("recovers from invalid JSON", () => {
    const storage = createStorage({ [STORAGE_KEY]: "not-json" });

    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("merges saved values with defaults and rejects invalid values", () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({
        showLandmarks: false,
        showCircle: false,
        showValues: true,
        showAreaEffect: false,
        areaEffectType: "liquidGlass",
        areaEffectIntensity: "0.82",
        areaEffectSpeed: "1.5",
        areaEffectOpacity: "0.4",
        handAreaMode: "connected",
        leftMode: "circle",
        rightMode: "triangle",
        audioEnabled: true,
        audioMasterVolume: "0.62",
        audioBpm: "132",
        audioRhythmDensity: "0.77",
        circleColor: "#123abc",
        lineWidth: "8",
        smoothing: "0.85",
        showGestures: true,
        gestureScoreThreshold: "0.72",
        gestureLabelLanguage: "en",
        aspectRatioMode: "portrait",
        enabledGestures: {
          Victory: false,
          Thumb_Up: "yes",
        },
      }),
    });

    expect(readSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      showLandmarks: false,
      showCircle: false,
      showValues: true,
      showAreaEffect: false,
      areaEffectType: "liquidGlass",
      areaEffectIntensity: 0.82,
      areaEffectSpeed: 1.5,
      areaEffectOpacity: 0.4,
      handAreaMode: "connected",
      leftMode: "circle",
      rightMode: DEFAULT_SETTINGS.rightMode,
      audioEnabled: true,
      audioMasterVolume: 0.62,
      audioBpm: 132,
      audioRhythmDensity: 0.77,
      circleColor: "#123abc",
      lineWidth: 8,
      smoothing: 0.85,
      showGestures: true,
      gestureScoreThreshold: 0.72,
      gestureLabelLanguage: "en",
      aspectRatioMode: "portrait",
      enabledGestures: {
        ...DEFAULT_SETTINGS.enabledGestures,
        Victory: false,
      },
    });
  });
});

describe("writeSettings", () => {
  it("stores normalized settings under the app storage key", () => {
    const storage = createStorage();

    writeSettings(storage, {
      ...DEFAULT_SETTINGS,
      showValues: true,
      showAreaEffect: true,
      areaEffectType: "warp",
      areaEffectIntensity: -2,
      areaEffectSpeed: 3,
      areaEffectOpacity: 1.4,
      handAreaMode: "stretch",
      leftMode: "circle",
      audioEnabled: true,
      audioMasterVolume: 4,
      audioBpm: 300,
      audioRhythmDensity: -1,
      lineWidth: 12,
      smoothing: 1.4,
      showGestures: true,
      gestureScoreThreshold: -1,
      gestureLabelLanguage: "fr",
      aspectRatioMode: "square",
      enabledGestures: {
        Victory: false,
        Unknown: false,
      },
    });

    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual({
      ...DEFAULT_SETTINGS,
      showValues: true,
      showAreaEffect: true,
      areaEffectType: DEFAULT_SETTINGS.areaEffectType,
      areaEffectIntensity: 0,
      areaEffectSpeed: 2,
      areaEffectOpacity: 1,
      handAreaMode: DEFAULT_SETTINGS.handAreaMode,
      leftMode: "circle",
      audioEnabled: true,
      audioMasterVolume: 1,
      audioBpm: 160,
      audioRhythmDensity: 0,
      lineWidth: 12,
      smoothing: 1,
      showGestures: true,
      gestureScoreThreshold: 0,
      gestureLabelLanguage: DEFAULT_SETTINGS.gestureLabelLanguage,
      aspectRatioMode: DEFAULT_SETTINGS.aspectRatioMode,
      enabledGestures: {
        ...DEFAULT_SETTINGS.enabledGestures,
        Victory: false,
      },
    });
  });

  it("does not throw when storage rejects writes", () => {
    const storage = {
      setItem() {
        throw new Error("storage blocked");
      },
    };

    expect(() => writeSettings(storage, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("can be called with only settings when browser storage is unavailable", () => {
    expect(() => writeSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("presets", () => {
  it("stores and reads normalized preset slots", () => {
    const storage = createStorage();

    writePreset(storage, 1, {
      ...DEFAULT_SETTINGS,
      showValues: true,
      lineWidth: 30,
      enabledGestures: {
        Victory: false,
      },
    });

    expect(hasPreset(storage, 1)).toBe(true);
    expect(readPreset(storage, 1)).toEqual({
      ...DEFAULT_SETTINGS,
      showValues: true,
      lineWidth: 20,
      enabledGestures: {
        ...DEFAULT_SETTINGS.enabledGestures,
        Victory: false,
      },
    });
    expect(JSON.parse(storage.getItem(PRESETS_STORAGE_KEY))["1"].lineWidth).toBe(20);
  });

  it("ignores unsupported preset slots", () => {
    const storage = createStorage();

    writePreset(storage, 9, DEFAULT_SETTINGS);

    expect(hasPreset(storage, 9)).toBe(false);
    expect(readPreset(storage, 9)).toBeNull();
    expect(storage.getItem(PRESETS_STORAGE_KEY)).toBeNull();
  });

  it("recovers from invalid preset JSON", () => {
    const storage = createStorage({ [PRESETS_STORAGE_KEY]: "not-json" });

    expect(hasPreset(storage, 1)).toBe(false);
    expect(readPreset(storage, 1)).toBeNull();
  });
});

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}
