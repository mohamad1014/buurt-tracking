import { useCallback, useEffect, useRef, useState } from 'react';
import { set, get } from 'idb-keyval';
import { commitUpload, requestPresign, uploadChunkLocal } from '../services/api';

const ENABLE_S3 = import.meta.env.VITE_ENABLE_S3 === 'true';

function readDurationEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const CHUNK_DURATION_MS = readDurationEnv(import.meta.env.VITE_CHUNK_DURATION_MS, 10_000);

export interface ChunkMetadata {
  sessionId: string;
  index: number;
  startedAt: string;
  blob: Blob;
}

export function generateSessionId() {
  return crypto.randomUUID();
}

async function bufferChunk(chunk: ChunkMetadata) {
  await set(`chunk-${chunk.sessionId}-${chunk.index}`, chunk);
}

async function uploadChunk(chunk: ChunkMetadata) {
  if (ENABLE_S3) {
    const presign = await requestPresign({
      session_id: chunk.sessionId,
      index: chunk.index,
      started_at: chunk.startedAt,
      content_type: chunk.blob.type,
    });
    const headers = presign.headers ?? {};
    await fetch(presign.url, {
      method: 'PUT',
      headers,
      body: chunk.blob,
    });
    await commitUpload(chunk.sessionId, chunk.index, presign.key);
  } else {
    await uploadChunkLocal(chunk.sessionId, chunk.index, chunk.startedAt, chunk.blob);
  }
}

async function flushBufferedChunks(setPending: (count: number) => void) {
  const keys = await get<string[]>('pending-chunks-keys');
  if (!keys || keys.length === 0) return;
  const remaining: string[] = [];
  for (const key of keys) {
    const chunk = await get<ChunkMetadata>(key);
    if (!chunk) continue;
    try {
      await uploadChunk(chunk);
    } catch (err) {
      console.error('Reupload failed', err);
      remaining.push(key);
    }
  }
  await set('pending-chunks-keys', remaining);
  setPending(remaining.length);
}

export function useChunkRecorder(stream: MediaStream | null) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());
  const chunkIndexRef = useRef(0);
  const [pending, setPending] = useState(0);
  const chunkStartRef = useRef<number | null>(null);

  useEffect(() => {
    flushBufferedChunks(setPending).catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!stream) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      sessionIdRef.current = generateSessionId();
      chunkIndexRef.current = 0;
      chunkStartRef.current = null;
      return;
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    });
    recorderRef.current = recorder;

    recorder.onstart = () => {
      chunkStartRef.current = Date.now();
    };

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      const startedAtMs = chunkStartRef.current ?? Date.now();
      const chunk: ChunkMetadata = {
        sessionId: sessionIdRef.current,
        index: chunkIndexRef.current++,
        startedAt: new Date(startedAtMs).toISOString(),
        blob: event.data,
      };
      chunkStartRef.current = startedAtMs + CHUNK_DURATION_MS;
      try {
        await uploadChunk(chunk);
        const existingKeys = (await get<string[]>('pending-chunks-keys')) ?? [];
        setPending(existingKeys.length);
      } catch (err) {
        console.error('Chunk upload failed, buffering', err);
        await bufferChunk(chunk);
        const existingKeys = (await get<string[]>('pending-chunks-keys')) ?? [];
        existingKeys.push(`chunk-${chunk.sessionId}-${chunk.index}`);
        await set('pending-chunks-keys', existingKeys);
        setPending(existingKeys.length);
      }
    };

    recorder.start(CHUNK_DURATION_MS);

    return () => {
      recorder.stop();
    };
  }, [stream]);

  return { sessionId: sessionIdRef.current, pending }; 
}
