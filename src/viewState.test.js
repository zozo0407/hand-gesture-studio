import { describe, expect, it } from "vitest";
import { getVisiblePanelIds, normalizeView } from "./viewState.js";

describe("normalizeView", () => {
  it("keeps supported views and falls back to joints", () => {
    expect(normalizeView("joints")).toBe("joints");
    expect(normalizeView("gestures")).toBe("gestures");
    expect(normalizeView("unknown")).toBe("joints");
  });
});

describe("getVisiblePanelIds", () => {
  it("shows visualization and camera for the finger-joints view", () => {
    expect(getVisiblePanelIds("joints")).toEqual([
      "presets",
      "visualization",
      "areaEffects",
      "audio",
      "camera",
    ]);
  });

  it("shows only gesture controls for the gestures view", () => {
    expect(getVisiblePanelIds("gestures")).toEqual(["presets", "gestureDetection"]);
  });
});
