import { describe, expect, it } from "vitest";
import {
  getVoiceFrequency,
  mapLengthToGain,
  normalizeAudioLength,
  normalizeBpm,
  normalizeRhythmDensity,
  shouldTriggerVoice,
} from "./audioMapping.js";

describe("normalizeAudioLength", () => {
  it("snaps very small and very large values to silence and full volume", () => {
    expect(normalizeAudioLength(0.09)).toBe(0);
    expect(normalizeAudioLength(0.1)).toBe(0.1);
    expect(normalizeAudioLength(0.9)).toBe(0.9);
    expect(normalizeAudioLength(0.91)).toBe(1);
  });

  it("clamps invalid and out-of-range values", () => {
    expect(normalizeAudioLength(Number.NaN)).toBe(0);
    expect(normalizeAudioLength(-1)).toBe(0);
    expect(normalizeAudioLength(2)).toBe(1);
  });
});

describe("mapLengthToGain", () => {
  it("scales hand length by master volume", () => {
    expect(mapLengthToGain(0.5, 0.4)).toBeCloseTo(0.2);
    expect(mapLengthToGain(1, 0.25)).toBeCloseTo(0.25);
  });
});

describe("tempo helpers", () => {
  it("normalizes bpm and rhythm density", () => {
    expect(normalizeBpm(20)).toBe(70);
    expect(normalizeBpm(200)).toBe(160);
    expect(normalizeBpm("bad")).toBe(120);
    expect(normalizeRhythmDensity(-1)).toBe(0);
    expect(normalizeRhythmDensity(2)).toBe(1);
    expect(normalizeRhythmDensity("bad")).toBe(0.5);
  });
});

describe("shouldTriggerVoice", () => {
  it("uses denser right-hand steps as density and length increase", () => {
    expect(shouldTriggerVoice(0, "right", 0.1, 0.2)).toBe(true);
    expect(shouldTriggerVoice(2, "right", 0.1, 0.2)).toBe(false);
    expect(shouldTriggerVoice(2, "right", 0.9, 0.9)).toBe(true);
    expect(shouldTriggerVoice(7, "right", 0.9, 0.9)).toBe(true);
  });

  it("keeps left-hand notes on offbeats and mutes missing hands", () => {
    expect(shouldTriggerVoice(3, "left", 0.2, 0.5)).toBe(true);
    expect(shouldTriggerVoice(0, "left", 0.2, 0.5)).toBe(false);
    expect(shouldTriggerVoice(3, "left", 1, 0)).toBe(false);
  });
});

describe("getVoiceFrequency", () => {
  it("returns high frequencies for left and low frequencies for right", () => {
    expect(getVoiceFrequency(0, "left", 0)).toBeGreaterThan(500);
    expect(getVoiceFrequency(0, "right", 0)).toBeLessThan(120);
  });
});
