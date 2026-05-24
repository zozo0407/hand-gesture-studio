const THUMB_TIP = 4;
const INDEX_TIP = 8;
const SHAPE_LABELS = {
  line: "连线",
  circle: "圆圈",
  connected: "左右手相连",
};

export function findHandIndex(handednesses, label) {
  return handednesses.findIndex((handedness) => {
    const topCategory = handedness?.[0];
    return topCategory?.categoryName === label;
  });
}

export function findLeftHandIndex(handednesses) {
  return findHandIndex(handednesses, "Left");
}

export function createCircleFromLandmarks(landmarks, width = 1, height = 1) {
  const thumbTip = landmarks?.[THUMB_TIP];
  const indexTip = landmarks?.[INDEX_TIP];

  if (!thumbTip || !indexTip) {
    return null;
  }

  const thumbX = thumbTip.x * width;
  const thumbY = thumbTip.y * height;
  const indexX = indexTip.x * width;
  const indexY = indexTip.y * height;
  const dx = indexX - thumbX;
  const dy = indexY - thumbY;
  const diameter = Math.hypot(dx, dy);

  return {
    x: (thumbX + indexX) / 2,
    y: (thumbY + indexY) / 2,
    radius: diameter / 2,
  };
}

export function createLineFromLandmarks(landmarks, width = 1, height = 1) {
  const thumbTip = landmarks?.[THUMB_TIP];
  const indexTip = landmarks?.[INDEX_TIP];

  if (!thumbTip || !indexTip) {
    return null;
  }

  return {
    start: pointToPixels(thumbTip, width, height),
    end: pointToPixels(indexTip, width, height),
  };
}

export function createConnectedRegionFromHands(leftLandmarks, rightLandmarks, width = 1, height = 1) {
  const points = [
    leftLandmarks?.[THUMB_TIP],
    leftLandmarks?.[INDEX_TIP],
    rightLandmarks?.[THUMB_TIP],
    rightLandmarks?.[INDEX_TIP],
  ];

  if (points.some((point) => !point)) {
    return null;
  }

  const pixelPoints = sortPointsClockwise(points.map((point) => pointToPixels(point, width, height)));
  const normalizedLeftThumb = leftLandmarks[THUMB_TIP];
  const normalizedLeftIndex = leftLandmarks[INDEX_TIP];
  const normalizedRightThumb = rightLandmarks[THUMB_TIP];
  const normalizedRightIndex = rightLandmarks[INDEX_TIP];
  const thumbLength = distance(normalizedLeftThumb, normalizedRightThumb);
  const indexLength = distance(normalizedLeftIndex, normalizedRightIndex);

  return {
    points: pixelPoints,
    length: (thumbLength + indexLength) / 2,
  };
}

export function createNormalizedValues(landmarks) {
  const thumbTip = landmarks?.[THUMB_TIP];
  const indexTip = landmarks?.[INDEX_TIP];

  if (!thumbTip || !indexTip) {
    return null;
  }

  const dx = indexTip.x - thumbTip.x;
  const dy = indexTip.y - thumbTip.y;

  return {
    thumb: { x: thumbTip.x, y: thumbTip.y },
    index: { x: indexTip.x, y: indexTip.y },
    center: {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
    },
    radius: Math.hypot(dx, dy) / 2,
    length: Math.hypot(dx, dy),
  };
}

export function formatNormalizedValues(_shape, values) {
  if (!values) {
    return [];
  }

  return [`长度 ${formatLength(values.length)}`];
}

export function getShapeLabel(shape) {
  return SHAPE_LABELS[shape] ?? SHAPE_LABELS.line;
}

export function smoothCircle(previousCircle, nextCircle, smoothing) {
  if (!previousCircle || !nextCircle) {
    return nextCircle;
  }

  const amount = clamp(Number(smoothing), 0, 1);

  return {
    x: lerp(previousCircle.x, nextCircle.x, amount),
    y: lerp(previousCircle.y, nextCircle.y, amount),
    radius: lerp(previousCircle.radius, nextCircle.radius, amount),
  };
}

export function smoothLine(previousLine, nextLine, smoothing) {
  if (!previousLine || !nextLine) {
    return nextLine;
  }

  const amount = clamp(Number(smoothing), 0, 1);

  return {
    start: {
      x: lerp(previousLine.start.x, nextLine.start.x, amount),
      y: lerp(previousLine.start.y, nextLine.start.y, amount),
    },
    end: {
      x: lerp(previousLine.end.x, nextLine.end.x, amount),
      y: lerp(previousLine.end.y, nextLine.end.y, amount),
    },
  };
}

export function smoothRegion(previousRegion, nextRegion, smoothing) {
  if (!previousRegion || !nextRegion || previousRegion.points.length !== nextRegion.points.length) {
    return nextRegion;
  }

  const amount = clamp(Number(smoothing), 0, 1);

  return {
    ...nextRegion,
    points: nextRegion.points.map((point, index) => ({
      x: lerp(previousRegion.points[index].x, point.x, amount),
      y: lerp(previousRegion.points[index].y, point.y, amount),
    })),
    length: lerp(previousRegion.length, nextRegion.length, amount),
  };
}

function pointToPixels(point, width, height) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function sortPointsClockwise(points) {
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };

  return points
    .slice()
    .sort((first, second) => Math.atan2(first.y - center.y, first.x - center.x) - Math.atan2(second.y - center.y, second.x - center.x));
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function formatLength(value) {
  const clamped = clamp(value, 0, 1);

  if (clamped < 0.1) {
    return "0";
  }

  if (clamped > 0.9) {
    return "1";
  }

  return clamped.toFixed(1);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
