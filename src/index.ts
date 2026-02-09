import cron from "node-cron";
import { makeBackup } from "./make-backup.js";
import { register } from "./instrumentation.js";

register();

// Run a backup immediately on startup, then every hour
async function runBackup(): Promise<void> {
  try {
    await makeBackup();
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

console.log("Running initial backup...");
await runBackup();

console.log("Scheduling backups to run every hour.");
cron.schedule("0 * * * *", () => {
  console.log(`\n[${new Date().toISOString()}] Starting scheduled backup...`);
  runBackup();
});
