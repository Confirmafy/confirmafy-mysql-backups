#!/usr/bin/env node

import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import inquirer from "inquirer";

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PATH = "mysql-backup",
} = process.env;

function getS3Client() {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET) {
    console.error(
      "Missing required env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET (and optionally R2_PATH)"
    );
    process.exit(1);
  }
  const prefix = R2_PATH.endsWith("/") ? R2_PATH : `${R2_PATH}/`;
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

async function listBackups(s3, bucket, prefix) {
  const keys = [];
  let continuationToken;
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

  return keys.sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0));
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBackup(s3, bucket, key, outputPath) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(cmd);
  if (!response.Body) throw new Error("Empty response body");
  await pipeline(response.Body, createWriteStream(outputPath));
}

async function main() {
  const { client, bucket, prefix } = getS3Client();

  console.log("Fetching backup list...\n");
  const backups = await listBackups(client, bucket, prefix);
  if (backups.length === 0) {
    console.log("No backups found.");
    return;
  }

  const choices = backups.map((obj, i) => {
    const name = obj.Key.replace(prefix, "");
    const date = obj.LastModified ? obj.LastModified.toISOString() : "—";
    const size = formatSize(obj.Size);
    return {
      name: `${name}  (${date} · ${size})`,
      value: obj.Key,
      short: name,
    };
  });

  const { selectedKey } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedKey",
      message: "Choose a backup to download",
      pageSize: 15,
      choices,
    },
  ]);

  const filename = selectedKey.replace(prefix, "").replace(/\/$/, "") || "backup.stream";
  const { outputPath } = await inquirer.prompt([
    {
      type: "input",
      name: "outputPath",
      message: "Save to path:",
      default: filename,
    },
  ]);

  console.log(`Downloading ${selectedKey} to ${outputPath}...`);
  await downloadBackup(client, bucket, selectedKey, outputPath);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
