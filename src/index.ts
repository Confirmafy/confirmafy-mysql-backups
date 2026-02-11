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

console.log("Scheduling backups to run daily at 12:00 PM (noon) Toronto time.");
cron.schedule("0 12 * * *", () => {
  console.log(`\n[${new Date().toISOString()}] Starting scheduled backup...`);
  runBackup();
}, {
  timezone: "America/Toronto",
});
