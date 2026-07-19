import { GCal, CalEvent } from "./google.js";
import { env } from "./env.js";

const MIRROR_KEY = "calendar-sync-mirror";
const SOURCE_ID_KEY = "calendar-sync-source-id";

type Direction = "work-to-personal" | "personal-to-work";

function mirrorTitle(dir: Direction): string {
  return dir === "work-to-personal" ? "Work" : "Busy";
}

function timeWindow() {
  const now = new Date();
  const end = new Date(now.getTime() + env.syncDays * 24 * 60 * 60 * 1000);
  return { timeMin: now.toISOString(), timeMax: end.toISOString() };
}

async function listAll(
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

function isSyncable(e: CalEvent): boolean {
  if (e.status === "cancelled") return false;
  if (!e.start || !e.end) return false;
  // Skip all-day events with transparency=transparent (out of office etc are still synced)
  if (e.transparency === "transparent") return false;
  // Skip events the user declined
  const self = e.attendees?.find((a) => a.self);
  if (self?.responseStatus === "declined") return false;
  return true;
}

function buildMirror(source: CalEvent, dir: Direction): CalEvent {
  return {
    summary: mirrorTitle(dir),
    start: source.start!,
    end: source.end!,
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
): Promise<{ created: number; updated: number; deleted: number }> {
  const win = timeWindow();

  const [sourceEvents, existingMirrors] = await Promise.all([
    listAll(source, win),
    listAll(target, { ...win, privateExtendedProperty: `${MIRROR_KEY}=1` }),
  ]);

  const originals = sourceEvents.filter(
    (e) => !e.extendedProperties?.private?.[MIRROR_KEY] && isSyncable(e),
  );

  const mirrorsBySourceId = new Map<string, CalEvent>();
  for (const m of existingMirrors) {
    const sid = m.extendedProperties?.private?.[SOURCE_ID_KEY];
    if (sid) mirrorsBySourceId.set(sid, m);
  }

  const originalIds = new Set(originals.map((e) => e.id!));

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const orig of originals) {
    const desired = buildMirror(orig, dir);
    const existing = mirrorsBySourceId.get(orig.id!);
    if (!existing) {
      await target.events.insert({ calendarId: "primary", requestBody: desired });
      created++;
    } else if (!eventsEqual(existing, desired)) {
      await target.events.update({
        calendarId: "primary",
        eventId: existing.id!,
        requestBody: { ...existing, ...desired },
      });
      updated++;
    }
  }

  for (const [sid, mirror] of mirrorsBySourceId) {
    if (!originalIds.has(sid)) {
      await target.events.delete({
        calendarId: "primary",
        eventId: mirror.id!,
      });
      deleted++;
    }
  }

  return { created, updated, deleted };
}
