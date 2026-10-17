import { z } from "zod";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-6.1-sol"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  MURF_API_KEY: z.string().optional(),
  MURF_VOICE_ID: z.string().default("Pearl"),
  MURF_STYLE: z.string().default("Conversational"),
  MURF_REGION: z.string().default("global"),
  MURF_MODEL: z.string().default("Falcon"),
  SPEECH_TO_TEXT_PROVIDER: z.string().default("browser"),
  UC1_API_URL: z.string().optional(),
  UC1_API_KEY: z.string().optional()
});

export function env() {
  return EnvSchema.parse(process.env);
}
