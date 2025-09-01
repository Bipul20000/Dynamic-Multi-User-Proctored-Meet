# Dynamic Face App

Minimal demo that serves a small frontend using face-api.js to detect faces and landmarks.

Files created:
- `server.js` — Express server that serves `/public` and exposes `node_modules` for browser access.
- `public/index.html` — Frontend page with a video element and canvas overlay.
- `public/script.js` — Client code to load models and run detection.
- `package.json` — Dependencies and start script.

Usage:

1. Install dependencies:

```bash
cd /Users/bipulkumar/Desktop/ml_paper/dynamic-face-app
npm install
```

2. Put face-api.js model files into `public/models/` (e.g. `tiny_face_detector_model-weights_manifest.json`, `tiny_face_detector_model.weights`, `face_landmark_68_model-weights_manifest.json`, `face_landmark_68_model.weights`).

3. Start the server:

```bash
npm start
```

4. Open http://localhost:3000 in a browser. Click "Start Camera" and allow camera access.

Notes:
- If you installed `face-api.js` differently or prefer a CDN, update the `<script>` tag in `public/index.html`.
- This is a minimal example for local experimentation only.
