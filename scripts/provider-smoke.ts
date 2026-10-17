import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

async function main() {
  const checks = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    murf: Boolean(process.env.MURF_API_KEY)
  };
  console.log("Provider smoke configuration:", checks);
  if (!checks.openai || !checks.murf) {
    console.log("Skipping live provider smoke tests because one or more API keys are missing.");
    return;
  }
  console.log("Live smoke tests are intentionally manual in this handoff build. Use the app voice endpoint and OpenAI-backed provider after enabling credentials.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
