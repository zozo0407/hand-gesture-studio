# Contributing

Thanks for improving this hand gesture interaction template.

## Local Setup

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Checks

Before sending a pull request, run:

```bash
npm test -- --run
npm run build
```

If your change touches camera, WebGL, canvas rendering, gestures, or audio, also verify the behavior manually in a browser with camera permission enabled.

## Project Conventions

- Keep browser runtime code dependency-light.
- Prefer small pure functions in `src/*.js` when adding gesture math, settings normalization, or mapping logic.
- Add Vitest coverage for new pure logic.
- Keep MediaPipe model and WASM paths configurable through `src/projectConfig.js`.
- Do not commit generated `dist`, `node_modules`, `.netlify`, or local downloaded assets.
