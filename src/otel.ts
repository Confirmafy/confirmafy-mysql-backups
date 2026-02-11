import { AttributeValue } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

const logger = logs.getLogger("confirmafy-server", "1.0.0");

/**
 * IMPORTANT!
 * 
 * There are monitors configured on the error codes below. If you modify them, make sure to update the monitors accordingly.
 * 
 * https://app.axiom.co/confirmafy-czcl/monitors
 */

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

export const TEST_RESTORE_RESULT_EVENT = {
  EVENT_NAME: "confirmafy_mysql_backups.test_restore_result",
  ATTRIBUTES: {
    ERROR_CODE: "error_code",
    RESULT: "result",
    RESULT_VALUES: {
      TEST_RESTORE_SUCCESS: "test_restore_success",
      TEST_RESTORE_FAILED: "test_restore_failed",
      TEST_RESTORE_NO_BACKUPS: "test_restore_no_backups",
      TEST_RESTORE_DOWNLOAD_FAILED: "test_restore_download_failed",
      TEST_RESTORE_ABORTED_SAME_AS_BACKUP: "test_restore_aborted_same_as_backup",
      TEST_RESTORE_ABORTED_HOST_NOT_ALLOWED: "test_restore_aborted_host_not_allowed",
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
