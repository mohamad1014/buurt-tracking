import { describe, expect, it } from 'vitest';
import { deriveBaseStatus } from '../tracking-page';

describe('deriveBaseStatus', () => {
  const baseContext = {
    streamReady: true,
    cameraError: null,
    detectorLoading: false,
    detectorError: undefined,
    clipEnabled: false,
    clipReady: true,
    detectionCount: 0,
  } as const;

  it('prioritises camera errors', () => {
    const status = deriveBaseStatus({ ...baseContext, cameraError: 'Permission denied', streamReady: false });
    expect(status).toBe('Camera error: Permission denied');
  });

  it('waits for camera when stream not ready', () => {
    const status = deriveBaseStatus({ ...baseContext, streamReady: false });
    expect(status).toBe('Waiting for camera');
  });

  it('indicates detector loading', () => {
    const status = deriveBaseStatus({ ...baseContext, detectorLoading: true });
    expect(status).toBe('Loading detector');
  });

  it('reports detector errors', () => {
    const status = deriveBaseStatus({ ...baseContext, detectorError: 'Model missing' });
    expect(status).toBe('Detector error: Model missing');
  });

  it('requires clip readiness when enabled', () => {
    const status = deriveBaseStatus({ ...baseContext, clipEnabled: true, clipReady: false });
    expect(status).toBe('Waiting for CLIP verifier');
  });

  it('shows active tracking when detections exist', () => {
    const status = deriveBaseStatus({ ...baseContext, detectionCount: 2 });
    expect(status).toBe('Tracking active');
  });

  it('falls back to detector ready', () => {
    const status = deriveBaseStatus(baseContext);
    expect(status).toBe('Detector ready');
  });
});
