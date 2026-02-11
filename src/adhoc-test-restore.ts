import { runTestRestore } from "./test-restore.js";
import { register, flushAndShutdown } from "./instrumentation.js";

/**
 * Run the test restore manually from the command line.
 * You can ssh into the container and run this script to test restore from the latest backup.
 */

register();

async function main(): Promise<void> {
  console.log("Running adhoc test restore...");
  try {
    await runTestRestore();
  } catch (error) {
    console.error("Test restore failed:", error);
    process.exitCode = 1;
  } finally {
    await flushAndShutdown();
  }
}

await main();
