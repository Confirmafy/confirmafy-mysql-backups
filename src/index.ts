import cron from "node-cron";
import { makeBackup } from "./make-backup.js";
import { register } from "./instrumentation.js";

register();

async function runBackup(): Promise<void> {
  try {
    await makeBackup();
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

console.log("Scheduling backups to run daily at 10:00 AM Toronto time.");
cron.schedule("0 10 * * *", () => {
  console.log(`\n[${new Date().toISOString()}] Starting scheduled backup...`);
  runBackup();
}, {
  timezone: "America/Toronto",
});
