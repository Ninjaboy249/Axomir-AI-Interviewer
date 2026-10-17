import OpenAI from "openai";
import { z } from "zod";
import { env } from "./config";

export class ProviderUnavailableError extends Error {}

export type StructuredRequest<T extends z.ZodTypeAny> = {
  name: string;
  schema: T;
  jsonSchema?: Record<string, unknown>;
  instructions: string;
  input: string;
};

export async function structuredOpenAI<T extends z.ZodTypeAny>(request: StructuredRequest<T>): Promise<z.infer<T>> {
  const config = env();
  if (!config.OPENAI_API_KEY) {
    throw new ProviderUnavailableError("OPENAI_API_KEY is not configured. OpenAI is required for question generation.");
  }

  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: config.OPENAI_TIMEOUT_MS,
    maxRetries: config.OPENAI_MAX_RETRIES
  });

  const response = await client.responses.create({
    model: config.OPENAI_MODEL,
    instructions: request.instructions,
    input: request.input,
    text: {
      format: {
        type: "json_schema",
        name: request.name,
        strict: true,
        schema: request.jsonSchema ?? zodToJsonSchemaShape()
      }
    }
  });

  const text = response.output_text;
  if (!text) throw new Error("OpenAI response did not include output_text.");
  return request.schema.parse(JSON.parse(text));
}

function zodToJsonSchemaShape() {
  // The app validates with Zod after generation. Production deployments can swap this
  // for zod-to-json-schema if they need full schema mirroring in the provider call.
  return {
    type: "object",
    additionalProperties: true
  };
}
