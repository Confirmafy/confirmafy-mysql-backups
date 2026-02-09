import { logs } from "@opentelemetry/api-logs";

const logger = logs.getLogger("confirmafy-server", "1.0.0");

export function logEvent(eventName, eventData = {}) {
  try {
    logger.emit({
      attributes: {
        event_name: eventName,
        event_data: eventData,
      },
      eventName: eventName, // This seems to be unsupported by Axiom. I don't see it in the data.
    });
  } catch (error) {
    console.error("Error emitting opentelemetry log", error);
  }
}
