import { useEffect, useRef, useState } from 'react';
import type * as ort from 'onnxruntime-web';
import { Tracker, type Detection, type TrackEvent } from '../tracking/tracker';

const DETECT_FPS = Number(import.meta.env.VITE_DETECT_FPS ?? 5);
const CONF_THRESHOLD = Number(import.meta.env.VITE_CONF_THRESHOLD ?? 0.4);
const TARGET_CLASS = 2; // car
const INPUT_SIZE = 640;
const MODEL_URL = import.meta.env.VITE_YOLO_MODEL_URL ?? '/models/yolov11n.pt';

interface UseYoloDetectorArgs {
  video: HTMLVideoElement | null;
}

export interface DetectorState {
  loading: boolean;
  error?: string;
  events: TrackEvent[];
  lastDetections: Detection[];
}

function preprocess(video: HTMLVideoElement, canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(video, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const data = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    const offset = i * 4;
    data[i] = imageData.data[offset] / 255;
    data[i + INPUT_SIZE * INPUT_SIZE] = imageData.data[offset + 1] / 255;
    data[i + 2 * INPUT_SIZE * INPUT_SIZE] = imageData.data[offset + 2] / 255;
  }
  return data;
}

function parseDetections(output: ort.Tensor, video: HTMLVideoElement): Detection[] {
  const dims = output.dims;
  if (dims.length !== 3) return [];
  const [batch, channels, cells] = dims;
  if (batch !== 1 || channels < 5) return [];
  const data = output.data as Float32Array;
  const detections: Detection[] = [];
  const scaleX = video.videoWidth / INPUT_SIZE || 1;
  const scaleY = video.videoHeight / INPUT_SIZE || 1;

  for (let i = 0; i < cells; i++) {
    const x = data[i];
    const y = data[i + cells];
    const w = data[i + cells * 2];
    const h = data[i + cells * 3];
    const scoresStart = cells * 4;
    const score = data[scoresStart + TARGET_CLASS * cells + i];
    if (score < CONF_THRESHOLD) continue;
    const x1 = (x - w / 2) * scaleX;
    const y1 = (y - h / 2) * scaleY;
    const x2 = (x + w / 2) * scaleX;
    const y2 = (y + h / 2) * scaleY;
    detections.push({
      box: [x1, y1, x2, y2],
      score,
    });
  }

  return detections;
}

export function useYoloDetector({ video }: UseYoloDetectorArgs): DetectorState {
  const [state, setState] = useState<DetectorState>({ loading: true, events: [], lastDetections: [] });
  const trackerRef = useRef(new Tracker());
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const ortRef = useRef<typeof ort>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    import('onnxruntime-web').then(async (ortModule) => {
      try {
        const session = await ortModule.InferenceSession.create(MODEL_URL, {
          executionProviders: ['webgl', 'wasm'],
        });
        if (cancelled) return;
        sessionRef.current = session;
        ortRef.current = ortModule;
        setState((prev) => ({ ...prev, loading: false }));
      } catch (err) {
        if (!cancelled) {
          const message = (err as Error).message ?? String(err);
          const friendly =
            /404|not\s*found|failed to fetch/i.test(message)
              ? `Failed to load YOLO model from ${MODEL_URL}. Ensure the file exists or configure VITE_YOLO_MODEL_URL.`
              : message;
          setState((prev) => ({ ...prev, loading: false, error: friendly }));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = INPUT_SIZE;
      canvas.height = INPUT_SIZE;
      canvasRef.current = canvas;
    }
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    const canvas = canvasRef.current;
    const ortModule = ortRef.current;
    if (!video || !session || !canvas || !ortModule) return;

    const loop = async () => {
      try {
        const inputData = preprocess(video, canvas);
        const tensor = new ortModule.Tensor('float32', inputData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const outputs = await session.run({ images: tensor });
        const output = outputs[Object.keys(outputs)[0]];
        const detections = parseDetections(output, video);
        const events = trackerRef.current.update(detections);
        setState((prev) => ({ ...prev, lastDetections: detections, events }));
      } catch (err) {
        setState((prev) => ({ ...prev, error: (err as Error).message }));
      }
      timerRef.current = window.setTimeout(loop, 1000 / DETECT_FPS);
    };

    timerRef.current = window.setTimeout(loop, 1000 / DETECT_FPS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [video]);

  return state;
}
