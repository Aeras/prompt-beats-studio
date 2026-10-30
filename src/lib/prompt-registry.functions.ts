import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decodePromptImport,
  PROMPT_MAX_BYTES,
  type PromptCatalogItem,
} from "./prompt-registry.shared";

async function call(db: any, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error)
    throw new Error(
      "Prompt registry operation failed. Refresh and verify permissions or references.",
    );
  return data;
}
export const listGeneratorPrompts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await call(context.supabase, "generator_prompt_catalog")) as PromptCatalogItem[],
  );
export const readGeneratorPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().guid() }).strict().parse(v))
  .handler(
    async ({ data, context }) =>
      (await call(context.supabase, "generator_prompt_read", { _id: data.id })) as {
        content: string | null;
        label: string;
      },
  );
export const importGeneratorPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        label: z.string().trim().min(3).max(160),
        filename: z.string().max(164),
        base64: z
          .string()
          .max(Math.ceil(PROMPT_MAX_BYTES / 3) * 4)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const bytes = Uint8Array.from(atob(data.base64), (character) => character.charCodeAt(0));
    const content = decodePromptImport(data.filename, bytes);
    return await call(context.supabase, "generator_prompt_import", {
      _label: data.label,
      _content: content,
    });
  });
export const mutateGeneratorPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().guid(),
        action: z.enum(["default", "archive", "restore", "delete"]),
        expectedDefault: z.string().guid(),
      })
      .strict()
      .parse(v),
  )
  .handler(
    async ({ data, context }) =>
      await call(context.supabase, "generator_prompt_mutate", {
        _id: data.id,
        _action: data.action,
        _expected_default: data.expectedDefault,
      }),
  );
