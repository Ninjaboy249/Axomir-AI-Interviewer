import { env } from "./config";

const regionHost = (region: string) => {
  const normalized = region.toLowerCase();
  if (normalized === "global") return "global.api.murf.ai";
  return `${normalized}.api.murf.ai`;
};

const streamingModel = (model: string) => {
  const normalized = model.toLowerCase();
  if (normalized === "falcon" || normalized === "falcon-2") return "falcon-2";
  return model;
};

export async function synthesizeWithMurf(text: string) {
  const config = env();
  if (!config.MURF_API_KEY) {
    throw new Error("MURF_API_KEY is not configured.");
  }
  const response = await fetch(`https://${regionHost(config.MURF_REGION)}/v1/speech/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.MURF_API_KEY
    },
    body: JSON.stringify({
      text,
      voiceId: config.MURF_VOICE_ID,
      model: streamingModel(config.MURF_MODEL),
      locale: "en-US",
      style: config.MURF_STYLE,
      sampleRate: 24000,
      format: "MP3",
      channelType: "MONO"
    })
  });
  if (!response.ok || !response.body) {
    throw new Error(`Murf speech generation failed with status ${response.status}.`);
  }
  return response;
}

export function murfWebSocketUrl() {
  const config = env();
  const host = regionHost(config.MURF_REGION);
  return `wss://${host}/v1/speech/stream-input?model=${encodeURIComponent(streamingModel(config.MURF_MODEL))}&sample_rate=24000&channel_type=MONO&format=MP3`;
}
