import { makeBackup } from "./make-backup.js";
import { register } from "./instrumentation.js";

/**
 * This file is just a for running adhoc backups manually via the command line.
 * You can ssh into the container and run this script to create a backup.
 */

register();

async function runBackup(): Promise<void> {
  try {
    await makeBackup();
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

console.log("Running adhoc backup...");
await runBackup();
