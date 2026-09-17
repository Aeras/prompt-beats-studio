import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const songPackageSchema = z.object({
  title: z.string().trim().max(300),
  musicStyle: z.string().trim().max(8_000),
  lyrics: z.string().trim().max(40_000),
  productionNotes: z.string().trim().max(8_000),
}).refine((value) => Boolean(value.title || value.musicStyle || value.lyrics || value.productionNotes), {
  message: "Song package is empty",
});

async function requireAdmin(context: Parameters<Parameters<typeof createServerFn>[0]>[0] extends never ? never : any) {
  const { data: isAdmin, error } = await context.supabase.rpc("current_user_has_role", {
    _role: "admin",
  });
  if (error || isAdmin !== true) throw new Error("Not allowed");
}

export const getAiMusicLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("current_user_has_role", {
      _role: "admin",
    });

    if (error || isAdmin !== true) throw new Error("Not allowed");
    return { allowed: true as const };
  });

export const generateLyriaSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => songPackageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("current_user_has_role", {
      _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Not allowed");

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("Gemini API is not configured");

    const prompt = [
      "Create a complete song from the following PromptBeats song package.",
      "Follow the supplied lyrics exactly where possible. Preserve section labels as structural guidance.",
      "Use the music style and producer notes as musical and production direction.",
      data.title && `TITLE:\n${data.title}`,
      data.musicStyle && `MUSIC STYLE:\n${data.musicStyle}`,
      data.lyrics && `LYRICS:\n${data.lyrics}`,
      data.productionNotes && `PRODUCER NOTES:\n${data.productionNotes}`,
    ].filter(Boolean).join("\n\n");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/lyria-3.5:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO", "TEXT"],
          },
        }),
      },
    );

    const payload = await response.json() as {
      error?: { message?: string };
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
    };

    if (!response.ok) throw new Error(payload.error?.message || `Lyria request failed (${response.status})`);

    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!audioPart?.data) throw new Error("Lyria returned no audio");

    const generatedText = parts.map((part) => part.text).filter((value): value is string => Boolean(value)).join("\n").trim();

    return {
      audioBase64: audioPart.data,
      mimeType: audioPart.mimeType || "audio/mpeg",
      generatedText,
      model: "lyria-3.5" as const,
    };
  });
