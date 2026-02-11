import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let loggerProvider: LoggerProvider | undefined;

export function register(): void {
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "confirmafy-mysql-backups",
    }),
  );

  loggerProvider = new LoggerProvider({
    resource: resource,
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `https://${process.env.AXIOM_DOMAIN}/v1/logs`,
          headers: {
            Authorization: `Bearer ${process.env.AXIOM_API_TOKEN}`,
            "X-Axiom-Dataset": `${process.env.AXIOM_TRACES_DATASET_NAME}`,
          },
        }),
      ),
    ],
  });

  logs.setGlobalLoggerProvider(loggerProvider);
}

/**
 * Flush and shutdown the logger provider so pending log events are sent before the process exits.
 * Call this in adhoc scripts before exiting.
 */
export async function flushAndShutdown(): Promise<void> {
  if (!loggerProvider) return;
  try {
    await loggerProvider.forceFlush();
    await loggerProvider.shutdown();
  } catch (error) {
    console.error("Error flushing OpenTelemetry logs:", error);
  }
}
