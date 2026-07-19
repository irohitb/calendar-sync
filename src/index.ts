import { workCal, personalCal } from "./google.js";
import { syncDirection } from "./sync.js";

async function main() {
  const work = workCal();
  const personal = personalCal();

  console.log("Syncing work → personal (as 'Work')…");
  const wtp = await syncDirection(work, personal, "work-to-personal");
  console.log(`  created=${wtp.created} updated=${wtp.updated} deleted=${wtp.deleted}`);

  console.log("Syncing personal → work (as 'Busy')…");
  const ptw = await syncDirection(personal, work, "personal-to-work");
  console.log(`  created=${ptw.created} updated=${ptw.updated} deleted=${ptw.deleted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
