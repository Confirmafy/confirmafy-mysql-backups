import { logs } from "@opentelemetry/api-logs";

const logger = logs.getLogger("confirmafy-server", "1.0.0");

export const BACKUP_RESULT_EVENTS = {
  BACKUP_FAILED: "confirmafy_mysql_backups.backup_failed",
  BACKUP_UPLOAD_FAILED: "confirmafy_mysql_backups.backup_upload_failed",
  BACKUP_SUCCESS: "confirmafy_mysql_backups.backup_success",
}

export function logEvent(
  eventName: string,
  eventData: Record<string, unknown> = {},
): void {
  try {
    logger.emit({
      attributes: {
        event_name: eventName,
        event_data: JSON.stringify(eventData),
      },
      eventName: eventName,
    });
  } catch (error) {
    console.error("Error emitting opentelemetry log", error);
  }
}
