function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    workRefreshToken: required("WORK_REFRESH_TOKEN"),
    personalRefreshToken: required("PERSONAL_REFRESH_TOKEN"),
  },
  syncDays: Number(process.env.SYNC_DAYS ?? "30"),
};
