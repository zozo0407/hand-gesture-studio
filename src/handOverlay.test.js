import { describe, expect, it } from "vitest";
import {
  createCircleFromLandmarks,
  createConnectedRegionFromHands,
  createLineFromLandmarks,
  createNormalizedValues,
  findHandIndex,
  findLeftHandIndex,
  formatNormalizedValues,
  getShapeLabel,
  smoothCircle,
  smoothLine,
  smoothRegion,
} from "./handOverlay.js";

describe("findHandIndex", () => {
  it("returns the index whose top handedness category matches the requested hand", () => {
    const handednesses = [
      [{ categoryName: "Right", score: 0.93 }],
      [{ categoryName: "Left", score: 0.86 }],
    ];

    expect(findHandIndex(handednesses, "Right")).toBe(0);
    expect(findHandIndex(handednesses, "Left")).toBe(1);
  });

  it("returns -1 when the requested hand is not present", () => {
    const handednesses = [[{ categoryName: "Right", score: 0.98 }]];

    expect(findHandIndex(handednesses, "Left")).toBe(-1);
  });
});

describe("findLeftHandIndex", () => {
  it("keeps the previous left-hand helper behavior", () => {
    const handednesses = [
      [{ categoryName: "Right", score: 0.93 }],
      [{ categoryName: "Left", score: 0.86 }],
    ];

    expect(findLeftHandIndex(handednesses)).toBe(1);
  });

  it("returns -1 when no left hand is present", () => {
    const handednesses = [[{ categoryName: "Right", score: 0.98 }]];

    expect(findLeftHandIndex(handednesses)).toBe(-1);
  });
});

describe("createCircleFromLandmarks", () => {
  it("uses landmarks 4 and 8 to create a midpoint center and distance diameter", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[4] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[8] = { x: 0.8, y: 0.3, z: 0 };

    const circle = createCircleFromLandmarks(landmarks);

    expect(circle.x).toBeCloseTo(0.5);
    expect(circle.y).toBeCloseTo(0.3);
    expect(circle.radius).toBeCloseTo(0.3);
  });

  it("uses canvas dimensions when calculating pixel distance", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[4] = { x: 0.25, y: 0.25, z: 0 };
    landmarks[8] = { x: 0.25, y: 0.75, z: 0 };

    expect(createCircleFromLandmarks(landmarks, 800, 600)).toEqual({
      x: 200,
      y: 300,
      radius: 150,
    });
  });
});

describe("createLineFromLandmarks", () => {
  it("connects thumb tip landmark 4 to index tip landmark 8 in canvas pixels", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[4] = { x: 0.1, y: 0.2, z: 0 };
    landmarks[8] = { x: 0.4, y: 0.6, z: 0 };

    expect(createLineFromLandmarks(landmarks, 1000, 500)).toEqual({
      start: { x: 100, y: 100 },
      end: { x: 400, y: 300 },
    });
  });
});

describe("createConnectedRegionFromHands", () => {
  it("creates a four-point region from both hands' thumb and index tips", () => {
    const leftLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const rightLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    leftLandmarks[4] = { x: 0.2, y: 0.3, z: 0 };
    leftLandmarks[8] = { x: 0.2, y: 0.7, z: 0 };
    rightLandmarks[4] = { x: 0.8, y: 0.3, z: 0 };
    rightLandmarks[8] = { x: 0.8, y: 0.7, z: 0 };

    const region = createConnectedRegionFromHands(leftLandmarks, rightLandmarks, 1000, 500);

    expect(region.points).toHaveLength(4);
    expect(region.points).toEqual([
      { x: 200, y: 150 },
      { x: 800, y: 150 },
      { x: 800, y: 350 },
      { x: 200, y: 350 },
    ]);
    expect(region.length).toBeCloseTo(0.6);
  });

  it("returns null when either hand is missing required landmarks", () => {
    expect(createConnectedRegionFromHands([], [])).toBeNull();
  });
});

describe("createNormalizedValues", () => {
  it("returns 0-1 values for thumb/index points, center, radius, and length", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[4] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[8] = { x: 0.8, y: 0.3, z: 0 };

    const values = createNormalizedValues(landmarks);

    expect(values.thumb).toEqual({ x: 0.2, y: 0.3 });
    expect(values.index).toEqual({ x: 0.8, y: 0.3 });
    expect(values.center).toEqual({ x: 0.5, y: 0.3 });
    expect(values.radius).toBeCloseTo(0.3);
    expect(values.length).toBeCloseTo(0.6);
  });
});

describe("formatNormalizedValues", () => {
  it("formats line mode values as a single normalized length", () => {
    const values = {
      thumb: { x: 0.1234, y: 0.5 },
      index: { x: 0.9876, y: 0.25 },
      center: { x: 0.5555, y: 0.375 },
      radius: 0.4321,
      length: 0.64,
    };

    expect(formatNormalizedValues("line", values)).toEqual(["长度 0.6"]);
  });

  it("formats circle mode values as a single normalized length", () => {
    const values = {
      thumb: { x: 0.1234, y: 0.5 },
      index: { x: 0.9876, y: 0.25 },
      center: { x: 0.5555, y: 0.375 },
      radius: 0.4321,
      length: 0.86,
    };

    expect(formatNormalizedValues("circle", values)).toEqual(["长度 0.9"]);
  });

  it("snaps very small and very large lengths to 0 and 1", () => {
    expect(formatNormalizedValues("line", { length: 0.09 })).toEqual(["长度 0"]);
    expect(formatNormalizedValues("circle", { length: 0.91 })).toEqual(["长度 1"]);
  });
});

describe("getShapeLabel", () => {
  it("maps shape values to Chinese labels", () => {
    expect(getShapeLabel("line")).toBe("连线");
    expect(getShapeLabel("circle")).toBe("圆圈");
    expect(getShapeLabel("connected")).toBe("左右手相连");
  });
});

describe("smoothCircle", () => {
  it("interpolates from the previous circle toward the next circle", () => {
    const previous = { x: 100, y: 100, radius: 20 };
    const next = { x: 200, y: 300, radius: 40 };

    expect(smoothCircle(previous, next, 0.25)).toEqual({
      x: 125,
      y: 150,
      radius: 25,
    });
  });

  it("returns the next circle unchanged when there is no previous circle", () => {
    const next = { x: 200, y: 300, radius: 40 };

    expect(smoothCircle(null, next, 0.4)).toEqual(next);
  });
});

describe("smoothLine", () => {
  it("interpolates both line endpoints", () => {
    const previous = {
      start: { x: 0, y: 10 },
      end: { x: 100, y: 110 },
    };
    const next = {
      start: { x: 40, y: 50 },
      end: { x: 180, y: 210 },
    };

    expect(smoothLine(previous, next, 0.5)).toEqual({
      start: { x: 20, y: 30 },
      end: { x: 140, y: 160 },
    });
  });
});

describe("smoothRegion", () => {
  it("interpolates region points and length", () => {
    const previous = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      length: 0.2,
    };
    const next = {
      points: [
        { x: 40, y: 20 },
        { x: 180, y: 60 },
      ],
      length: 0.6,
    };

    expect(smoothRegion(previous, next, 0.5)).toEqual({
      points: [
        { x: 20, y: 10 },
        { x: 140, y: 30 },
      ],
      length: 0.4,
    });
  });
});
