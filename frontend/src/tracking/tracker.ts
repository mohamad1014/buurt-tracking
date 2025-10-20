import { Munkres } from 'munkres';
import { Box, boxLerp, iou } from '../utils/geometry';

export interface TrackerConfig {
  trackRetainMs: number;
  iouPersist: number;
  confThreshold: number;
  trackMinDurationMs: number;
  debounceMs: number;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRatio(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readNonNegative(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadTrackerConfig(env: Record<string, unknown> = import.meta.env): TrackerConfig {
  return {
    trackRetainMs: readNonNegative(env['VITE_TRACK_RETAIN_MS'], 750),
    iouPersist: readRatio(env['VITE_EVENT_IOU_PERSIST'], 0.3),
    confThreshold: readRatio(env['VITE_CONF_THRESHOLD'], 0.4),
    trackMinDurationMs: readPositiveNumber(env['VITE_TRACK_MIN_DURATION_MS'], 1500),
    debounceMs: readNonNegative(env['VITE_DEBOUNCE_MS'], 60000),
  };
}

const defaultConfig = loadTrackerConfig();

export interface Detection {
  box: Box;
  score: number;
}

export interface TrackEvent {
  trackId: string;
  box: Box;
  avgConf: number;
  durationMs: number;
}

interface TrackInternal {
  id: string;
  box: Box;
  confidence: number;
  createdAt: number;
  lastSeen: number;
  frames: number;
  cumulativeConf: number;
  fired: boolean;
}

export class Tracker {
  private tracks: TrackInternal[] = [];
  private lastEventAt = 0;

  constructor(
    private now: () => number = () => performance.now(),
    private config: TrackerConfig = defaultConfig,
  ) {}

  update(detections: Detection[]): TrackEvent[] {
    const currentTime = this.now();
    this.cleanup(currentTime);

    if (this.tracks.length === 0) {
      detections.forEach((det) => {
        this.tracks.push(this.createTrack(det, currentTime));
      });
      return [];
    }

    if (detections.length === 0) {
      return [];
    }

    const costMatrix = this.buildCostMatrix(detections);
    const munkres = new Munkres();
    const assignments = munkres.compute(costMatrix);

    const usedDetections = new Set<number>();
    const events: TrackEvent[] = [];

    assignments.forEach(([trackIndex, detectionIndex]) => {
      const track = this.tracks[trackIndex];
      const detection = detections[detectionIndex];
      const overlap = iou(track.box, detection.box);
      if (overlap < this.config.iouPersist) {
        return;
      }
      usedDetections.add(detectionIndex);
      track.box = boxLerp(track.box, detection.box, 0.5);
      track.confidence = (track.confidence * 0.6 + detection.score * 0.4);
      track.lastSeen = currentTime;
      track.frames += 1;
      track.cumulativeConf += detection.score;

      if (!track.fired && this.shouldFire(track, currentTime)) {
        track.fired = true;
        events.push({
          trackId: track.id,
          box: track.box,
          avgConf: track.cumulativeConf / track.frames,
          durationMs: currentTime - track.createdAt,
        });
        this.lastEventAt = currentTime;
      }
    });

    detections.forEach((det, idx) => {
      if (!usedDetections.has(idx)) {
        this.tracks.push(this.createTrack(det, currentTime));
      }
    });

    return events;
  }

  private createTrack(det: Detection, time: number): TrackInternal {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return {
      id: `track_${id}`,
      box: det.box,
      confidence: det.score,
      createdAt: time,
      lastSeen: time,
      frames: 1,
      cumulativeConf: det.score,
      fired: false,
    };
  }

  private cleanup(currentTime: number) {
    this.tracks = this.tracks.filter((track) => currentTime - track.lastSeen <= this.config.trackRetainMs);
  }

  private buildCostMatrix(detections: Detection[]): number[][] {
    return this.tracks.map((track) =>
      detections.map((det) => 1 - iou(track.box, det.box)),
    );
  }

  private shouldFire(track: TrackInternal, currentTime: number) {
    if (currentTime - this.lastEventAt < this.config.debounceMs) {
      return false;
    }
    if (track.confidence < this.config.confThreshold) {
      return false;
    }
    const avgConf = track.cumulativeConf / track.frames;
    if (avgConf < this.config.confThreshold) {
      return false;
    }
    const duration = currentTime - track.createdAt;
    return duration >= this.config.trackMinDurationMs;
  }

  getActiveTrackCount() {
    return this.tracks.length;
  }
}
