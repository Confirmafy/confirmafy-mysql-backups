import { makeBackup } from "./make-backup.js";

try {
    await makeBackup();
} catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
}