import { createReadStream, openSync, closeSync } from "fs";
import { stat, unlink } from "fs/promises";
import { spawnSync } from "child_process";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const {
  MYSQL_HOST,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_PORT = "3306",
  MYSQL_DATABASE,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PATH = "mysql-backup",
} = process.env;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEnv() {
  const required = {
    MYSQL_HOST,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DATABASE,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
    R2_BUCKET,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------

function getS3Client() {
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

async function uploadBackup(s3, bucket, key, filePath) {
  const { size } = await stat(filePath);
  console.log(`Uploading ${filePath} (${(size / 1024 / 1024).toFixed(1)} MB) to ${key} ...`);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
    })
  );
  console.log("Upload complete.");
}

/**
 * Delete remote backups older than `maxAgeMs` (default 7 days).
 * Mirrors the old behaviour: rclone delete remote:bucket/path --min-age 168h
 */
async function deleteOldBackups(s3, bucket, prefix, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  console.log(`Deleting remote backups older than ${cutoff.toISOString()} ...`);

  const toDelete = [];
  let continuationToken;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    if (result.Contents) {
      for (const obj of result.Contents) {
        if (obj.LastModified && obj.LastModified < cutoff) {
          toDelete.push({ Key: obj.Key });
        }
      }
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  if (toDelete.length === 0) {
    console.log("No old backups to delete.");
    return;
  }

  // DeleteObjects supports up to 1000 keys per request
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch },
      })
    );
  }
  console.log(`Deleted ${toDelete.length} old backup(s).`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function makeBackup() {
  validateEnv();

  // 1. Generate timestamped filename (UTC)
  const now = new Date();
  const ts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("-");
  const filename = `backup-${ts}.stream`;
  const localPath = `/tmp/${filename}`;

  // 2. Run mydumper and stream output directly to file
  //
  // --threads 0   → use the number of CPU cores
  // -v 3          → verbose level 3 (info logs)
  // --stream      → writes a single stream to stdout; we redirect it straight to a file
  // -c            → compress output
  // --clear       → clear the output directory before dumping
  // --trx-tables  → optimised for InnoDB tables (all Confirmafy tables use InnoDB)
  //                  Verified with: SHOW TABLE STATUS FROM `railway`;
  const args = [
    "--host", MYSQL_HOST,
    "--user", MYSQL_USER,
    "--password", MYSQL_PASSWORD,
    "--port", MYSQL_PORT,
    "--database", MYSQL_DATABASE,
    "-c",
    "--clear",
    "--trx-tables",
    "--threads", "0",
    "-v", "3",
    "--stream",
    "-o", "backup",
  ];

  console.log(`Running mydumper → ${localPath} ...`);

  // Stream stdout directly to a file instead of buffering in memory,
  // so backups of any size work without hitting Node.js buffer limits.
  const fd = openSync(localPath, "w");
  const result = spawnSync("mydumper", args, {
    stdio: ["ignore", fd, "inherit"],
  });
  closeSync(fd);

  if (result.status !== 0) {
    throw new Error(`mydumper failed (exit code ${result.status})`);
  }
  console.log("mydumper finished.");

  // 3. Upload to S3-compatible storage
  const { client, bucket, prefix } = getS3Client();
  const remoteKey = `${prefix}${filename}`;
  await uploadBackup(client, bucket, remoteKey, localPath);

  // 4. Clean up local temp file
  await unlink(localPath);

  // 5. Delete remote backups older than 7 days
  await deleteOldBackups(client, bucket, prefix);

  console.log("Backup complete.");
}
