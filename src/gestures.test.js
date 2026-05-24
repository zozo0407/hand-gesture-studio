import { describe, expect, it } from "vitest";
import {
  formatGesture,
  createGestureStabilizer,
  getGestureLabel,
  getGestureScore,
  getMaxGestureScore,
  isGestureEnabled,
  recognizeDigitGesture,
  updateDigitStabilizer,
  updateGestureStabilizer,
} from "./gestures.js";

describe("getGestureLabel", () => {
  it("maps MediaPipe canned gesture labels to Chinese labels", () => {
    expect(getGestureLabel("Closed_Fist", "zh")).toBe("握拳");
    expect(getGestureLabel("Victory", "zh")).toBe("比耶");
    expect(getGestureLabel("ILoveYou", "zh")).toBe("我爱你");
  });

  it("can keep the original English label", () => {
    expect(getGestureLabel("Thumb_Up", "en")).toBe("Thumb_Up");
  });
});

describe("formatGesture", () => {
  it("formats a gesture when the score meets the threshold", () => {
    const category = { categoryName: "Closed_Fist", score: 0.923 };

    expect(formatGesture(category, { language: "zh", threshold: 0.5 })).toBe("握拳 0.92");
  });

  it("returns null for missing, none, unknown, or low-score gestures", () => {
    expect(formatGesture(null, { language: "zh", threshold: 0.5 })).toBeNull();
    expect(formatGesture({ categoryName: "None", score: 0.9 }, { language: "zh", threshold: 0.5 })).toBeNull();
    expect(
      formatGesture({ categoryName: "Unknown", score: 0.9 }, { language: "zh", threshold: 0.5 }),
    ).toBeNull();
    expect(
      formatGesture({ categoryName: "Victory", score: 0.49 }, { language: "zh", threshold: 0.5 }),
    ).toBeNull();
  });

  it("returns null for disabled gestures", () => {
    const category = { categoryName: "Victory", score: 0.91 };

    expect(
      formatGesture(category, {
        language: "zh",
        threshold: 0.5,
        enabledGestures: { Victory: false },
      }),
    ).toBeNull();
  });
});

describe("isGestureEnabled", () => {
  it("defaults to enabled unless a gesture is explicitly disabled", () => {
    expect(isGestureEnabled("Victory")).toBe(true);
    expect(isGestureEnabled("Victory", { Victory: true })).toBe(true);
    expect(isGestureEnabled("Victory", { Victory: false })).toBe(false);
  });
});

describe("getGestureScore", () => {
  it("returns a thresholded score for a named gesture", () => {
    const categories = [
      { categoryName: "Closed_Fist", score: 0.78 },
      { categoryName: "Open_Palm", score: 0.2 },
    ];

    expect(getGestureScore(categories, "Closed_Fist", { threshold: 0.5 })).toBe(0.78);
    expect(getGestureScore(categories, "Closed_Fist", { threshold: 0.8 })).toBe(0);
  });

  it("returns zero when the gesture is disabled", () => {
    const categories = [{ categoryName: "Closed_Fist", score: 0.95 }];

    expect(
      getGestureScore(categories, "Closed_Fist", {
        threshold: 0.5,
        enabledGestures: { Closed_Fist: false },
      }),
    ).toBe(0);
  });
});

describe("getMaxGestureScore", () => {
  it("uses the strongest matching score across hands", () => {
    const gesturesList = [
      [{ categoryName: "Closed_Fist", score: 0.62 }],
      [{ categoryName: "Closed_Fist", score: 0.91 }],
    ];

    expect(getMaxGestureScore(gesturesList, "Closed_Fist", { threshold: 0.5 })).toBe(0.91);
  });
});

describe("updateGestureStabilizer", () => {
  it("filters out one or two frame gesture spikes", () => {
    const state = createGestureStabilizer({ stableFrames: 3 });
    const fist = { categoryName: "Closed_Fist", score: 0.92 };
    const victory = { categoryName: "Victory", score: 0.9 };

    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })).toBeNull();
    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })).toBeNull();
    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");

    expect(updateGestureStabilizer(state, victory, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
    expect(updateGestureStabilizer(state, victory, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
  });

  it("switches to a new gesture after it remains stable", () => {
    const state = createGestureStabilizer({ stableFrames: 2 });
    const fist = { categoryName: "Closed_Fist", score: 0.92 };
    const palm = { categoryName: "Open_Palm", score: 0.86 };

    updateGestureStabilizer(state, fist, { threshold: 0.5 });
    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
    expect(updateGestureStabilizer(state, palm, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
    expect(updateGestureStabilizer(state, palm, { threshold: 0.5 })?.categoryName).toBe("Open_Palm");
  });

  it("clears stable state when the gesture drops below threshold or is disabled", () => {
    const state = createGestureStabilizer({ stableFrames: 1 });
    const fist = { categoryName: "Closed_Fist", score: 0.92 };

    expect(updateGestureStabilizer(state, fist, { threshold: 0.5 })?.categoryName).toBe("Closed_Fist");
    expect(updateGestureStabilizer(state, { categoryName: "Closed_Fist", score: 0.2 }, { threshold: 0.5 })).toBeNull();
    expect(updateGestureStabilizer(state, fist, { threshold: 0.5, enabledGestures: { Closed_Fist: false } })).toBeNull();
  });
});

describe("recognizeDigitGesture", () => {
  it("recognizes digit gestures from extended fingers", () => {
    expect(recognizeDigitGesture(createDigitLandmarks(["index"]))?.digit).toBe("1");
    expect(recognizeDigitGesture(createDigitLandmarks(["index", "middle"]))?.digit).toBe("2");
    expect(recognizeDigitGesture(createDigitLandmarks(["index", "middle", "ring"]))?.digit).toBe("3");
    expect(recognizeDigitGesture(createDigitLandmarks(["index", "middle", "ring", "pinky"]))?.digit).toBe("4");
    expect(recognizeDigitGesture(createDigitLandmarks(["thumb", "index", "middle", "ring", "pinky"]))?.digit).toBe("5");
  });

  it("returns null for unsupported finger combinations", () => {
    expect(recognizeDigitGesture(createDigitLandmarks(["thumb", "index"]))).toBeNull();
    expect(recognizeDigitGesture(null)).toBeNull();
  });
});

describe("updateDigitStabilizer", () => {
  it("requires extra stable frames when retracting from a larger digit", () => {
    const state = createGestureStabilizer({ stableFrames: 2 });
    const five = { categoryName: "Digit_5", digit: "5", score: 1 };
    const four = { categoryName: "Digit_4", digit: "4", score: 1 };

    updateDigitStabilizer(state, five, { threshold: 0.5, retractFrames: 5 });
    expect(updateDigitStabilizer(state, five, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("5");

    for (let index = 0; index < 4; index += 1) {
      expect(updateDigitStabilizer(state, four, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("5");
    }

    expect(updateDigitStabilizer(state, four, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("4");
  });

  it("ignores brief retracting digits when the original digit returns", () => {
    const state = createGestureStabilizer({ stableFrames: 2 });
    const four = { categoryName: "Digit_4", digit: "4", score: 1 };
    const three = { categoryName: "Digit_3", digit: "3", score: 1 };

    updateDigitStabilizer(state, four, { threshold: 0.5, retractFrames: 5 });
    expect(updateDigitStabilizer(state, four, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("4");
    expect(updateDigitStabilizer(state, three, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("4");
    expect(updateDigitStabilizer(state, three, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("4");
    expect(updateDigitStabilizer(state, four, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("4");
  });

  it("keeps normal frame requirements when switching upward", () => {
    const state = createGestureStabilizer({ stableFrames: 2 });
    const three = { categoryName: "Digit_3", digit: "3", score: 1 };
    const five = { categoryName: "Digit_5", digit: "5", score: 1 };

    updateDigitStabilizer(state, three, { threshold: 0.5, retractFrames: 5 });
    expect(updateDigitStabilizer(state, three, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("3");
    expect(updateDigitStabilizer(state, five, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("3");
    expect(updateDigitStabilizer(state, five, { threshold: 0.5, retractFrames: 5 })?.digit).toBe("5");
  });

  it("requires digits to hold for the configured duration before switching", () => {
    const state = createGestureStabilizer({ stableFrames: 1 });
    const one = { categoryName: "Digit_1", digit: "1", score: 1 };
    const two = { categoryName: "Digit_2", digit: "2", score: 1 };

    expect(updateDigitStabilizer(state, one, { threshold: 0.5, stableMs: 300, now: 1000 })).toBeNull();
    expect(updateDigitStabilizer(state, one, { threshold: 0.5, stableMs: 300, now: 1299 })).toBeNull();
    expect(updateDigitStabilizer(state, one, { threshold: 0.5, stableMs: 300, now: 1300 })?.digit).toBe("1");

    expect(updateDigitStabilizer(state, two, { threshold: 0.5, stableMs: 300, now: 1400 })?.digit).toBe("1");
    expect(updateDigitStabilizer(state, two, { threshold: 0.5, stableMs: 300, now: 1699 })?.digit).toBe("1");
    expect(updateDigitStabilizer(state, two, { threshold: 0.5, stableMs: 300, now: 1700 })?.digit).toBe("2");
  });
});

function createDigitLandmarks(extendedFingers) {
  const extended = new Set(extendedFingers);
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));

  landmarks[0] = { x: 0.5, y: 0.9, z: 0 };
  landmarks[2] = { x: 0.42, y: 0.68, z: 0 };
  landmarks[3] = { x: 0.38, y: 0.62, z: 0 };
  landmarks[4] = extended.has("thumb")
    ? { x: 0.2, y: 0.54, z: 0 }
    : { x: 0.46, y: 0.72, z: 0 };
  landmarks[5] = { x: 0.43, y: 0.62, z: 0 };
  landmarks[6] = { x: 0.44, y: 0.48, z: 0 };
  landmarks[8] = { x: 0.44, y: extended.has("index") ? 0.24 : 0.6, z: 0 };
  landmarks[10] = { x: 0.5, y: 0.45, z: 0 };
  landmarks[12] = { x: 0.5, y: extended.has("middle") ? 0.2 : 0.58, z: 0 };
  landmarks[14] = { x: 0.56, y: 0.48, z: 0 };
  landmarks[16] = { x: 0.56, y: extended.has("ring") ? 0.25 : 0.61, z: 0 };
  landmarks[17] = { x: 0.62, y: 0.66, z: 0 };
  landmarks[18] = { x: 0.62, y: 0.52, z: 0 };
  landmarks[20] = { x: 0.62, y: extended.has("pinky") ? 0.31 : 0.64, z: 0 };

  return landmarks;
}
