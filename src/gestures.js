export const SUPPORTED_GESTURES = [
  { categoryName: "Closed_Fist", zhLabel: "握拳" },
  { categoryName: "Open_Palm", zhLabel: "张开手掌" },
  { categoryName: "Pointing_Up", zhLabel: "食指向上" },
  { categoryName: "Thumb_Up", zhLabel: "点赞" },
  { categoryName: "Thumb_Down", zhLabel: "倒赞" },
  { categoryName: "Victory", zhLabel: "比耶" },
  { categoryName: "ILoveYou", zhLabel: "我爱你" },
];

const GESTURE_LABELS_ZH = Object.fromEntries(
  SUPPORTED_GESTURES.map((gesture) => [gesture.categoryName, gesture.zhLabel]),
);

const EMPTY_GESTURES = new Set(["None", "Unknown"]);
const DEFAULT_STABLE_FRAMES = 3;
const WRIST = 0;
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;
const DIGIT_PATTERNS = {
  1: { thumb: false, index: true, middle: false, ring: false, pinky: false },
  2: { thumb: false, index: true, middle: true, ring: false, pinky: false },
  3: { thumb: false, index: true, middle: true, ring: true, pinky: false },
  4: { thumb: false, index: true, middle: true, ring: true, pinky: true },
  5: { thumb: true, index: true, middle: true, ring: true, pinky: true },
};

export function getGestureLabel(categoryName, language = "zh") {
  if (language === "en") {
    return categoryName;
  }

  return GESTURE_LABELS_ZH[categoryName] ?? categoryName;
}

export function isGestureEnabled(categoryName, enabledGestures) {
  return enabledGestures?.[categoryName] !== false;
}

export function getGestureScore(categories, categoryName, { threshold = 0, enabledGestures } = {}) {
  if (!isGestureEnabled(categoryName, enabledGestures)) {
    return 0;
  }

  const scoreThreshold = normalizeScore(threshold);
  const categoryList = Array.isArray(categories) ? categories : categories ? [categories] : [];
  const score = Math.max(
    0,
    ...categoryList.map((category) =>
      category?.categoryName === categoryName ? normalizeScore(category.score) : 0,
    ),
  );

  return score >= scoreThreshold ? score : 0;
}

export function getMaxGestureScore(gesturesList, categoryName, options = {}) {
  return Math.max(
    0,
    ...Array.from(gesturesList ?? [], (categories) =>
      getGestureScore(categories, categoryName, options),
    ),
  );
}

export function formatGesture(category, { language = "zh", threshold = 0.5, enabledGestures } = {}) {
  if (!category || EMPTY_GESTURES.has(category.categoryName) || category.score < threshold) {
    return null;
  }

  if (!isGestureEnabled(category.categoryName, enabledGestures)) {
    return null;
  }

  return `${getGestureLabel(category.categoryName, language)} ${category.score.toFixed(2)}`;
}

export function createGestureStabilizer({ stableFrames = DEFAULT_STABLE_FRAMES } = {}) {
  return {
    stableCategory: null,
    candidateCategory: null,
    candidateCount: 0,
    candidateStartedAt: null,
    stableFrames: Math.max(1, Math.round(Number(stableFrames) || DEFAULT_STABLE_FRAMES)),
  };
}

export function recognizeDigitGesture(landmarks) {
  const fingers = getExtendedFingers(landmarks);

  if (!fingers) {
    return null;
  }

  for (const [digit, pattern] of Object.entries(DIGIT_PATTERNS)) {
    if (matchesFingerPattern(fingers, pattern)) {
      return {
        categoryName: `Digit_${digit}`,
        digit,
        score: 1,
      };
    }
  }

  return null;
}

export function updateGestureStabilizer(state, category, { threshold = 0.5, enabledGestures } = {}) {
  const nextCategory = normalizeGestureCategory(category, { threshold, enabledGestures });

  if (!nextCategory) {
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
    state.stableCategory = null;
    return null;
  }

  if (isSameGesture(state.stableCategory, nextCategory)) {
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
    state.stableCategory = blendGestureScore(state.stableCategory, nextCategory);
    return state.stableCategory;
  }

  if (isSameGesture(state.candidateCategory, nextCategory)) {
    state.candidateCount += 1;
    state.candidateCategory = blendGestureScore(state.candidateCategory, nextCategory);
  } else {
    state.candidateCategory = nextCategory;
    state.candidateCount = 1;
    state.candidateStartedAt = null;
  }

  if (state.candidateCount >= state.stableFrames) {
    state.stableCategory = state.candidateCategory;
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
  }

  return state.stableCategory;
}

export function updateDigitStabilizer(
  state,
  category,
  { threshold = 0.5, retractFrames = state.stableFrames + 3, stableMs = 0, now } = {},
) {
  const nextCategory = normalizeGestureCategory(category, { threshold });
  const currentTime = getCurrentTime(now);
  const requiredMs = Math.max(0, Number(stableMs) || 0);

  if (!nextCategory) {
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
    state.stableCategory = null;
    return null;
  }

  if (isSameGesture(state.stableCategory, nextCategory)) {
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
    state.stableCategory = blendGestureScore(state.stableCategory, nextCategory);
    return state.stableCategory;
  }

  if (isSameGesture(state.candidateCategory, nextCategory)) {
    state.candidateCount += 1;
    state.candidateCategory = blendGestureScore(state.candidateCategory, nextCategory);
    state.candidateStartedAt ??= currentTime;
  } else {
    state.candidateCategory = nextCategory;
    state.candidateCount = 1;
    state.candidateStartedAt = currentTime;
  }

  const requiredFrames = isRetractingDigit(state.stableCategory, nextCategory)
    ? Math.max(state.stableFrames, Math.round(Number(retractFrames) || state.stableFrames))
    : state.stableFrames;
  const hasEnoughFrames = requiredMs > 0 ? state.candidateCount >= 1 : state.candidateCount >= requiredFrames;
  const hasEnoughTime = requiredMs <= 0 || currentTime - state.candidateStartedAt >= requiredMs;

  if (hasEnoughFrames && hasEnoughTime) {
    state.stableCategory = state.candidateCategory;
    state.candidateCategory = null;
    state.candidateCount = 0;
    state.candidateStartedAt = null;
  }

  return state.stableCategory;
}

function getCurrentTime(now) {
  const timestamp = Number(now);

  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function normalizeScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(1, Math.max(0, score));
}

function normalizeGestureCategory(category, { threshold, enabledGestures }) {
  if (
    !category ||
    EMPTY_GESTURES.has(category.categoryName) ||
    normalizeScore(category.score) < normalizeScore(threshold) ||
    !isGestureEnabled(category.categoryName, enabledGestures)
  ) {
    return null;
  }

  return {
    categoryName: category.categoryName,
    ...(category.digit ? { digit: String(category.digit) } : {}),
    score: normalizeScore(category.score),
  };
}

function getExtendedFingers(landmarks) {
  const requiredIndexes = [
    WRIST,
    THUMB_MCP,
    THUMB_IP,
    THUMB_TIP,
    INDEX_MCP,
    INDEX_PIP,
    INDEX_TIP,
    MIDDLE_PIP,
    MIDDLE_TIP,
    RING_PIP,
    RING_TIP,
    PINKY_MCP,
    PINKY_PIP,
    PINKY_TIP,
  ];

  if (!landmarks || requiredIndexes.some((index) => !landmarks[index])) {
    return null;
  }

  return {
    thumb: isThumbExtended(landmarks),
    index: isFingerExtended(landmarks[INDEX_TIP], landmarks[INDEX_PIP]),
    middle: isFingerExtended(landmarks[MIDDLE_TIP], landmarks[MIDDLE_PIP]),
    ring: isFingerExtended(landmarks[RING_TIP], landmarks[RING_PIP]),
    pinky: isFingerExtended(landmarks[PINKY_TIP], landmarks[PINKY_PIP]),
  };
}

function isFingerExtended(tip, pip) {
  return tip.y < pip.y - 0.025;
}

function isThumbExtended(landmarks) {
  const thumbTip = landmarks[THUMB_TIP];
  const thumbIp = landmarks[THUMB_IP];
  const thumbMcp = landmarks[THUMB_MCP];
  const indexMcp = landmarks[INDEX_MCP];
  const pinkyMcp = landmarks[PINKY_MCP];
  const wrist = landmarks[WRIST];
  const palmWidth = distance(indexMcp, pinkyMcp);
  const thumbSpread = distance(thumbTip, indexMcp) - distance(thumbIp, indexMcp);
  const thumbReach = distance(thumbTip, wrist) - distance(thumbMcp, wrist);

  return thumbSpread > palmWidth * 0.18 && thumbReach > palmWidth * 0.04;
}

function matchesFingerPattern(fingers, pattern) {
  return Object.entries(pattern).every(([finger, isExtended]) => fingers[finger] === isExtended);
}

function isSameGesture(first, second) {
  return first?.categoryName === second?.categoryName;
}

function blendGestureScore(previous, next) {
  return {
    categoryName: next.categoryName,
    ...(next.digit ? { digit: String(next.digit) } : {}),
    score: previous ? previous.score * 0.65 + next.score * 0.35 : next.score,
  };
}

function isRetractingDigit(previous, next) {
  const previousDigit = Number(previous?.digit);
  const nextDigit = Number(next?.digit);

  return Number.isFinite(previousDigit) && Number.isFinite(nextDigit) && nextDigit < previousDigit;
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}
