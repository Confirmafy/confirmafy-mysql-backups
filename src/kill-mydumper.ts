#!/usr/bin/env node

import { spawnSync } from "child_process";

const result = spawnSync("pkill", ["mydumper"], {
  stdio: "inherit",
});

if (result.status === 0) {
  console.log("Sent SIGTERM to mydumper. The backup job should stop shortly.");
} else if (result.status === 1) {
  console.log("No mydumper process found. Nothing to kill.");
  process.exit(0);
} else {
  console.error(`pkill failed (exit code ${result.status}).`);
  process.exit(result.status ?? 1);
}
