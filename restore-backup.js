#!/usr/bin/env node

import { readdirSync, statSync, openSync, closeSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";
import inquirer from "inquirer";

function parseConnectionUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "3306",
    user: decodeURIComponent(parsed.username) || "root",
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

function findBackups(dir) {
  const files = readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".stream"))
    .map((f) => {
      const fullPath = resolve(dir, f);
      const stat = statSync(fullPath);
      return { name: f, size: stat.size, modified: stat.mtime };
    })
    .sort((a, b) => b.modified - a.modified);
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  // Get connection URL from CLI arg or prompt
  let connectionUrl = process.argv[2];
  if (!connectionUrl) {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message:
          "Enter MySQL connection URL (mysql://user:pass@host:port/database):",
      },
    ]);
    connectionUrl = url;
  }

  const { host, port, user, password, database } =
    parseConnectionUrl(connectionUrl);

  console.log(`\nTarget: ${user}@${host}:${port}/${database}\n`);

  // Scan for local .stream backups
  const backupDir = process.cwd();
  const backups = findBackups(backupDir);

  if (backups.length === 0) {
    console.log("No .stream backup files found in the current directory.");
    process.exit(1);
  }

  const choices = backups.map((b) => ({
    name: `${b.name}  (${b.modified.toISOString()} · ${formatSize(b.size)})`,
    value: b.name,
    short: b.name,
  }));

  const { selectedBackup } = await inquirer.prompt([
    {
      type: "select",
      name: "selectedBackup",
      message: "Choose a backup to restore:",
      pageSize: 15,
      choices,
    },
  ]);

  // Destructive action — ask for confirmation
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `This will DROP existing tables/database and restore from ${selectedBackup}. Continue?`,
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  // Call myloader directly — mydumper is available in the container image
  const backupPath = resolve(backupDir, selectedBackup);
  const myloaderArgs = [
    "--host", host,
    "--port", port,
    "--user", user,
    "--password", password,
    "--database", database,
    "--drop-table",
    "--drop-database",
    "--stream",
    "--verbose", "3",
    "--protocol", "tcp",
  ];

  console.log(`\nRunning restore...\n`);

  // Feed the .stream file into myloader's stdin
  const fd = openSync(backupPath, "r");
  const result = spawnSync("myloader", myloaderArgs, {
    stdio: [fd, "inherit", "inherit"],
  });
  closeSync(fd);

  if (result.status === 0) {
    console.log("\nRestore completed successfully.");
  } else {
    console.error(`\nRestore failed (exit code ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
