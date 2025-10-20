import { useEffect, useState } from 'react';
import { useMediaStream } from '../hooks/useMediaStream';
import { useChunkRecorder } from '../hooks/useChunkRecorder';
import { useYoloDetector } from '../hooks/useYoloDetector';
import { postEvent, setApiKey } from '../services/api';
import { useClipVerifier } from '../hooks/useClipVerifier';

const TARGET_COMPANY = import.meta.env.VITE_TARGET_COMPANY ?? 'acme';
const DEFAULT_CLIP_THRESHOLD = Number(import.meta.env.VITE_CLIP_SIM_THRESHOLD ?? 0.27);

export function TrackingPage() {
  const { videoRef, stream, start, error } = useMediaStream();
  const { sessionId, pending } = useChunkRecorder(stream);
  const [status, setStatus] = useState<string>('Initializing');
  const [lastEventTs, setLastEventTs] = useState<string | null>(null);
  const [apiKey, setApiKeyState] = useState<string>(() => localStorage.getItem('api_key') ?? '');
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const clip = useClipVerifier();

  useEffect(() => {
    start();
  }, [start]);

  const detector = useYoloDetector({ video: videoElement });

  useEffect(() => {
    if (detector.events.length === 0) return;
    if (clip.enabled && !clip.ready) {
      setStatus('Waiting for CLIP verifier');
      return;
    }
    const [event] = detector.events;
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);

    let clipScore: number | undefined;
    if (clip.enabled) {
      const [x1, y1, x2, y2] = event.box.map((v) => Math.max(0, v));
      const w = Math.max(1, x2 - x1);
      const h = Math.max(1, y2 - y1);
      const crop = ctx.getImageData(x1, y1, w, h);
      const result = await clip.verify(crop);
      clipScore = result.score;
      const threshold = clip.threshold ?? DEFAULT_CLIP_THRESHOLD;
      if (clipScore !== undefined && clipScore < threshold) {
        setStatus('CLIP verification failed');
        return;
      }
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const meta = {
        ts: new Date().toISOString(),
        company_key: TARGET_COMPANY,
        track_id: event.trackId,
        bbox_xyxy: event.box,
        avg_conf: event.avgConf,
        duration_ms: event.durationMs,
        clip_enabled: clip.enabled,
        clip_score: clipScore,
      } as const;
      try {
        setStatus('Posting event');
        const response = await postEvent(meta, blob);
        setLastEventTs(response.event_id);
        setStatus('Event posted');
      } catch (err) {
        console.error(err);
        setStatus('Failed to post event');
      }
    }, 'image/jpeg', 0.9);
  }, [detector.events, clip.enabled, videoRef]);

  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header>
        <h1>Buurt Tracking</h1>
        <label style={{ display: 'flex', flexDirection: 'column', maxWidth: '320px' }}>
          API Key
          <input
            value={apiKey}
            onChange={(e) => {
              const value = e.target.value;
              setApiKeyState(value);
              setApiKey(value);
            }}
          />
        </label>
        <p>Session: {sessionId}</p>
        {pending > 0 && <p>Pending uploads: {pending}</p>}
        {lastEventTs && <p>Last event id: {lastEventTs}</p>}
        {status && <p>Status: {status}</p>}
        {error && <p style={{ color: 'salmon' }}>Camera error: {error}</p>}
      </header>
      <section>
        <video
          ref={(node) => {
            videoRef.current = node;
            setVideoElement(node);
          }}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', borderRadius: '8px', background: '#111' }}
        />
      </section>
    </main>
  );
}
