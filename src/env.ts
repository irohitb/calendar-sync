function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function minutes(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number, got: ${raw}`);
  }
  return n;
}

export const env = {
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    workRefreshToken: required("WORK_REFRESH_TOKEN"),
    personalRefreshToken: required("PERSONAL_REFRESH_TOKEN"),
  },
  syncDays: Number(process.env.SYNC_DAYS ?? "30"),
  // Padding applied to mirrored blocks so meetings aren't booked back-to-back.
  bufferBeforeMin: minutes("BUFFER_BEFORE_MIN", 15),
  bufferAfterMin: minutes("BUFFER_AFTER_MIN", 15),
};
