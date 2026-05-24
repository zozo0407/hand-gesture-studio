export const PROJECT_SLUG = "mediapipe-hand-gesture-workshop";

export const MEDIAPIPE_ASSETS = {
  modelUrl: "/mediapipe/models/gesture_recognizer.task",
  wasmUrl: "/mediapipe/wasm",
};

export const STORAGE_KEYS = {
  settings: `${PROJECT_SLUG}:settings:v1`,
  presets: `${PROJECT_SLUG}:presets:v1`,
  collapsedPanels: `${PROJECT_SLUG}:collapsed-panels:v1`,
};

export const GESTURE_STABILIZATION = {
  stableFrames: 3,
  digitStableHoldMs: 300,
};
