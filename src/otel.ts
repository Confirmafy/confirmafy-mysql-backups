import { logs } from "@opentelemetry/api-logs";

const logger = logs.getLogger("confirmafy-server", "1.0.0");

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
