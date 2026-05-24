const PANEL_IDS_BY_VIEW = {
  joints: ["presets", "visualization", "areaEffects", "audio", "camera"],
  gestures: ["presets", "gestureDetection"],
};

export function normalizeView(view) {
  return Object.hasOwn(PANEL_IDS_BY_VIEW, view) ? view : "joints";
}

export function getVisiblePanelIds(view) {
  return PANEL_IDS_BY_VIEW[normalizeView(view)];
}
