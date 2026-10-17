import { google, calendar_v3 } from "googleapis";
import { env } from "./env.js";

export type GCal = calendar_v3.Calendar;
export type CalendarAccount = "work" | "personal";

export class CalendarAccessError extends Error {
  constructor(
    public readonly account: CalendarAccount,
    options: ErrorOptions,
  ) {
    super(`Unable to authenticate with the ${account} Google Calendar`, options);
    this.name = "CalendarAccessError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isGoogleAuthError(error: unknown): boolean {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const data = asRecord(response?.data);
  const nestedError = asRecord(data?.error);
  const status = response?.status ?? root?.code ?? nestedError?.code;

  if (status === 401 || status === "401") return true;

  const authCodes = new Set([
    "invalid_grant",
    "invalid_client",
    "unauthorized_client",
    "UNAUTHENTICATED",
    "authError",
    "invalidCredentials",
  ]);
  const reasons = Array.isArray(nestedError?.errors)
    ? nestedError.errors.flatMap((item) => {
        const reason = asRecord(item)?.reason;
        return typeof reason === "string" ? [reason] : [];
      })
    : [];
  const codes = [data?.error, nestedError?.status, ...reasons];
  if (codes.some((code) => typeof code === "string" && authCodes.has(code))) {
    return true;
  }

  const messages = [
    root?.message,
    data?.error_description,
    nestedError?.message,
  ].filter((value): value is string => typeof value === "string");
  return messages.some((message) =>
    /invalid[_ ](?:grant|client)|unauthorized[_ ]client|invalid credentials|login required|token.*(?:expired|revoked)/i.test(
      message,
    ),
  );
}

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

export async function verifyCalendarAccess(
  cal: GCal,
  account: CalendarAccount,
): Promise<void> {
  try {
    await cal.calendars.get({ calendarId: "primary" });
  } catch (error) {
    if (isGoogleAuthError(error)) {
      throw new CalendarAccessError(account, { cause: error });
    }
    throw error;
  }
}

export type CalEvent = calendar_v3.Schema$Event;
