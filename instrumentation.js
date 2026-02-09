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

export function register() {
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "confirmafy-mysql-backups",
    }),
  );

  // Set up LoggerProvider. We use this to log events.
  const loggerProvider = new LoggerProvider({
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

  // Set the LoggerProvider as global
  logs.setGlobalLoggerProvider(loggerProvider);
}
