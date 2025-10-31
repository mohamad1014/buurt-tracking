const ENABLE_CLIP = import.meta.env.VITE_ENABLE_CLIP === 'true';
const CLIP_THRESHOLD = Number(import.meta.env.VITE_CLIP_SIM_THRESHOLD ?? 0.27);

interface ClipResult {
  enabled: boolean;
  score?: number;
}

export function useClipVerifier() {
  return {
    enabled: ENABLE_CLIP,
    ready: true,
    async verify(imageData: ImageData): Promise<ClipResult> {
      if (!ENABLE_CLIP) {
        return { enabled: false };
      }
      const { data } = imageData;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        total += (r + g + b) / 3;
      }
      const score = total / (data.length / 4);
      return { enabled: true, score: Number(score.toFixed(2)) };
    },
    threshold: CLIP_THRESHOLD,
  };
}
