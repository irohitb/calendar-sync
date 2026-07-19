import { google, calendar_v3 } from "googleapis";
import { env } from "./env.js";

export type GCal = calendar_v3.Calendar;

function client(refreshToken: string): GCal {
  const oauth2 = new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

export const workCal = () => client(env.google.workRefreshToken);
export const personalCal = () => client(env.google.personalRefreshToken);

export type CalEvent = calendar_v3.Schema$Event;
