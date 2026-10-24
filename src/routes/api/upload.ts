import { createFileRoute } from "@tanstack/react-router";
import { verifiedAudioType } from "@/lib/audio-upload";

const MAX_BYTES = 50 * 1024 * 1024;
// Allows a small multipart envelope while bounding unknown/chunked request bodies.
const MAX_REQUEST_BYTES = 52 * 1024 * 1024;
type MultipartFile = { name: string; type: string; bytes: Uint8Array };

async function readBoundedBody(request: Request, declaredLength?: number): Promise<Uint8Array> {
  if (!request.body) throw new Error("Upload body is missing");
  const reader = request.body.getReader();
  let total = 0;

  if (declaredLength !== undefined) {
    const body = new Uint8Array(declaredLength);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_REQUEST_BYTES || total > declaredLength) {
          await reader.cancel();
          throw new Error("Upload request is too large");
        }
        body.set(value, total - value.byteLength);
      }
    } finally {
      reader.releaseLock();
    }
    return total === declaredLength ? body : body.subarray(0, total);
  }

  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error("Upload request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  outer: for (let i = start; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function boundaryKind(
  body: Uint8Array,
  marker: Uint8Array,
  position: number,
): "next" | "final" | null {
  const suffix = position + marker.length;
  if (body[suffix] === 13 && body[suffix + 1] === 10) return "next";
  if (body[suffix] === 45 && body[suffix + 1] === 45) {
    const afterFinal = suffix + 2;
    if (afterFinal === body.length || (body[afterFinal] === 13 && body[afterFinal + 1] === 10))
      return "final";
  }
  return null;
}

function findValidBoundary(
  body: Uint8Array,
  marker: Uint8Array,
  start = 0,
): { position: number; kind: "next" | "final" } | null {
  let position = findBytes(body, marker, start);
  while (position >= 0) {
    const hasValidPrefix =
      position === 0 || (body[position - 2] === 13 && body[position - 1] === 10);
    const kind = hasValidPrefix ? boundaryKind(body, marker, position) : null;
    if (kind) return { position, kind };
    position = findBytes(body, marker, position + 1);
  }
  return null;
}

function parseMultipartFile(contentType: string, body: Uint8Array): MultipartFile | null {
  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (
    !/^multipart\/form-data\s*;/i.test(contentType) ||
    !boundary ||
    boundary.length > 70 ||
    !/^[0-9A-Za-z'()+_,\-./:=? ]+$/.test(boundary) ||
    boundary.endsWith(" ")
  )
    return null;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const marker = encoder.encode(`--${boundary}`);
  const headerEnd = encoder.encode("\r\n\r\n");
  let delimiter = findValidBoundary(body, marker);
  let foundFile: MultipartFile | null = null;
  while (delimiter) {
    if (delimiter.kind === "final") return null;
    const headersStart = delimiter.position + marker.length + 2;
    const headersEnd = findBytes(body, headerEnd, headersStart);
    if (headersEnd < 0 || headersEnd - headersStart > 16384) return null;
    const headers = decoder.decode(body.subarray(headersStart, headersEnd));
    const disposition =
      /content-disposition:\s*form-data;[^\r\n]*\bname="([^"]+)"[^\r\n]*\bfilename="([^"]*)"/i.exec(
        headers,
      );
    const dataStart = headersEnd + headerEnd.length;
    const nextDelimiter = findValidBoundary(body, marker, dataStart);
    if (!nextDelimiter || nextDelimiter.position < dataStart + 2) return null;
    if (disposition?.[1] === "file") {
      if (foundFile) return null;
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? "";
      foundFile = {
        name: disposition[2] ?? "",
        type,
        // Only the delimiter's framing CRLF, not a genuine file suffix.
        bytes: body.subarray(dataStart, nextDelimiter.position - 2),
      };
    }
    if (nextDelimiter.kind === "final") return foundFile;
    delimiter = nextDelimiter;
  }
  return null;
}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createPublicServerClient, getUserIdFromRequest } =
          await import("@/lib/supabase-public.server");
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const userId = await getUserIdFromRequest(request);
        if (!userId || !token)
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

        const client = createPublicServerClient(token);
        const { data: allowed, error: featureError } = await client.rpc(
          "current_user_can_use_feature",
          {
            _feature_key: "track_uploads",
          },
        );
        if (featureError || allowed !== true) {
          return new Response(JSON.stringify({ error: "Track uploads are not available." }), {
            status: 403,
          });
        }

        const { data: admitted, error: admissionError } = await client.rpc("admit_track_upload");
        if (admissionError || admitted !== true) {
          return new Response(
            JSON.stringify({ error: "Upload limit reached. Please try again later." }),
            { status: 429 },
          );
        }

        let declaredLength: number | undefined;
        const contentLength = request.headers.get("content-length");
        if (contentLength !== null) {
          if (!/^\d+$/.test(contentLength.trim())) {
            return new Response(JSON.stringify({ error: "Invalid upload request size" }), {
              status: 400,
            });
          }
          declaredLength = Number(contentLength);
          if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_REQUEST_BYTES) {
            return new Response(JSON.stringify({ error: "Upload request is too large" }), {
              status: 413,
            });
          }
        }

        let body: Uint8Array;
        try {
          body = await readBoundedBody(request, declaredLength);
        } catch {
          return new Response(JSON.stringify({ error: "Upload request is too large" }), {
            status: 413,
          });
        }
        const parsed = parseMultipartFile(request.headers.get("content-type") ?? "", body);
        if (!parsed) {
          return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
        }
        if (parsed.bytes.byteLength > MAX_BYTES) {
          return new Response(JSON.stringify({ error: "File is larger than 50 MB" }), {
            status: 413,
          });
        }
        const format = verifiedAudioType(parsed.name, parsed.type, parsed.bytes);
        if (!format) {
          return new Response(JSON.stringify({ error: "Only .mp3 and .wav files are allowed" }), {
            status: 415,
          });
        }

        const bytes = parsed.bytes;
        const { buildObjectKey, uploadToR2 } = await import("@/lib/r2.server");
        const { beginAudioUpload, finalizeAudioUpload, queueFailedAudioUpload } =
          await import("@/lib/upload-receipts.server");
        const fileName = /\.(mp3|wav)$/i.test(parsed.name)
          ? parsed.name
          : `${parsed.name || "audio"}.${format.extension}`;
        const key = buildObjectKey(userId, fileName);
        let registered = false;
        try {
          const receipt = await beginAudioUpload(userId, key, bytes, format.mime);
          registered = true;
          const { url } = await uploadToR2(key, bytes, format.mime, receipt.sha256);
          await finalizeAudioUpload(receipt);
          return Response.json({ key, url });
        } catch {
          // A rejected registration must never clean up a pre-existing key.
          if (registered) {
            try {
              await queueFailedAudioUpload(key, userId);
            } catch {
              console.error("[upload] cleanup remains unresolved");
            }
          }
          return Response.json(
            { error: "The audio upload could not be finalized. Please try again." },
            { status: 502 },
          );
        }
      },
    },
  },
});
