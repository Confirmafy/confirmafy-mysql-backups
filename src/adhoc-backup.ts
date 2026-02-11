import { makeBackup } from "./make-backup.js";
import { register, flushAndShutdown } from "./instrumentation.js";

/**
 * This file is for running adhoc backups manually via the command line.
 * You can ssh into the container and run this script to create a backup.
 */

register();

async function main(): Promise<void> {
  console.log("Running adhoc backup...");
  try {
    await makeBackup();
  } catch (error) {
    console.error("Backup failed:", error);
    process.exitCode = 1;
  } finally {
    await flushAndShutdown();
  }
}

await main();
