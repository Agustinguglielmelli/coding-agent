import dotenv from "dotenv";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

dotenv.config();

export const observabilitySdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

export function startObservability() {
  observabilitySdk.start();
}

export async function shutdownObservability() {
  await observabilitySdk.shutdown();
}

