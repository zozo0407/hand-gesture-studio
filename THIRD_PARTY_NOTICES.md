# Third Party Notices

This project includes third-party runtime assets so the demo can load MediaPipe locally without a CDN dependency.

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`
- Version: `0.10.22-rc.20250304`
- License: Apache License 2.0
- Homepage: <https://mediapipe.dev>

The npm package is listed in [package.json](package.json) and locked in [package-lock.json](package-lock.json).

## Local MediaPipe Assets

The following files are stored under `public/mediapipe` and are served by the app at runtime:

- `public/mediapipe/models/gesture_recognizer.task`
- `public/mediapipe/wasm/vision_wasm_internal.js`
- `public/mediapipe/wasm/vision_wasm_internal.wasm`
- `public/mediapipe/wasm/vision_wasm_nosimd_internal.js`
- `public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm`

These assets are redistributed for local browser execution of MediaPipe Tasks. If you replace or update them, keep the upstream license and notice requirements with the new assets.

## Application Code

All original application code in this repository is released under the MIT License. See [LICENSE](LICENSE).
