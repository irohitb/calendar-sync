import { GCal, CalEvent } from "./google.js";
import { env } from "./env.js";

const MIRROR_KEY = "calendar-sync-mirror";
const SOURCE_ID_KEY = "calendar-sync-source-id";

export type Direction = "work-to-personal" | "personal-to-work";

/** One calendar mutation this job made. Times only — this repo is public. */
export type SyncChange = {
  action: "created" | "updated" | "deleted";
  direction: string;
  start: string | null;
  end: string | null;
};

export type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  changes: SyncChange[];
};

function mirrorTitle(dir: Direction): string {
  return dir === "work-to-personal" ? "Work" : "Busy";
}

function directionLabel(dir: Direction): string {
  return dir === "work-to-personal" ? "work → personal" : "personal → work";
}

function timeOf(e: CalEvent, which: "start" | "end"): string | null {
  const t = e[which];
  if (!t) return null;
  return t.dateTime ?? t.date ?? null;
}

export function timeWindow() {
  const now = new Date();
  const end = new Date(now.getTime() + env.syncDays * 24 * 60 * 60 * 1000);
  return { timeMin: now.toISOString(), timeMax: end.toISOString() };
}

export async function listAll(
  cal: GCal,
  params: { timeMin: string; timeMax: string; privateExtendedProperty?: string },
): Promise<CalEvent[]> {
  const out: CalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId: "primary",
      singleEvents: true,
      showDeleted: false,
      maxResults: 2500,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      privateExtendedProperty: params.privateExtendedProperty
        ? [params.privateExtendedProperty]
        : undefined,
      pageToken,
    });
    out.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export function isSyncable(e: CalEvent): boolean {
  if (e.status === "cancelled") return false;
  if (!e.start || !e.end) return false;
  // Skip all-day events with transparency=transparent (out of office etc are still synced)
  if (e.transparency === "transparent") return false;
  // Skip events the user declined
  const self = e.attendees?.find((a) => a.self);
  if (self?.responseStatus === "declined") return false;
  return true;
}

export function isMirror(e: CalEvent): boolean {
  return Boolean(e.extendedProperties?.private?.[MIRROR_KEY]);
}

/**
 * Widen the mirrored block by the configured buffers so meetings can't be
 * booked right up against each other. All-day events carry `date` rather than
 * `dateTime`, where padding is meaningless, so they pass through untouched.
 */
function paddedWindow(source: CalEvent): Pick<CalEvent, "start" | "end"> {
  const startDt = source.start?.dateTime;
  const endDt = source.end?.dateTime;
  if (!startDt || !endDt) return { start: source.start!, end: source.end! };

  const s = new Date(new Date(startDt).getTime() - env.bufferBeforeMin * 60_000);
  const e = new Date(new Date(endDt).getTime() + env.bufferAfterMin * 60_000);
  return {
    start: { ...source.start, dateTime: s.toISOString() },
    end: { ...source.end, dateTime: e.toISOString() },
  };
}

function buildMirror(source: CalEvent, dir: Direction): CalEvent {
  const { start, end } = paddedWindow(source);
  return {
    summary: mirrorTitle(dir),
    start: start!,
    end: end!,
    reminders: { useDefault: false, overrides: [] },
    visibility: "private",
    transparency: "opaque",
    extendedProperties: {
      private: {
        [MIRROR_KEY]: "1",
        [SOURCE_ID_KEY]: source.id!,
      },
    },
  };
}

function eventsEqual(a: CalEvent, b: CalEvent): boolean {
  const at = a.start?.dateTime ?? a.start?.date;
  const bt = b.start?.dateTime ?? b.start?.date;
  const ae = a.end?.dateTime ?? a.end?.date;
  const be = b.end?.dateTime ?? b.end?.date;
  return at === bt && ae === be && a.summary === b.summary;
}

export async function syncDirection(
  source: GCal,
  target: GCal,
  dir: Direction,
): Promise<SyncResult> {
  const win = timeWindow();
  const label = directionLabel(dir);

  const [sourceEvents, existingMirrors] = await Promise.all([
    listAll(source, win),
    listAll(target, { ...win, privateExtendedProperty: `${MIRROR_KEY}=1` }),
  ]);

  const originals = sourceEvents.filter((e) => !isMirror(e) && isSyncable(e));

  const mirrorsBySourceId = new Map<string, CalEvent>();
  for (const m of existingMirrors) {
    const sid = m.extendedProperties?.private?.[SOURCE_ID_KEY];
    if (sid) mirrorsBySourceId.set(sid, m);
  }

  const originalIds = new Set(originals.map((e) => e.id!));

  let created = 0;
  let updated = 0;
  let deleted = 0;
  const changes: SyncChange[] = [];

  for (const orig of originals) {
    const desired = buildMirror(orig, dir);
    const existing = mirrorsBySourceId.get(orig.id!);
    if (!existing) {
      await target.events.insert({ calendarId: "primary", requestBody: desired });
      created++;
      changes.push({
        action: "created",
        direction: label,
        start: timeOf(orig, "start"),
        end: timeOf(orig, "end"),
      });
    } else if (!eventsEqual(existing, desired)) {
      await target.events.update({
        calendarId: "primary",
        eventId: existing.id!,
        requestBody: { ...existing, ...desired },
      });
      updated++;
      changes.push({
        action: "updated",
        direction: label,
        start: timeOf(orig, "start"),
        end: timeOf(orig, "end"),
      });
    }
  }

  for (const [sid, mirror] of mirrorsBySourceId) {
    if (!originalIds.has(sid)) {
      await target.events.delete({
        calendarId: "primary",
        eventId: mirror.id!,
      });
      deleted++;
      changes.push({
        action: "deleted",
        direction: label,
        start: timeOf(mirror, "start"),
        end: timeOf(mirror, "end"),
      });
    }
  }

  return { created, updated, deleted, changes };
}
