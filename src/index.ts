import { workCal, personalCal } from "./google.js";
import {
  syncDirection,
  listAll,
  timeWindow,
  isSyncable,
  isMirror,
  SyncChange,
} from "./sync.js";
import { toRecords, writeHistory, appendSyncLog } from "./history.js";

async function main() {
  const work = workCal();
  const personal = personalCal();

  console.log("Syncing work → personal (as 'Work')…");
  const wtp = await syncDirection(work, personal, "work-to-personal");
  console.log(`  created=${wtp.created} updated=${wtp.updated} deleted=${wtp.deleted}`);

  console.log("Syncing personal → work (as 'Busy')…");
  const ptw = await syncDirection(personal, work, "personal-to-work");
  console.log(`  created=${ptw.created} updated=${ptw.updated} deleted=${ptw.deleted}`);

  // Meeting history. Mirrors are excluded so the two calendars don't double count.
  const win = timeWindow();
  const [workEvents, personalEvents] = await Promise.all([
    listAll(work, win),
    listAll(personal, win),
  ]);

  const keep = (e: Parameters<typeof isSyncable>[0]) => !isMirror(e) && isSyncable(e);
  const records = [
    ...toRecords(workEvents.filter(keep), "work"),
    ...toRecords(personalEvents.filter(keep), "personal"),
  ];

  const added = await writeHistory(records);
  console.log(`History: ${records.length} meetings in window, ${added} new to the record.`);

  const changes: SyncChange[] = [...wtp.changes, ...ptw.changes];
  await appendSyncLog(changes);
  console.log(`Sync log: ${changes.length} change(s) recorded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
