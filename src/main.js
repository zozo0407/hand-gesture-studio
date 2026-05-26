import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import "./styles.css";
import {
  createCircleFromLandmarks,
  createConnectedRegionFromHands,
  createLineFromLandmarks,
  createNormalizedValues,
  findHandIndex,
  formatNormalizedValues,
  getShapeLabel,
  smoothCircle,
  smoothLine,
  smoothRegion,
} from "./handOverlay.js";
import { AREA_EFFECT_TYPES, createPixelEffectSettings } from "./areaEffects.js";
import { LiquidGlassRenderer } from "./liquidGlassShader.js";
import { HandAudioController } from "./audioMapping.js";
import {
  createGestureStabilizer,
  formatGesture,
  recognizeDigitGesture,
  updateDigitStabilizer,
  updateGestureStabilizer,
} from "./gestures.js";
import {
  DEFAULT_SETTINGS,
  PRESET_SLOTS,
  hasPreset,
  readPreset,
  readSettings,
  writePreset,
  writeSettings,
} from "./settings.js";
import { getVisiblePanelIds, normalizeView } from "./viewState.js";
import {
  GESTURE_STABILIZATION,
  MEDIAPIPE_ASSETS,
  STORAGE_KEYS,
} from "./projectConfig.js";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const TWO_PI = Math.PI * 2;

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const stage = document.querySelector(".stage");
const context = canvas.getContext("2d");
const handModePanel = document.querySelector(".hand-mode-panel");
const handedModeGroups = document.querySelectorAll("[data-handed-mode-group]");
const statusLabel = document.querySelector("#status");
const startButton = document.querySelector("#startButton");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const resetSettingsButton = document.querySelector("#resetSettingsButton");
const presetActions = document.querySelectorAll("[data-preset-action]");
const presetStates = new Map(
  Array.from(document.querySelectorAll("[data-preset-state]"), (element) => [
    element.dataset.presetState,
    element,
  ]),
);
const navItems = document.querySelectorAll(".nav-item[data-view]");
const panelCards = document.querySelectorAll(".control-card[data-panel-id]");
const collapseButtons = document.querySelectorAll(".collapse-button");
const controls = {
  showLandmarks: document.querySelector("#showLandmarks"),
  showCircle: document.querySelector("#showCircle"),
  showValues: document.querySelector("#showValues"),
  showAreaEffect: document.querySelector("#showAreaEffect"),
  areaEffectType: document.querySelector("#areaEffectType"),
  areaEffectIntensity: document.querySelector("#areaEffectIntensity"),
  areaEffectSpeed: document.querySelector("#areaEffectSpeed"),
  areaEffectOpacity: document.querySelector("#areaEffectOpacity"),
  audioEnabled: document.querySelector("#audioEnabled"),
  audioMasterVolume: document.querySelector("#audioMasterVolume"),
  audioBpm: document.querySelector("#audioBpm"),
  audioRhythmDensity: document.querySelector("#audioRhythmDensity"),
  showGestures: document.querySelector("#showGestures"),
  toggleAllGestures: document.querySelector("#toggleAllGestures"),
  gestureToggles: document.querySelectorAll('input[name="enabledGesture"]'),
  handAreaModes: document.querySelectorAll('input[name="handAreaMode"]'),
  leftModes: document.querySelectorAll('input[name="leftMode"]'),
  rightModes: document.querySelectorAll('input[name="rightMode"]'),
  aspectRatioModes: document.querySelectorAll('input[name="aspectRatioMode"]'),
  gestureLabelLanguages: document.querySelectorAll('input[name="gestureLabelLanguage"]'),
  circleColor: document.querySelector("#circleColor"),
  lineWidth: document.querySelector("#lineWidth"),
  smoothing: document.querySelector("#smoothing"),
  gestureScoreThreshold: document.querySelector("#gestureScoreThreshold"),
  circleColorValue: document.querySelector("#circleColorValue"),
  lineWidthValue: document.querySelector("#lineWidthValue"),
  smoothingValue: document.querySelector("#smoothingValue"),
  areaEffectIntensityValue: document.querySelector("#areaEffectIntensityValue"),
  areaEffectSpeedValue: document.querySelector("#areaEffectSpeedValue"),
  areaEffectOpacityValue: document.querySelector("#areaEffectOpacityValue"),
  audioMasterVolumeValue: document.querySelector("#audioMasterVolumeValue"),
  audioBpmValue: document.querySelector("#audioBpmValue"),
  audioRhythmDensityValue: document.querySelector("#audioRhythmDensityValue"),
  gestureScoreThresholdValue: document.querySelector("#gestureScoreThresholdValue"),
  enabledGesturesValue: document.querySelector("#enabledGesturesValue"),
  quickToggleButtons: document.querySelectorAll("[data-quick-toggle]"),
};

let gestureRecognizer;
let stream;
let animationFrameId;
let lastVideoTime = -1;
let pixelBuffer;
let pixelBufferContext;
let heatmapBuffer;
let heatmapBufferContext;
let liquidGlassRenderer;
const handAudio = new HandAudioController();
const smoothedShapes = {
  Left: { circle: null, line: null },
  Right: { circle: null, line: null },
  Connected: { region: null },
};
const gestureStabilizers = {
  Left: createGestureStabilizer({ stableFrames: GESTURE_STABILIZATION.stableFrames }),
  Right: createGestureStabilizer({ stableFrames: GESTURE_STABILIZATION.stableFrames }),
};
const digitStabilizers = {
  Left: createGestureStabilizer({ stableFrames: GESTURE_STABILIZATION.stableFrames }),
  Right: createGestureStabilizer({ stableFrames: GESTURE_STABILIZATION.stableFrames }),
};

applySettings(readSettings());
bindSettingsPersistence();
bindGestureControls();
bindPresetControls();
bindViewNavigation();
bindPanelCollapse();
bindQuickControls();
setActiveView("joints");
updatePresetStates();

controls.lineWidth.addEventListener("input", () => {
  syncOutputValues();
});

controls.smoothing.addEventListener("input", () => {
  syncOutputValues();
});

controls.gestureScoreThreshold.addEventListener("input", () => {
  syncOutputValues();
});

controls.audioEnabled.addEventListener("change", () => {
  handAudio.setEnabled(controls.audioEnabled.checked);
});

controls.audioMasterVolume.addEventListener("input", () => {
  syncOutputValues();
});

controls.audioBpm.addEventListener("input", () => {
  syncOutputValues();
});

controls.audioRhythmDensity.addEventListener("input", () => {
  syncOutputValues();
});

for (const option of controls.aspectRatioModes) {
  option.addEventListener("change", () => {
    updateStageAspect();
  });
}

for (const option of controls.handAreaModes) {
  option.addEventListener("change", () => {
    updateHandModeControls();
  });
}

startButton.addEventListener("click", async () => {
  if (stream) {
    stopCamera();
    return;
  }

  try {
    updateCameraButton(false, true);
    updateStatus("加载模型中");
    await ensureGestureRecognizer();
    handAudio.setEnabled(controls.audioEnabled.checked);
    await startCamera();
    updateCameraButton(true);
    updateStatus("等待左右手进入画面");
    loop();
  } catch (error) {
    console.error(error);
    stopCamera(error instanceof Error ? error.message : "摄像头启动失败");
  }
});

saveSettingsButton.addEventListener("click", () => {
  persistCurrentSettings();
  updateStatus("设置已保存");
});

resetSettingsButton.addEventListener("click", () => {
  applySettings(DEFAULT_SETTINGS);
  persistCurrentSettings();
  resetAllSmoothedShapes();
  resetAllStableGestures();
  handAudio.setEnabled(controls.audioEnabled.checked);
  updateStatus("已重置为初始参数");
});

async function ensureGestureRecognizer() {
  if (gestureRecognizer) {
    return gestureRecognizer;
  }

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_ASSETS.wasmUrl);
  gestureRecognizer = await createGestureRecognizer(vision, "GPU").catch(() =>
    createGestureRecognizer(vision, "CPU"),
  );

  return gestureRecognizer;
}

function createGestureRecognizer(vision, delegate) {
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MEDIAPIPE_ASSETS.modelUrl,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    cannedGesturesClassifierOptions: {
      scoreThreshold: 0,
    },
  });
}

async function startCamera() {
  if (stream) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头访问");
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
  resizeCanvas();
}

function stopCamera(message = "摄像头已关闭") {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = undefined;
  }

  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video.pause();
  video.srcObject = null;
  lastVideoTime = -1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  resetAllSmoothedShapes();
  resetAllStableGestures();
  handAudio.stop();
  updateCameraButton(false);
  updateStatus(message);
}

function updateCameraButton(isRunning, isBusy = false) {
  startButton.disabled = isBusy;
  startButton.classList.toggle("is-running", isRunning);
  startButton.textContent = isRunning ? "■" : "▶";
  startButton.setAttribute("aria-label", isRunning ? "停止摄像头" : "开启摄像头");
}

function loop() {
  resizeCanvas();

  if (video.currentTime !== lastVideoTime && canvas.width > 0 && canvas.height > 0) {
    const results = gestureRecognizer.recognizeForVideo(video, performance.now());
    drawResults(results);
    lastVideoTime = video.currentTime;
  }

  animationFrameId = requestAnimationFrame(loop);
}

function drawResults(results) {
  context.clearRect(0, 0, canvas.width, canvas.height);

  const leftHandIndex = findHandIndex(results.handednesses, "Left");
  const rightHandIndex = findHandIndex(results.handednesses, "Right");
  const hasLeftHand = leftHandIndex !== -1;
  const hasRightHand = rightHandIndex !== -1;
  const leftValues = hasLeftHand ? createNormalizedValues(results.landmarks[leftHandIndex]) : null;
  const rightValues = hasRightHand ? createNormalizedValues(results.landmarks[rightHandIndex]) : null;
  const stableGestures = {
    Left: hasLeftHand ? getStableGesture("Left", results.gestures[leftHandIndex]?.[0]) : resetStableGesture("Left"),
    Right: hasRightHand ? getStableGesture("Right", results.gestures[rightHandIndex]?.[0]) : resetStableGesture("Right"),
  };
  const shouldReadRightHandDigit = hasRightHand && !hasLeftHand;
  const stableDigits = {
    Left: resetStableDigit("Left"),
    Right: shouldReadRightHandDigit ? getStableDigit("Right", results.landmarks[rightHandIndex]) : resetStableDigit("Right"),
  };
  const handAreaMode = getSelectedMode("handAreaMode");
  const isConnectedMode = handAreaMode === "connected";
  const modes = {
    Left: getSelectedMode("leftMode"),
    Right: getSelectedMode("rightMode"),
  };

  if (!hasLeftHand) {
    resetSmoothedShape("Left");
  }

  if (!hasRightHand) {
    resetSmoothedShape("Right");
  }

  if (!hasLeftHand || !hasRightHand || !isConnectedMode) {
    resetConnectedRegion();
  }

  updateAudioFromHands(leftValues, rightValues);
  updateStatus(createStatusText({ Left: hasLeftHand, Right: hasRightHand }, modes, handAreaMode));

  if (controls.showLandmarks.checked) {
    drawDetectedLandmarks(results.landmarks, [leftHandIndex, rightHandIndex]);
  }

  const smoothing = Number(controls.smoothing.value);

  if (isConnectedMode) {
    if (hasLeftHand && hasRightHand) {
      drawConnectedHandsOverlay(
        results.landmarks[leftHandIndex],
        results.landmarks[rightHandIndex],
        smoothing,
        leftValues,
        rightValues,
      );
    }

    drawDigitBadges(stableDigits);
    return;
  }

  if (hasLeftHand) {
    drawHandOverlay(
      "Left",
      modes.Left,
      results.landmarks[leftHandIndex],
      stableGestures.Left,
      smoothing,
      leftValues,
      rightValues,
    );
  }

  if (hasRightHand) {
    drawHandOverlay(
      "Right",
      modes.Right,
      results.landmarks[rightHandIndex],
      stableGestures.Right,
      smoothing,
      leftValues,
      rightValues,
    );
  }

  drawDigitBadges(stableDigits);
}

function drawDetectedLandmarks(landmarksList, indexes) {
  for (const index of indexes) {
    if (index !== -1) {
      drawLandmarks(landmarksList[index]);
    }
  }
}

function drawLandmarks(landmarks) {
  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.lineWidth = 2;
  context.strokeStyle = "#00d084";
  context.fillStyle = "#ff3b30";

  for (const [start, end] of HAND_CONNECTIONS) {
    const from = landmarks[start];
    const to = landmarks[end];

    context.beginPath();
    context.moveTo(from.x * canvas.width, from.y * canvas.height);
    context.lineTo(to.x * canvas.width, to.y * canvas.height);
    context.stroke();
  }

  for (const landmark of landmarks) {
    context.beginPath();
    context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawHandOverlay(handLabel, shape, landmarks, gesture, smoothing, leftValues, rightValues) {
  const geometry = resolveGeometry(handLabel, shape, landmarks, smoothing);
  const values = createNormalizedValues(landmarks);

  if (shape === "circle" && controls.showAreaEffect.checked) {
    drawAreaEffect(geometry, leftValues, rightValues);
  }

  if (controls.showCircle.checked) {
    if (shape === "circle") {
      drawCircle(geometry);
    } else {
      drawLine(geometry);
    }
  }

  if (controls.showValues.checked) {
    drawValues(shape, values, getValueAnchor(geometry, shape), handLabel);
  }

  if (controls.showGestures.checked) {
    drawGesture(gesture, getGestureAnchor(geometry, shape), handLabel);
  }
}

function drawConnectedHandsOverlay(leftLandmarks, rightLandmarks, smoothing, leftValues, rightValues) {
  const region = resolveConnectedRegion(leftLandmarks, rightLandmarks, smoothing);

  if (!region) {
    return;
  }

  if (controls.showAreaEffect.checked) {
    drawAreaEffect(region, leftValues, rightValues);
  }

  if (controls.showCircle.checked) {
    drawConnectedRegion(region);
  }

  if (controls.showValues.checked) {
    drawValues("connected", { length: region.length }, getConnectedValueAnchor(region), "Connected");
  }
}

function updateAudioFromHands(leftValues, rightValues) {
  handAudio.update({
    leftLength: leftValues?.length ?? 0,
    rightLength: rightValues?.length ?? 0,
    masterVolume: Number(controls.audioMasterVolume.value),
    bpm: Number(controls.audioBpm.value),
    rhythmDensity: Number(controls.audioRhythmDensity.value),
  });
}

function getStableGesture(handLabel, category) {
  return updateGestureStabilizer(gestureStabilizers[handLabel], category, {
    threshold: Number(controls.gestureScoreThreshold.value),
    enabledGestures: getEnabledGestures(),
  });
}

function resetStableGesture(handLabel) {
  updateGestureStabilizer(gestureStabilizers[handLabel], null);
  return null;
}

function getStableDigit(handLabel, landmarks) {
  return updateDigitStabilizer(digitStabilizers[handLabel], recognizeDigitGesture(landmarks), {
    threshold: 0.5,
    stableMs: GESTURE_STABILIZATION.digitStableHoldMs,
    now: performance.now(),
  });
}

function resetStableDigit(handLabel) {
  updateGestureStabilizer(digitStabilizers[handLabel], null);
  return null;
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function resolveGeometry(handLabel, shape, landmarks, smoothing) {
  const state = smoothedShapes[handLabel];

  if (shape === "circle") {
    state.line = null;
    const nextCircle = createCircleFromLandmarks(landmarks, canvas.width, canvas.height);
    state.circle = smoothCircle(state.circle, nextCircle, smoothing);
    return state.circle;
  }

  state.circle = null;
  const nextLine = createLineFromLandmarks(landmarks, canvas.width, canvas.height);
  state.line = smoothLine(state.line, nextLine, smoothing);
  return state.line;
}

function resolveConnectedRegion(leftLandmarks, rightLandmarks, smoothing) {
  const nextRegion = createConnectedRegionFromHands(leftLandmarks, rightLandmarks, canvas.width, canvas.height);
  smoothedShapes.Connected.region = smoothRegion(smoothedShapes.Connected.region, nextRegion, smoothing);
  return smoothedShapes.Connected.region;
}

function drawLine(line) {
  if (!line) {
    return;
  }

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.strokeStyle = controls.circleColor.value;
  context.lineWidth = Number(controls.lineWidth.value);
  context.lineCap = "round";
  context.shadowBlur = 10;
  context.shadowColor = controls.circleColor.value;
  context.beginPath();
  context.moveTo(line.start.x, line.start.y);
  context.lineTo(line.end.x, line.end.y);
  context.stroke();
  context.restore();
}

function drawConnectedRegion(region) {
  if (!region) {
    return;
  }

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.strokeStyle = controls.circleColor.value;
  context.lineWidth = Number(controls.lineWidth.value);
  context.lineJoin = "round";
  context.shadowBlur = 12;
  context.shadowColor = controls.circleColor.value;
  drawRegionPath(region);
  context.closePath();
  context.stroke();
  context.restore();
}

function drawAreaEffect(region, leftValues, rightValues) {
  if (!region || !AREA_EFFECT_TYPES.includes(controls.areaEffectType.value)) {
    return;
  }

  const effectRegion = getDrawableEffectRegion(region);

  context.save();
  context.globalCompositeOperation = "destination-over";
  context.globalAlpha = Number(controls.areaEffectOpacity.value);
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  drawRegionPath(effectRegion);
  context.clip();

  const settings = {
    intensity: Number(controls.areaEffectIntensity.value),
    speed: Number(controls.areaEffectSpeed.value),
    time: performance.now() / 1000,
  };

  switch (controls.areaEffectType.value) {
    case "pixel":
      drawPixelAreaEffect(effectRegion, settings);
      break;
    case "liquidGlass":
      drawLiquidGlassAreaEffect(effectRegion, settings);
      break;
    case "heatmap":
      drawHeatmapAreaEffect(effectRegion, settings);
      break;
    case "glitch":
      drawGlitchAreaEffect(effectRegion, settings);
      break;
  }

  context.restore();
}

function drawPixelAreaEffect(region, settings) {
  const bounds = getRegionBounds(region);
  const pixelSettings = createPixelEffectSettings(settings);
  const pixelSize = pixelSettings.pixelSize;
  const lowWidth = Math.max(1, Math.ceil(bounds.width / pixelSize));
  const lowHeight = Math.max(1, Math.ceil(bounds.height / pixelSize));
  const buffer = getPixelBuffer(lowWidth, lowHeight);
  const hue = (settings.time * 38 * settings.speed + settings.intensity * 160) % 360;

  pixelBufferContext.save();
  pixelBufferContext.filter = `contrast(${pixelSettings.contrastPercent}%)`;
  pixelBufferContext.clearRect(0, 0, lowWidth, lowHeight);
  pixelBufferContext.drawImage(
    video,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    lowWidth,
    lowHeight,
  );
  pixelBufferContext.restore();

  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(buffer, 0, 0, lowWidth, lowHeight, bounds.x, bounds.y, bounds.width, bounds.height);
  context.globalCompositeOperation = "screen";
  context.fillStyle = `hsla(${hue}, 90%, 58%, ${pixelSettings.tintAlpha})`;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
}

function drawLiquidGlassAreaEffect(region, settings) {
  const bounds = getRegionBounds(region);
  const shaderCanvas = getLiquidGlassRenderer()?.render(video, canvas.width, canvas.height, settings);

  if (!shaderCanvas) {
    drawLiquidGlassFallback(region, settings);
    return;
  }

  const inheritedAlpha = context.globalAlpha;
  const shine = context.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
  shine.addColorStop(0, "rgba(255, 255, 255, 0)");
  shine.addColorStop(0.32, `rgba(255, 255, 255, ${0.10 + settings.intensity * 0.14})`);
  shine.addColorStop(0.46, `rgba(150, 225, 255, ${0.05 + settings.intensity * 0.10})`);
  shine.addColorStop(0.68, "rgba(255, 255, 255, 0)");

  context.save();
  context.filter = `contrast(${104 + settings.intensity * 16}%) saturate(${108 + settings.intensity * 26}%)`;
  context.drawImage(shaderCanvas, bounds.x, bounds.y, bounds.width, bounds.height, bounds.x, bounds.y, bounds.width, bounds.height);
  context.globalAlpha = inheritedAlpha * (0.18 + settings.intensity * 0.18);
  context.globalCompositeOperation = "screen";
  context.filter = "none";
  context.fillStyle = shine;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.globalAlpha = inheritedAlpha * (0.24 + settings.intensity * 0.30);
  context.strokeStyle = "rgba(255, 255, 255, 0.92)";
  context.lineWidth = 1.2 + settings.intensity * 1.8;
  drawRegionPath(region);
  context.stroke();
  context.globalAlpha = inheritedAlpha * (0.16 + settings.intensity * 0.20);
  context.strokeStyle = "rgba(115, 221, 255, 0.86)";
  context.lineWidth = 3 + settings.intensity * 3;
  drawRegionPath(region);
  context.stroke();
  context.restore();
}

function drawLiquidGlassFallback(region, settings) {
  const bounds = getRegionBounds(region);
  const center = getRegionCenter(bounds);
  const sliceHeight = Math.max(3, Math.round(10 - settings.intensity * 6));
  const waveAmplitude = 3 + settings.intensity * 24;
  const waveSpeed = 0.7 + settings.speed * 1.7;
  const margin = Math.min(28, waveAmplitude + 4);

  context.save();
  context.filter = `contrast(${105 + settings.intensity * 18}%) saturate(${104 + settings.intensity * 28}%)`;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += sliceHeight) {
    const height = Math.min(sliceHeight, bounds.y + bounds.height - y);
    const normalizedY = (y - center.y) / Math.max(1, bounds.height);
    const offset =
      Math.sin(y * 0.035 + settings.time * waveSpeed * 2.1) * waveAmplitude +
      Math.sin(y * 0.011 - settings.time * waveSpeed * 1.4) * waveAmplitude * 0.42;
    const sourceX = clampNumber(bounds.x + offset, 0, Math.max(0, canvas.width - bounds.width));
    const sourceY = clampNumber(y + normalizedY * margin, 0, Math.max(0, canvas.height - height));

    context.drawImage(video, sourceX, sourceY, bounds.width, height, bounds.x, y, bounds.width, height);
  }

  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(bounds.width, bounds.height) * 0.62);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.10 + settings.intensity * 0.14})`);
  glow.addColorStop(0.55, `rgba(125, 245, 255, ${0.04 + settings.intensity * 0.08})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.globalCompositeOperation = "screen";
  context.filter = "none";
  context.fillStyle = glow;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.strokeStyle = `rgba(255, 255, 255, ${0.26 + settings.intensity * 0.34})`;
  context.lineWidth = 1.5 + settings.intensity * 2;
  drawRegionPath(region);
  context.stroke();
  context.restore();
}

function drawHeatmapAreaEffect(region, settings) {
  const bounds = getRegionBounds(region);
  const sampleSize = Math.max(6, Math.round(14 - settings.intensity * 8));
  const lowWidth = Math.max(1, Math.ceil(bounds.width / sampleSize));
  const lowHeight = Math.max(1, Math.ceil(bounds.height / sampleSize));
  const buffer = getHeatmapBuffer(lowWidth, lowHeight);
  const cellWidth = bounds.width / lowWidth;
  const cellHeight = bounds.height / lowHeight;

  heatmapBufferContext.clearRect(0, 0, lowWidth, lowHeight);
  heatmapBufferContext.drawImage(
    video,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    lowWidth,
    lowHeight,
  );

  const pixels = heatmapBufferContext.getImageData(0, 0, lowWidth, lowHeight).data;

  context.save();
  for (let y = 0; y < lowHeight; y += 1) {
    const rowY = y * cellHeight;

    for (let x = 0; x < lowWidth; x += 1) {
      const offset = (y * lowWidth + x) * 4;
      const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
      const hue = (220 - luminance * 235 + settings.time * settings.speed * 18) % 360;
      const saturation = 82 + settings.intensity * 16;
      const lightness = 37 + luminance * 32;
      const alpha = 0.46 + settings.intensity * 0.36;

      context.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${Math.min(0.96, alpha)})`;
      context.fillRect(bounds.x + x * cellWidth, bounds.y + rowY, cellWidth + 1, cellHeight + 1);
    }
  }
  context.restore();
}

function drawGlitchAreaEffect(region, settings) {
  const bounds = getRegionBounds(region);
  const inheritedAlpha = context.globalAlpha;
  const sliceHeight = Math.max(3, Math.round(18 - settings.intensity * 12));
  const maxShift = 8 + settings.intensity * 46;
  const speed = 1 + settings.speed * 4;
  const bandCount = Math.round(4 + settings.intensity * 10);
  const channelShift = 3 + settings.intensity * 18;
  const hue = (settings.time * 110 * settings.speed + settings.intensity * 240) % 360;

  context.save();
  context.imageSmoothingEnabled = false;
  context.filter = `contrast(${118 + settings.intensity * 42}%) saturate(${125 + settings.intensity * 95}%)`;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += sliceHeight) {
    const height = Math.min(sliceHeight, bounds.y + bounds.height - y);
    const offset =
      Math.sin(y * 0.12 + settings.time * speed * 4.2) * maxShift +
      Math.sin(y * 0.43 - settings.time * speed * 7.1) * maxShift * 0.36;
    const sourceX = clampNumber(bounds.x + offset, 0, Math.max(0, canvas.width - bounds.width));

    context.drawImage(video, sourceX, y, bounds.width, height, bounds.x, y, bounds.width, height);
  }

  context.globalCompositeOperation = "screen";
  context.globalAlpha = inheritedAlpha * (0.18 + settings.intensity * 0.22);
  context.filter = "hue-rotate(305deg) saturate(220%) contrast(130%)";
  context.drawImage(video, bounds.x, bounds.y, bounds.width, bounds.height, bounds.x + channelShift, bounds.y, bounds.width, bounds.height);
  context.filter = "hue-rotate(145deg) saturate(240%) contrast(126%)";
  context.drawImage(video, bounds.x, bounds.y, bounds.width, bounds.height, bounds.x - channelShift, bounds.y, bounds.width, bounds.height);

  context.globalAlpha = inheritedAlpha;
  context.filter = "none";
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < bandCount; index += 1) {
    const seed = Math.sin(index * 91.73 + settings.time * speed * 15.7) * 10000;
    const normalizedSeed = seed - Math.floor(seed);
    const bandY = bounds.y + ((settings.time * speed * (48 + index * 13) + normalizedSeed * bounds.height) % bounds.height);
    const bandHeight = Math.max(2, Math.round(2 + normalizedSeed * 10 + settings.intensity * 8));
    const bandWidth = bounds.width * (0.24 + normalizedSeed * 0.72);
    const bandX = bounds.x + ((normalizedSeed * bounds.width + Math.sin(settings.time * 9 + index) * maxShift) % bounds.width);

    context.globalAlpha = inheritedAlpha * (0.10 + settings.intensity * 0.24);
    context.fillStyle = `hsla(${(hue + index * 46) % 360}, 96%, 62%, 0.85)`;
    context.fillRect(bandX, bandY, bandWidth, bandHeight);
    context.globalAlpha = inheritedAlpha * (0.08 + settings.intensity * 0.18);
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.fillRect(bounds.x, bandY + bandHeight * 0.35, bounds.width, 1);
  }

  context.globalAlpha = inheritedAlpha * (0.14 + settings.intensity * 0.18);
  context.fillStyle = `hsla(${hue}, 98%, 54%, 0.65)`;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

  context.globalAlpha = inheritedAlpha;
  context.strokeStyle = `rgba(255, 255, 255, ${0.28 + settings.intensity * 0.34})`;
  context.lineWidth = 1 + settings.intensity * 2.5;
  drawRegionPath(region);
  context.stroke();
  context.restore();
}

function getDrawableEffectRegion(region) {
  if (region.radius !== undefined) {
    return {
      ...region,
      radius: Math.max(1, region.radius - Number(controls.lineWidth.value) / 2),
    };
  }

  return region;
}

function drawRegionPath(region) {
  context.beginPath();

  if (region.radius !== undefined) {
    context.arc(region.x, region.y, region.radius, 0, TWO_PI);
    return;
  }

  const [firstPoint, ...restPoints] = region.points;
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of restPoints) {
    context.lineTo(point.x, point.y);
  }

  context.closePath();
}

function getRegionBounds(region) {
  if (region.radius !== undefined) {
    const left = Math.max(0, Math.floor(region.x - region.radius));
    const top = Math.max(0, Math.floor(region.y - region.radius));
    const right = Math.min(canvas.width, Math.ceil(region.x + region.radius));
    const bottom = Math.min(canvas.height, Math.ceil(region.y + region.radius));

    return createBounds(left, top, right, bottom);
  }

  const left = Math.max(0, Math.floor(Math.min(...region.points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...region.points.map((point) => point.y))));
  const right = Math.min(canvas.width, Math.ceil(Math.max(...region.points.map((point) => point.x))));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...region.points.map((point) => point.y))));

  return createBounds(left, top, right, bottom);
}

function createBounds(left, top, right, bottom) {
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function getRegionCenter(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function getPixelBuffer(width, height) {
  if (!pixelBuffer) {
    pixelBuffer = document.createElement("canvas");
    pixelBufferContext = pixelBuffer.getContext("2d");
  }

  if (pixelBuffer.width !== width || pixelBuffer.height !== height) {
    pixelBuffer.width = width;
    pixelBuffer.height = height;
  }

  return pixelBuffer;
}

function getHeatmapBuffer(width, height) {
  if (!heatmapBuffer) {
    heatmapBuffer = document.createElement("canvas");
    heatmapBufferContext = heatmapBuffer.getContext("2d", { willReadFrequently: true });
  }

  if (heatmapBuffer.width !== width || heatmapBuffer.height !== height) {
    heatmapBuffer.width = width;
    heatmapBuffer.height = height;
  }

  return heatmapBuffer;
}

function getLiquidGlassRenderer() {
  if (!liquidGlassRenderer) {
    liquidGlassRenderer = new LiquidGlassRenderer();
  }

  return liquidGlassRenderer;
}

function drawValues(shape, values, anchor, handLabel) {
  if (!values || !anchor) {
    return;
  }

  const rows = formatNormalizedValues(shape, values).map(
    (row) => `${getHandDisplayLabel(handLabel)} ${row}`,
  );

  context.save();
  context.font = "13px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textBaseline = "top";

  const paddingX = 8;
  const paddingY = 6;
  const lineHeight = 18;
  const boxWidth = Math.max(...rows.map((row) => context.measureText(row).width)) + paddingX * 2;
  const boxHeight = rows.length * lineHeight + paddingY * 2;
  const x = Math.min(canvas.width - boxWidth - 8, Math.max(8, anchor.x + 12));
  const y = Math.min(canvas.height - boxHeight - 8, Math.max(8, anchor.y + 12));

  context.fillStyle = "rgba(0, 0, 0, 0.68)";
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 1;
  roundRect(context, x, y, boxWidth, boxHeight, 7);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  rows.forEach((row, index) => {
    context.fillText(row, x + paddingX, y + paddingY + index * lineHeight);
  });

  context.restore();
}

function drawGesture(category, anchor, handLabel) {
  if (!anchor) {
    return;
  }

  const label = formatGesture(category, {
    language: getSelectedMode("gestureLabelLanguage"),
    threshold: Number(controls.gestureScoreThreshold.value),
    enabledGestures: getEnabledGestures(),
  });

  if (!label) {
    return;
  }

  const text = `${handLabel === "Left" ? "左手" : "右手"} ${label}`;

  context.save();
  context.font = "15px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textBaseline = "top";

  const paddingX = 10;
  const paddingY = 7;
  const boxWidth = context.measureText(text).width + paddingX * 2;
  const boxHeight = 34;
  const x = Math.min(canvas.width - boxWidth - 8, Math.max(8, anchor.x + 12));
  const y = Math.min(canvas.height - boxHeight - 8, Math.max(8, anchor.y - 44));

  context.fillStyle = "rgba(0, 0, 0, 0.72)";
  context.strokeStyle = controls.circleColor.value;
  context.lineWidth = 1;
  roundRect(context, x, y, boxWidth, boxHeight, 7);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.94)";
  context.fillText(text, x + paddingX, y + paddingY);
  context.restore();
}

function drawDigitBadges(stableDigits) {
  if (!controls.showGestures.checked) {
    return;
  }

  drawDigitBadge(stableDigits.Right, "Right");
}

function drawDigitBadge(category) {
  if (!category?.digit) {
    return;
  }

  const size = 58;
  const margin = 22;
  const x = canvas.width - size - margin;
  const y = 70;

  context.save();
  context.shadowBlur = 18;
  context.shadowColor = controls.circleColor.value;
  context.fillStyle = "rgba(0, 0, 0, 0.64)";
  context.strokeStyle = controls.circleColor.value;
  context.lineWidth = 1.5;
  roundRect(context, x, y, size, size, 15);
  context.fill();
  context.stroke();

  context.shadowBlur = 0;
  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.font = "700 34px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(category.digit, x + size / 2, y + size / 2 + 1);
  context.restore();
}

function drawCircle(circle) {
  if (!circle) {
    return;
  }

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.strokeStyle = controls.circleColor.value;
  context.lineWidth = Number(controls.lineWidth.value);
  context.shadowBlur = 12;
  context.shadowColor = controls.circleColor.value;
  context.beginPath();
  context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function getValueAnchor(geometry, shape) {
  if (!geometry) {
    return null;
  }

  if (shape === "circle") {
    return {
      x: canvas.width - geometry.x + geometry.radius,
      y: geometry.y - geometry.radius,
    };
  }

  return {
    x: canvas.width - geometry.end.x,
    y: geometry.end.y,
  };
}

function getConnectedValueAnchor(region) {
  const bounds = getRegionBounds(region);

  return {
    x: canvas.width - bounds.x,
    y: bounds.y,
  };
}

function getGestureAnchor(geometry, shape) {
  if (!geometry) {
    return null;
  }

  if (shape === "circle") {
    return {
      x: canvas.width - geometry.x,
      y: geometry.y - geometry.radius,
    };
  }

  return {
    x: canvas.width - (geometry.start.x + geometry.end.x) / 2,
    y: Math.min(geometry.start.y, geometry.end.y),
  };
}

function resizeCanvas() {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height || (canvas.width === width && canvas.height === height)) {
    updateStageAspect();
    return;
  }

  canvas.width = width;
  canvas.height = height;
  updateStageAspect(width, height);
}

function updateStageAspect(width = video.videoWidth, height = video.videoHeight) {
  const isSquareMode = getSelectedMode("aspectRatioMode") === "square";

  stage.classList.toggle("is-square", isSquareMode);

  if (isSquareMode) {
    stage.style.setProperty("--video-aspect", "1 / 1");
    return;
  }

  stage.style.setProperty("--video-aspect", width && height ? `${width} / ${height}` : "16 / 9");
}

function updateStatus(message) {
  statusLabel.textContent = message;
}

function createStatusText(visibleHands, modes, handAreaMode) {
  if (handAreaMode === "connected") {
    return visibleHands.Left && visibleHands.Right ? "左右手相连" : "等待左右手同时进入画面";
  }

  const parts = [];

  if (visibleHands.Left) {
    parts.push(`左手${getShapeLabel(modes.Left)}`);
  }

  if (visibleHands.Right) {
    parts.push(`右手${getShapeLabel(modes.Right)}`);
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return "未检测到左右手";
}

function getSelectedMode(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? "line";
}

function getHandDisplayLabel(handLabel) {
  if (handLabel === "Left") {
    return "左手";
  }

  if (handLabel === "Right") {
    return "右手";
  }

  return "双手";
}

function bindViewNavigation() {
  for (const item of navItems) {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveView(item.dataset.view);
    });
  }
}

function setActiveView(view) {
  const activeView = normalizeView(view);
  const visiblePanelIds = new Set(getVisiblePanelIds(activeView));

  for (const item of navItems) {
    const isActive = item.dataset.view === activeView;
    item.classList.toggle("active", isActive);
    item.toggleAttribute("aria-current", isActive);
  }

  for (const card of panelCards) {
    card.hidden = !visiblePanelIds.has(card.dataset.panelId);
  }
}

function bindPanelCollapse() {
  const collapsedPanelIds = readCollapsedPanelIds();

  for (const button of collapseButtons) {
    const card = button.closest(".control-card[data-panel-id]");

    if (!card) {
      continue;
    }

    setCardCollapsed(card, collapsedPanelIds.has(card.dataset.panelId));
    button.addEventListener("click", () => {
      setCardCollapsed(card, !card.classList.contains("is-collapsed"));
      writeCollapsedPanelIds(getCollapsedPanelIds());
    });
  }
}

function bindQuickControls() {
  for (const button of controls.quickToggleButtons) {
    button.addEventListener("click", () => {
      const control = getQuickToggleControl(button.dataset.quickToggle);

      if (!control) {
        return;
      }

      control.checked = !control.checked;

      if (control === controls.audioEnabled) {
        handAudio.setEnabled(control.checked);
      }

      persistCurrentSettings();
    });
  }
}

function getQuickToggleControl(key) {
  return {
    showLandmarks: controls.showLandmarks,
    showCircle: controls.showCircle,
    showAreaEffect: controls.showAreaEffect,
    showValues: controls.showValues,
    showGestures: controls.showGestures,
    audioEnabled: controls.audioEnabled,
  }[key];
}

function setCardCollapsed(card, isCollapsed) {
  const button = card.querySelector(".collapse-button");
  const title = card.querySelector(".card-title h2")?.textContent?.trim() ?? "面板";

  card.classList.toggle("is-collapsed", isCollapsed);

  if (!button) {
    return;
  }

  button.textContent = isCollapsed ? "⌄" : "⌃";
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute("aria-label", `${isCollapsed ? "展开" : "折叠"}${title}`);
}

function getCollapsedPanelIds() {
  return Array.from(panelCards)
    .filter((card) => card.classList.contains("is-collapsed"))
    .map((card) => card.dataset.panelId);
}

function readCollapsedPanelIds() {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.collapsedPanels);
    const panelIds = JSON.parse(value);
    return new Set(Array.isArray(panelIds) ? panelIds : []);
  } catch {
    return new Set();
  }
}

function writeCollapsedPanelIds(panelIds) {
  try {
    localStorage.setItem(STORAGE_KEYS.collapsedPanels, JSON.stringify(panelIds));
  } catch {
    // Ignore private browsing or storage quota failures; collapse still works for this session.
  }
}

function bindSettingsPersistence() {
  const fields = [
    controls.showLandmarks,
    controls.showCircle,
    controls.showValues,
    controls.showAreaEffect,
    controls.areaEffectType,
    controls.areaEffectIntensity,
    controls.areaEffectSpeed,
    controls.areaEffectOpacity,
    controls.audioEnabled,
    controls.audioMasterVolume,
    controls.audioBpm,
    controls.audioRhythmDensity,
    controls.showGestures,
    controls.circleColor,
    controls.lineWidth,
    controls.smoothing,
    controls.gestureScoreThreshold,
    ...controls.handAreaModes,
    ...controls.leftModes,
    ...controls.rightModes,
    ...controls.aspectRatioModes,
    ...controls.gestureLabelLanguages,
  ];

  for (const field of fields) {
    field.addEventListener("input", persistCurrentSettings);
    field.addEventListener("change", persistCurrentSettings);
  }
}

function bindGestureControls() {
  controls.toggleAllGestures.addEventListener("change", () => {
    setAllGestureToggles(controls.toggleAllGestures.checked);
    persistCurrentSettings();
  });

  for (const toggle of controls.gestureToggles) {
    toggle.addEventListener("change", () => {
      updateGestureToggleSummary();
      persistCurrentSettings();
    });
  }
}

function bindPresetControls() {
  for (const action of presetActions) {
    action.addEventListener("click", () => {
      const slot = action.dataset.presetSlot;

      if (action.dataset.presetAction === "save") {
        savePreset(slot);
      } else {
        loadPreset(slot);
      }
    });
  }
}

function savePreset(slot) {
  const settings = getCurrentSettings();

  writePreset(slot, settings);
  updatePresetStates();
  updateStatus(`预设 ${slot} 已保存`);
}

function loadPreset(slot) {
  const settings = readPreset(slot);

  if (!settings) {
    updateStatus(`预设 ${slot} 还未保存`);
    return;
  }

  applySettings(settings);
  persistCurrentSettings();
  resetAllSmoothedShapes();
  resetAllStableGestures();
  handAudio.setEnabled(controls.audioEnabled.checked);
  updateStatus(`已调用预设 ${slot}`);
}

function applySettings(settings) {
  controls.showLandmarks.checked = settings.showLandmarks;
  controls.showCircle.checked = settings.showCircle;
  controls.showValues.checked = settings.showValues;
  controls.showAreaEffect.checked = settings.showAreaEffect;
  controls.areaEffectType.value = settings.areaEffectType;
  controls.areaEffectIntensity.value = String(settings.areaEffectIntensity);
  controls.areaEffectSpeed.value = String(settings.areaEffectSpeed);
  controls.areaEffectOpacity.value = String(settings.areaEffectOpacity);
  controls.audioEnabled.checked = settings.audioEnabled;
  controls.audioMasterVolume.value = String(settings.audioMasterVolume);
  controls.audioBpm.value = String(settings.audioBpm);
  controls.audioRhythmDensity.value = String(settings.audioRhythmDensity);
  controls.showGestures.checked = settings.showGestures;
  setSelectedMode("handAreaMode", settings.handAreaMode);
  setSelectedMode("leftMode", settings.leftMode);
  setSelectedMode("rightMode", settings.rightMode);
  setSelectedMode("aspectRatioMode", settings.aspectRatioMode);
  setSelectedMode("gestureLabelLanguage", settings.gestureLabelLanguage);
  controls.circleColor.value = settings.circleColor;
  controls.lineWidth.value = String(settings.lineWidth);
  controls.smoothing.value = String(settings.smoothing);
  controls.gestureScoreThreshold.value = String(settings.gestureScoreThreshold);
  setEnabledGestures(settings.enabledGestures);
  syncOutputValues();
  updateHandModeControls();
  updateStageAspect();
}

function updateHandModeControls() {
  const isIndependentMode = getSelectedMode("handAreaMode") === "independent";

  handModePanel?.classList.toggle("is-connected", !isIndependentMode);

  for (const group of handedModeGroups) {
    group.hidden = !isIndependentMode;
  }

  for (const option of [...controls.leftModes, ...controls.rightModes]) {
    option.disabled = !isIndependentMode;
  }
}

function persistCurrentSettings() {
  syncOutputValues();
  writeSettings(getCurrentSettings());
}

function getCurrentSettings() {
  return {
    showLandmarks: controls.showLandmarks.checked,
    showCircle: controls.showCircle.checked,
    showValues: controls.showValues.checked,
    showAreaEffect: controls.showAreaEffect.checked,
    areaEffectType: controls.areaEffectType.value,
    areaEffectIntensity: Number(controls.areaEffectIntensity.value),
    areaEffectSpeed: Number(controls.areaEffectSpeed.value),
    areaEffectOpacity: Number(controls.areaEffectOpacity.value),
    audioEnabled: controls.audioEnabled.checked,
    audioMasterVolume: Number(controls.audioMasterVolume.value),
    audioBpm: Number(controls.audioBpm.value),
    audioRhythmDensity: Number(controls.audioRhythmDensity.value),
    showGestures: controls.showGestures.checked,
    handAreaMode: getSelectedMode("handAreaMode"),
    leftMode: getSelectedMode("leftMode"),
    rightMode: getSelectedMode("rightMode"),
    aspectRatioMode: getSelectedMode("aspectRatioMode"),
    gestureLabelLanguage: getSelectedMode("gestureLabelLanguage"),
    circleColor: controls.circleColor.value,
    lineWidth: Number(controls.lineWidth.value),
    smoothing: Number(controls.smoothing.value),
    gestureScoreThreshold: Number(controls.gestureScoreThreshold.value),
    enabledGestures: getEnabledGestures(),
  };
}

function setEnabledGestures(enabledGestures) {
  for (const toggle of controls.gestureToggles) {
    toggle.checked = enabledGestures[toggle.value] !== false;
  }
}

function setAllGestureToggles(isEnabled) {
  for (const toggle of controls.gestureToggles) {
    toggle.checked = isEnabled;
  }

  updateGestureToggleSummary();
}

function getEnabledGestures() {
  return Object.fromEntries(
    Array.from(controls.gestureToggles, (toggle) => [toggle.value, toggle.checked]),
  );
}

function setSelectedMode(name, value) {
  const option = document.querySelector(`input[name="${name}"][value="${value}"]`);

  if (option) {
    option.checked = true;
  }
}

function syncOutputValues() {
  controls.circleColorValue.value = controls.circleColor.value.toUpperCase();
  controls.lineWidthValue.value = controls.lineWidth.value;
  controls.smoothingValue.value = Number(controls.smoothing.value).toFixed(2);
  controls.areaEffectIntensityValue.value = Number(controls.areaEffectIntensity.value).toFixed(2);
  controls.areaEffectSpeedValue.value = Number(controls.areaEffectSpeed.value).toFixed(2);
  controls.areaEffectOpacityValue.value = Number(controls.areaEffectOpacity.value).toFixed(2);
  controls.audioMasterVolumeValue.value = Number(controls.audioMasterVolume.value).toFixed(2);
  controls.audioBpmValue.value = controls.audioBpm.value;
  controls.audioRhythmDensityValue.value = Number(controls.audioRhythmDensity.value).toFixed(2);
  controls.gestureScoreThresholdValue.value = Number(controls.gestureScoreThreshold.value).toFixed(2);
  updateGestureToggleSummary();
  updateQuickControlStates();
}

function updateQuickControlStates() {
  for (const button of controls.quickToggleButtons) {
    const control = getQuickToggleControl(button.dataset.quickToggle);
    const isActive = Boolean(control?.checked);

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function updatePresetStates() {
  for (const slot of PRESET_SLOTS) {
    const slotKey = String(slot);
    const saved = hasPreset(slot);
    const state = presetStates.get(slotKey);

    if (state) {
      state.textContent = saved ? "已保存" : "未保存";
    }

    const loadButtons = document.querySelectorAll(
      `[data-preset-action="load"][data-preset-slot="${slotKey}"]`,
    );

    for (const loadButton of loadButtons) {
      loadButton.disabled = !saved;
    }
  }
}

function updateGestureToggleSummary() {
  const toggles = Array.from(controls.gestureToggles);
  const enabledCount = toggles.filter((toggle) => toggle.checked).length;

  controls.enabledGesturesValue.value = `${enabledCount}/${toggles.length}`;
  controls.toggleAllGestures.checked = enabledCount === toggles.length;
  controls.toggleAllGestures.indeterminate = enabledCount > 0 && enabledCount < toggles.length;
}

function resetSmoothedShape(handLabel) {
  smoothedShapes[handLabel].circle = null;
  smoothedShapes[handLabel].line = null;
}

function resetConnectedRegion() {
  smoothedShapes.Connected.region = null;
}

function resetAllSmoothedShapes() {
  resetSmoothedShape("Left");
  resetSmoothedShape("Right");
  resetConnectedRegion();
}

function resetAllStableGestures() {
  resetStableGesture("Left");
  resetStableGesture("Right");
  resetStableDigit("Left");
  resetStableDigit("Right");
}

function roundRect(renderingContext, x, y, width, height, radius) {
  renderingContext.beginPath();
  renderingContext.moveTo(x + radius, y);
  renderingContext.lineTo(x + width - radius, y);
  renderingContext.quadraticCurveTo(x + width, y, x + width, y + radius);
  renderingContext.lineTo(x + width, y + height - radius);
  renderingContext.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  renderingContext.lineTo(x + radius, y + height);
  renderingContext.quadraticCurveTo(x, y + height, x, y + height - radius);
  renderingContext.lineTo(x, y + radius);
  renderingContext.quadraticCurveTo(x, y, x + radius, y);
  renderingContext.closePath();
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrameId);
  handAudio.stop();
  stream?.getTracks().forEach((track) => track.stop());
});
