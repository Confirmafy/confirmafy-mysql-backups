import { createWriteStream, openSync, closeSync, readdirSync } from "fs";
import { unlink, rm } from "fs/promises";
import { pipeline } from "stream/promises";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  type _Object,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import { TEST_RESTORE_RESULT_EVENT, logEvent } from "./otel.js";

// Restores always go to this host. Myloader is called with this value.
const RESTORE_TARGET_HOST = "mysql-fu1u.railway.internal";

const {
  MYSQL_HOST,
  MYSQL_PORT = "3306",
  MYSQL_DATABASE,
  MYSQL_TO_RESTORE_USER,
  MYSQL_TO_RESTORE_PASSWORD,
  MYSQL_TO_RESTORE_PORT = "3306",
  MYSQL_TO_RESTORE_DATABASE,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PATH = "mysql-backup",
} = process.env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * myloader --stream extracts data into import-* directories under the cwd
 * and only attempts a simple rmdir() to clean up. If any files remain the
 * directory is left behind. This function removes them with rm -rf.
 */
async function cleanupMyloaderImportDirs(baseDir: string): Promise<void> {
  const entries = readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("import-")) {
      const fullPath = join(baseDir, entry.name);
      await rm(fullPath, { recursive: true, force: true });
      console.log(`[test-restore] Cleaned up myloader directory: ${fullPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required: Record<string, string | undefined> = {
    MYSQL_TO_RESTORE_USER,
    MYSQL_TO_RESTORE_PASSWORD,
    MYSQL_TO_RESTORE_DATABASE,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
    R2_BUCKET,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`[test-restore] Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

/**
 * Returns true if the restore target is different from the backup (production) database.
 * If they match, logs a serious warning and returns false so the restore is skipped.
 */
function isRestoreTargetDifferentFromBackup(): boolean {
  if (!MYSQL_HOST || !MYSQL_DATABASE) {
    return true;
  }
  const backupHost = MYSQL_HOST.trim().toLowerCase();
  const backupPort = (MYSQL_PORT ?? "3306").trim();
  const backupDb = MYSQL_DATABASE.trim().toLowerCase();
  
  const restoreHost = RESTORE_TARGET_HOST.trim().toLowerCase();
  const restorePort = (MYSQL_TO_RESTORE_PORT ?? "3306").trim();
  const restoreDb = MYSQL_TO_RESTORE_DATABASE!.trim().toLowerCase();

  if (backupHost === restoreHost && backupPort === restorePort && backupDb === restoreDb) {
    console.error("");
    console.error("*** [test-restore] CRITICAL: Restore target is the same as the backup (production) database. ***");
    console.error("*** Refusing to run restore to prevent overwriting production. ***");
    console.error(`*** Backup source: ${MYSQL_HOST}:${backupPort}/${MYSQL_DATABASE} ***`);
    console.error(`*** Restore target: ${RESTORE_TARGET_HOST}:${restorePort}/${MYSQL_TO_RESTORE_DATABASE} ***`);
    console.error("*** Fix MYSQL_TO_RESTORE_* env vars to point to a different database. ***");
    console.error("");
    return false;
  }
  return true;
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
  const prefix = R2_PATH!.endsWith("/") ? R2_PATH! : `${R2_PATH}/`;
  return {
    client: new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    }),
    bucket: R2_BUCKET!,
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
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
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
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!response.Body) throw new Error("Empty response body");
  await pipeline(response.Body as Readable, createWriteStream(outputPath));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runTestRestore(): Promise<void> {
  validateEnv();

  if (!isRestoreTargetDifferentFromBackup()) {
    logEvent(TEST_RESTORE_RESULT_EVENT.EVENT_NAME, {
      [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT]:
        TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT_VALUES.TEST_RESTORE_ABORTED_SAME_AS_BACKUP,
    });
    return;
  }

  const { client, bucket, prefix } = getS3Client();

  console.log("[test-restore] Fetching backup list from S3...");
  const backups = await listBackups(client, bucket, prefix);

  if (backups.length === 0) {
    console.error("[test-restore] No backups found in S3.");
    logEvent(TEST_RESTORE_RESULT_EVENT.EVENT_NAME, {
      [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT]:
        TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT_VALUES.TEST_RESTORE_NO_BACKUPS,
    });
    return;
  }

  const latest = backups[0];
  const key = latest.Key!;
  const backupName = key.replace(prefix, "");
  const localPath = `/tmp/${backupName}`;

  try {
    console.log(`[test-restore] Downloading latest backup: ${backupName}`);
    await downloadBackup(client, bucket, key, localPath);
    console.log("[test-restore] Download complete.");
  } catch (error) {
    console.error("[test-restore] Download failed:", error);
    logEvent(TEST_RESTORE_RESULT_EVENT.EVENT_NAME, {
      [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT]:
        TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT_VALUES.TEST_RESTORE_DOWNLOAD_FAILED,
    });
    throw error;
  }

  try {
    const myloaderArgs = [
      "--host",
      RESTORE_TARGET_HOST,
      "--port",
      MYSQL_TO_RESTORE_PORT,
      "--user",
      MYSQL_TO_RESTORE_USER!,
      "--password",
      MYSQL_TO_RESTORE_PASSWORD!,
      "--database",
      MYSQL_TO_RESTORE_DATABASE!,
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

    console.log("[test-restore] Running myloader restore...");
    const fd = openSync(localPath, "r");
    const result = spawnSync("myloader", myloaderArgs, {
      stdio: [fd, "inherit", "inherit"],
    });
    closeSync(fd);

    if (result.status === 0) {
      console.log("[test-restore] Restore completed successfully.");
      logEvent(TEST_RESTORE_RESULT_EVENT.EVENT_NAME, {
        [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT]:
          TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT_VALUES.TEST_RESTORE_SUCCESS,
      });
    } else {
      console.error(`[test-restore] Restore failed (exit code ${result.status}).`);
      logEvent(TEST_RESTORE_RESULT_EVENT.EVENT_NAME, {
        [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT]:
          TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.RESULT_VALUES.TEST_RESTORE_FAILED,
        [TEST_RESTORE_RESULT_EVENT.ATTRIBUTES.ERROR_CODE]: result.status ?? -1,
      });
      throw new Error(`myloader failed (exit code ${result.status})`);
    }
  } finally {
    await unlink(localPath).catch((err) =>
      console.warn("[test-restore] Failed to remove temp file:", err),
    );
    await cleanupMyloaderImportDirs("/app").catch((err) =>
      console.warn("[test-restore] Failed to clean up import dirs:", err),
    );
  }
}
