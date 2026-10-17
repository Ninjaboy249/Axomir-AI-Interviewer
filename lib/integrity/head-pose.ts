import { GazeDirection, HeadAngles } from "./types";

export function eulerFromMatrix(matrix: ArrayLike<number>): HeadAngles {
  const m00 = matrix[0] ?? 1;
  const m10 = matrix[4] ?? 0;
  const m11 = matrix[5] ?? 1;
  const m12 = matrix[6] ?? 0;
  const m20 = matrix[8] ?? 0;
  const m21 = matrix[9] ?? 0;
  const m22 = matrix[10] ?? 1;
  const sy = Math.sqrt(m00 * m00 + m10 * m10);
  const singular = sy < 1e-6;
  const pitch = singular ? Math.atan2(-m12, m11) : Math.atan2(m21, m22);
  const yaw = Math.atan2(-m20, sy);
  const roll = singular ? 0 : Math.atan2(m10, m00);
  return {
    yaw: round(deg(yaw)),
    pitch: round(deg(pitch)),
    roll: round(deg(roll))
  };
}

export function relativeAngles(current: HeadAngles, baseline: HeadAngles): HeadAngles {
  return {
    yaw: round(current.yaw - baseline.yaw),
    pitch: round(current.pitch - baseline.pitch),
    roll: round(current.roll - baseline.roll)
  };
}

export function smoothAngles(previous: HeadAngles | undefined, next: HeadAngles, alpha = 0.35): HeadAngles {
  if (!previous) return next;
  return {
    yaw: round(previous.yaw * (1 - alpha) + next.yaw * alpha),
    pitch: round(previous.pitch * (1 - alpha) + next.pitch * alpha),
    roll: round(previous.roll * (1 - alpha) + next.roll * alpha)
  };
}

export function averageAngles(samples: HeadAngles[]): HeadAngles | undefined {
  if (samples.length === 0) return undefined;
  const total = samples.reduce((acc, item) => ({
    yaw: acc.yaw + item.yaw,
    pitch: acc.pitch + item.pitch,
    roll: acc.roll + item.roll
  }), { yaw: 0, pitch: 0, roll: 0 });
  return {
    yaw: round(total.yaw / samples.length),
    pitch: round(total.pitch / samples.length),
    roll: round(total.roll / samples.length)
  };
}

export function estimateBrightness(context: CanvasRenderingContext2D, width: number, height: number) {
  const sample = context.getImageData(0, 0, width, height).data;
  let total = 0;
  let count = 0;
  for (let index = 0; index < sample.length; index += 40) {
    total += 0.2126 * sample[index] + 0.7152 * sample[index + 1] + 0.0722 * sample[index + 2];
    count += 1;
  }
  return count ? Math.round(total / count) : 0;
}

export function estimateFrameDifference(current: Uint8ClampedArray, previous?: Uint8ClampedArray) {
  if (!previous || previous.length !== current.length) return Infinity;
  let diff = 0;
  for (let index = 0; index < current.length; index += 16) {
    diff += Math.abs(current[index] - previous[index]);
  }
  return diff / (current.length / 16);
}

export function estimateGazeDirection(categories: Array<{ categoryName?: string; score?: number }>) {
  const scores = new Map(categories.map((category) => [category.categoryName ?? "", category.score ?? 0]));
  const left = Math.max(scores.get("eyeLookOutLeft") ?? 0, scores.get("eyeLookInRight") ?? 0);
  const right = Math.max(scores.get("eyeLookInLeft") ?? 0, scores.get("eyeLookOutRight") ?? 0);
  const up = Math.max(scores.get("eyeLookUpLeft") ?? 0, scores.get("eyeLookUpRight") ?? 0);
  const down = Math.max(scores.get("eyeLookDownLeft") ?? 0, scores.get("eyeLookDownRight") ?? 0);
  const entries: Array<[GazeDirection, number]> = [["left", left], ["right", right], ["up", up], ["down", down]];
  const [direction, confidence] = entries.sort((a, b) => b[1] - a[1])[0];
  return confidence > 0.35 ? { direction, confidence: round(confidence) } : { direction: "screen" as const, confidence: round(1 - confidence) };
}

function deg(radians: number) {
  return radians * 180 / Math.PI;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
