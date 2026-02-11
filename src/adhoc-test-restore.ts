import { runTestRestore } from "./test-restore.js";
import { register } from "./instrumentation.js";

/**
 * Run the test restore manually from the command line.
 * You can ssh into the container and run this script to test restore from the latest backup.
 */

register();

console.log("Running adhoc test restore...");
await runTestRestore().catch((error) => {
  console.error("Test restore failed:", error);
  process.exit(1);
});
