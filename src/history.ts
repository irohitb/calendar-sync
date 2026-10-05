import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CalEvent } from "./google.js";
import type { SyncChange } from "./sync.js";

export const HISTORY_DIR = "history";

export type CalendarLabel = "work" | "personal";

// Times only — no titles, attendees or raw ids. This repo is public.
export type MeetingRecord = {
  id: string;
  calendar: CalendarLabel;
  start: string;
  end: string;
};

/** Google event ids are opaque, but hashing keeps anything derivable out of a public repo. */
function hashId(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function eventTime(e: CalEvent, which: "start" | "end"): string | null {
  const t = e[which];
  if (!t) return null;
  return t.dateTime ?? t.date ?? null;
}

export function toRecords(
  events: CalEvent[],
  calendar: CalendarLabel,
): MeetingRecord[] {
  const out: MeetingRecord[] = [];
  for (const e of events) {
    const start = eventTime(e, "start");
    const end = eventTime(e, "end");
    if (!start || !end || !e.id) continue;
    out.push({ id: hashId(e.id), calendar, start, end });
  }
  return out;
}

function monthKey(isoOrDate: string): string {
  return isoOrDate.slice(0, 7);
}

async function readJson(file: string): Promise<MeetingRecord[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.meetings) ? parsed.meetings : [];
  } catch {
    return [];
  }
}

/** Merge into history/YYYY-MM.json, deduped on (id, calendar) so re-runs are idempotent. */
export async function writeHistory(records: MeetingRecord[]): Promise<number> {
  await mkdir(HISTORY_DIR, { recursive: true });

  const byMonth = new Map<string, MeetingRecord[]>();
  for (const r of records) {
    const k = monthKey(r.start);
    const list = byMonth.get(k) ?? [];
    list.push(r);
    byMonth.set(k, list);
  }

  let added = 0;
  for (const [month, incoming] of byMonth) {
    const file = path.join(HISTORY_DIR, `${month}.json`);
    const existing = await readJson(file);

    const merged = new Map<string, MeetingRecord>();
    for (const r of existing) merged.set(`${r.calendar}:${r.id}`, r);
    for (const r of incoming) {
      const key = `${r.calendar}:${r.id}`;
      if (!merged.has(key)) added++;
      merged.set(key, r);
    }

    const sorted = [...merged.values()].sort(
      (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
    );
    await writeFile(file, JSON.stringify({ month, meetings: sorted }, null, 2) + "\n");
  }
  return added;
}

/** Append one section per run that actually changed something. */
export async function appendSyncLog(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return;
  await mkdir(HISTORY_DIR, { recursive: true });

  const file = path.join(HISTORY_DIR, "sync-log.md");
  let head = "";
  try {
    await readFile(file, "utf8");
  } catch {
    head = "# Sync log\n\nEvery calendar change this job made. Times only.\n";
  }

  const stamp = new Date().toISOString();
  const rows = changes
    .map((c) => `| ${c.action} | ${c.direction} | ${c.start ?? "-"} | ${c.end ?? "-"} |`)
    .join("\n");

  const section = [
    `\n## ${stamp}\n`,
    "| action | direction | event start | event end |",
    "| --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");

  await writeFile(file, head + section, { flag: "a" });
}
