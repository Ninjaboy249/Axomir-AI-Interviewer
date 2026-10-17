import { NextResponse } from "next/server";
import { z } from "zod";
import { murfWebSocketUrl, synthesizeWithMurf } from "@/lib/murf-provider";

const SpeakInput = z.object({
  text: z.string().min(1).max(4000),
  transport: z.enum(["http", "websocket-metadata"]).default("http")
});

export async function POST(request: Request) {
  const input = SpeakInput.parse(await request.json());
  if (input.transport === "websocket-metadata") {
    return NextResponse.json({
      webSocketUrlWithoutApiKey: murfWebSocketUrl(),
      messageShape: {
        voice_config: { voiceId: process.env.MURF_VOICE_ID ?? "Pearl", locale: "en-US", style: process.env.MURF_STYLE ?? "Conversational", rate: 0, pitch: 0 },
        text: input.text,
        end: true
      }
    });
  }
  try {
    const murfResponse = await synthesizeWithMurf(input.text);
    return new Response(murfResponse.body, {
      headers: {
        "Content-Type": murfResponse.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Voice provider failed.", fallback: "text" }, { status: 503 });
  }
}
