#!/usr/bin/env node

import { createWriteStream, openSync, closeSync } from "fs";
import { unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { spawnSync } from "child_process";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  type _Object,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import inquirer from "inquirer";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PATH = "mysql-backup",
} = process.env;

// ---------------------------------------------------------------------------
// Connection URL parsing
// ---------------------------------------------------------------------------

interface ConnectionInfo {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseConnectionUrl(url: string): ConnectionInfo {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "3306",
    user: decodeURIComponent(parsed.username) || "root",
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

// ---------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------

interface S3Config {
  client: S3Client;
  bucket: string;
  prefix: string;
}

function getS3Client(): S3Config {
  if (
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_ENDPOINT ||
    !R2_BUCKET
  ) {
    console.error(
      "Missing required env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET",
    );
    process.exit(1);
  }
  const prefix = R2_PATH!.endsWith("/") ? R2_PATH! : `${R2_PATH}/`;
  return {
    client: new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    }),
    bucket: R2_BUCKET,
    prefix,
  };
}

async function listBackups(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<_Object[]> {
  const keys: _Object[] = [];
  let continuationToken: string | undefined;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const result = await s3.send(cmd);
    if (result.Contents) {
      for (const obj of result.Contents) {
        if (obj.Key && obj.Key.endsWith(".stream")) keys.push(obj);
      }
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return keys.sort(
    (a, b) =>
      (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
  );
}

async function downloadBackup(
  s3: S3Client,
  bucket: string,
  key: string,
  outputPath: string,
): Promise<void> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(cmd);
  if (!response.Body) throw new Error("Empty response body");
  await pipeline(response.Body as Readable, createWriteStream(outputPath));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Get the MySQL connection URL
  let connectionUrl = process.argv[2];
  if (!connectionUrl) {
    const { url } = await inquirer.prompt<{ url: string }>([
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

  // 2. List available backups from S3
  const { client, bucket, prefix } = getS3Client();

  console.log("Fetching backup list from S3...\n");
  const backups = await listBackups(client, bucket, prefix);

  if (backups.length === 0) {
    console.log("No backups found in S3.");
    process.exit(1);
  }

  const choices = backups.map((obj) => {
    const name = obj.Key!.replace(prefix, "");
    const date = obj.LastModified ? obj.LastModified.toISOString() : "—";
    const size = formatSize(obj.Size);
    return {
      name: `${name}  (${date} · ${size})`,
      value: obj.Key!,
      short: name,
    };
  });

  const { selectedKey } = await inquirer.prompt<{ selectedKey: string }>([
    {
      type: "select",
      name: "selectedKey",
      message: "Choose a backup to restore:",
      pageSize: 15,
      choices,
    },
  ]);

  // 3. Confirm — this is destructive
  const backupName = selectedKey.replace(prefix, "");
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message: `This will DROP existing tables/database and restore from ${backupName}. Continue?`,
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  // 4. Download the backup from S3 to a temp file
  const localPath = `/tmp/${backupName}`;
  console.log(`\nDownloading ${backupName} from S3...`);
  await downloadBackup(client, bucket, selectedKey, localPath);
  console.log("Download complete.");

  // 5. Run myloader with the downloaded backup piped into stdin
  const myloaderArgs = [
    "--host",
    host,
    "--port",
    port,
    "--user",
    user,
    "--password",
    password,
    "--database",
    database,
    "--drop-table",
    "--drop-database",
    "--stream",
    "--verbose",
    "3",
    "--protocol",
    "tcp",
    "--threads",
    "0", // use all CPU cores
  ];

  console.log("Running myloader restore...\n");

  const fd = openSync(localPath, "r");
  const result = spawnSync("myloader", myloaderArgs, {
    stdio: [fd, "inherit", "inherit"],
  });
  closeSync(fd);

  // 6. Clean up temp file
  await unlink(localPath);

  if (result.status === 0) {
    console.log("\nRestore completed successfully.");
  } else {
    console.error(`\nRestore failed (exit code ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
