# buurt-tracking
Buurt Tracking provides a mobile-first PWA for on-device vehicle detection and a FastAPI backend for alerting and storage. The MVP is
feature-flagged for optional CLIP logo verification and S3 uploads.

## Repository layout

```
frontend/    # React 18 + Vite PWA client
backend/     # FastAPI service, SQLite persistence and Telegram integration
```

## Frontend (PWA)

### Development Setup
```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` and adjust `VITE_BACKEND_BASE_URL` plus feature flags as needed. The development server proxies `/api`
requests to the configured backend base URL.

### Running the Frontend
```bash
# From project root directory
cd frontend && npm run dev
```

**Note**: The project uses `munkres` v2.0.4 for object tracking assignment. The package provides built-in TypeScript definitions.

## Backend (FastAPI)

### Development Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running the Backend
```bash
# From project root directory (important: not from backend/ subdirectory)
source backend/.venv/bin/activate
uvicorn backend.app:app --host 0.0.0.0 --port 8080
```

Create a `.env` file from `.env.example` with your API key, Telegram credentials and optional S3 configuration. By default the service
stores media under `backend/storage/` and writes event metadata to SQLite.

Docker support is available via `docker build -t buurt-backend backend` and running the image with `/app/storage` mounted for
persistence.

## Feature flags

Both frontend and backend expose matching environment variables to toggle CLIP logo verification (`ENABLE_CLIP` / `VITE_ENABLE_CLIP`) and
chunk uploads via S3 (`ENABLE_S3` / `VITE_ENABLE_S3`). Flags default to `false`, keeping inference and uploads local.

### Timing configuration

Client-side timing is adjustable at build time through the following `frontend/.env` entries:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_CHUNK_DURATION_MS` | `10000` | Length (ms) for each MediaRecorder chunk before it is buffered/uploaded. |
| `VITE_TRACK_RETAIN_MS` | `750` | Milliseconds a lost track is kept alive before being discarded. |
| `VITE_TRACK_MIN_DURATION_MS` | `1500` | Minimum visibility duration before an event fires. |
| `VITE_DEBOUNCE_MS` | `60000` | Cooldown duration after an event before another can fire. |
| `VITE_CONF_THRESHOLD` | `0.4` | Confidence threshold applied to YOLO detections and averaged tracks. |

Combine these with `VITE_DETECT_FPS` and `VITE_EVENT_IOU_PERSIST` to tailor detection cadence, smoothing and debounce behaviour to
your deployment environment.
