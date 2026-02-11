import cron from "node-cron";
import { makeBackup } from "./make-backup.js";
import { runTestRestore } from "./test-restore.js";
import { register } from "./instrumentation.js";

register();

async function runBackup(): Promise<void> {
  try {
    await makeBackup();
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

async function runTestRestoreJob(): Promise<void> {
  try {
    await runTestRestore();
  } catch (error) {
    console.error("Test restore failed:", error);
  }
}

const cronOptions = { timezone: "America/Toronto" };

console.log("Scheduling backups to run daily at 09:00 AM Toronto time.");
cron.schedule("0 9 * * *", () => {
  console.log(`\n[${new Date().toISOString()}] Starting scheduled backup...`);
  runBackup();
}, cronOptions);

console.log("Scheduling test restore to run daily at 12:00 PM (noon) Toronto time.");
cron.schedule("0 12 * * *", () => {
  console.log(`\n[${new Date().toISOString()}] Starting scheduled test restore...`);
  runTestRestoreJob();
}, cronOptions);
