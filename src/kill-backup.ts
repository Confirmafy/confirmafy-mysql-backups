#!/usr/bin/env node

import { spawnSync } from "child_process";

// Use -f to match full command line so we find mydumper when launched by Node
const pgrepResult = spawnSync("pgrep", ["-f", "mydumper"], {
  encoding: "utf-8",
});

const stdout = pgrepResult.stdout?.trim();
const pids = stdout ? stdout.split(/\s+/).filter(Boolean) : [];

if (pids.length === 0) {
  console.log("No mydumper process found. Nothing to kill.");
  process.exit(0);
}

console.log("Found mydumper PID(s):", pids.join(", "));

for (const pid of pids) {
  spawnSync("kill", ["-TERM", pid], { stdio: "inherit" });
}

console.log("Sent SIGTERM. The backup job should stop shortly.");
