export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(base: Date, seconds: number): Date {
  return new Date(base.getTime() + seconds * 1000);
}

export function addMilliseconds(base: Date, milliseconds: number): Date {
  return new Date(base.getTime() + milliseconds);
}

export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const rounded = Math.floor(value);
  return Math.min(max, Math.max(min, rounded));
}
