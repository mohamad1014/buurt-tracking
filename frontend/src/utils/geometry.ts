export type Box = [number, number, number, number];

export function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export function iou(boxA: Box, boxB: Box): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  const boxAArea = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const boxBArea = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);

  const union = boxAArea + boxBArea - interArea;
  if (union <= 0) return 0;
  return interArea / union;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function boxLerp(a: Box, b: Box, t: number): Box {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t),
  ];
}
