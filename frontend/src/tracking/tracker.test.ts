import { describe, expect, it, beforeEach } from 'vitest';
import { Tracker, loadTrackerConfig, type TrackerConfig } from './tracker';

declare global {
  // eslint-disable-next-line no-var
  var crypto: Crypto;
}

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

const baseConfig: TrackerConfig = {
  trackRetainMs: 500,
  iouPersist: 0.1,
  confThreshold: 0.5,
  trackMinDurationMs: 800,
  debounceMs: 300,
};

function makeTracker(times: number[], config: TrackerConfig = baseConfig) {
  let index = 0;
  return new Tracker(() => times[index++], config);
}

describe('loadTrackerConfig', () => {
  it('applies fallbacks when env values are invalid', () => {
    const config = loadTrackerConfig({
      VITE_TRACK_RETAIN_MS: 'abc',
      VITE_EVENT_IOU_PERSIST: '-1',
      VITE_CONF_THRESHOLD: '0.7',
      VITE_TRACK_MIN_DURATION_MS: 'not-a-number',
      VITE_DEBOUNCE_MS: undefined,
    } as unknown as Record<string, unknown>);
    expect(config.trackRetainMs).toBe(750);
    expect(config.iouPersist).toBe(0.3);
    expect(config.confThreshold).toBe(0.7);
    expect(config.trackMinDurationMs).toBe(1500);
    expect(config.debounceMs).toBe(60000);
  });
});

describe('Tracker', () => {
  beforeEach(() => {
    globalThis.crypto = {
      randomUUID: () => 'test-id',
    } as Mutable<Crypto>;
  });

  it('fires an event after minimum duration with sufficient confidence', () => {
    const tracker = makeTracker([0, 400, 800, 1200]);
    const detection = { box: [0, 0, 1, 1] as const, score: 0.8 };

    tracker.update([detection]);
    tracker.update([detection]);
    const result = tracker.update([detection]);
    expect(result).toHaveLength(0);

    const final = tracker.update([detection]);
    expect(final).toHaveLength(1);
    expect(final[0].durationMs).toBe(1200);
    expect(final[0].avgConf).toBeGreaterThanOrEqual(0.5);
  });

  it('debounces subsequent events until the configured window passes', () => {
    const tracker = makeTracker([0, 800, 1200, 1500, 2000]);
    const detection = { box: [0, 0, 1, 1] as const, score: 0.9 };

    tracker.update([detection]);
    tracker.update([detection]);
    const first = tracker.update([detection]);
    expect(first).toHaveLength(1);

    const suppressed = tracker.update([detection]);
    expect(suppressed).toHaveLength(0);

    const allowed = tracker.update([detection]);
    expect(allowed).toHaveLength(1);
  });

  it('drops stale tracks after the retention window', () => {
    const tracker = makeTracker([0, 200, 500, 1200, 1300]);
    const detection = { box: [0, 0, 1, 1] as const, score: 0.9 };

    tracker.update([detection]);
    tracker.update([]);
    tracker.update([]);
    expect(tracker.getActiveTrackCount()).toBe(0);

    tracker.update([detection]);
    tracker.update([detection]);
    const events = tracker.update([detection]);
    expect(events).toHaveLength(1);
  });
});
