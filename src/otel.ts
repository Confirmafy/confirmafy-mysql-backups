import { AttributeValue } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

const logger = logs.getLogger("confirmafy-server", "1.0.0");

export const BACKUP_RESULT_EVENT = {
  EVENT_NAME: "confirmafy_mysql_backups.backup_result",
  ATTRIBUTES: {
    ERROR_CODE: "error_code",
    RESULT: "result",
    RESULT_VALUES: {
      BACKUP_FAILED: "backup_failed",
      BACKUP_UPLOAD_FAILED: "backup_upload_failed",
      BACKUP_SUCCESS: "backup_success",
    }
  }
}

export function logEvent(
  name: string,
  eventData?: { [key: string]: AttributeValue },
) {
  try {
    logger.emit({
      attributes: {
        event_name: name,
        event_data: eventData,
      },
      eventName: name, // This seems to be unsupported by Axiom. I don't see it in the data.
    })
  } catch (error) {
    console.error("Error emitting opentelemetry log", error)
  }
}
