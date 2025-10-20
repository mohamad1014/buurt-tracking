import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMediaStreamOptions {
  width?: number;
  height?: number;
}

export function useMediaStream({ width = 1280, height = 720 }: UseMediaStreamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width,
          height,
        },
        audio: false,
      });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [width, height]);

  const stop = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { videoRef, stream, start, stop, error };
}
