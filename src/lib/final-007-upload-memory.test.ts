import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("FINAL-007 upload memory hardening", () => {
  test("known-length requests write directly into one bounded allocation", async () => {
    const upload = await source("src/routes/api/upload.ts");
    expect(upload).toContain("async function readBoundedBody(request: Request, declaredLength?: number)");
    expect(upload).toContain("const body = new Uint8Array(declaredLength)");
    expect(upload).toContain("body.set(value, total - value.byteLength)");
    expect(upload).toContain("body = await readBoundedBody(request, declaredLength)");
  });

  test("upload route preserves request and file bounds for unknown-length requests", async () => {
    const upload = await source("src/routes/api/upload.ts");
    expect(upload).toContain("const MAX_BYTES = 50 * 1024 * 1024");
    expect(upload).toContain("const MAX_REQUEST_BYTES = 52 * 1024 * 1024");
    expect(upload).toContain("if (total > MAX_REQUEST_BYTES)");
    expect(upload).toContain("const chunks: Uint8Array[] = []");
  });

  test("audio payload is passed to R2 without cloning it into a second full buffer", async () => {
    const upload = await source("src/routes/api/upload.ts");
    const r2 = await source("src/lib/r2.server.ts");
    expect(upload).not.toContain("Uint8Array.from(bytes)");
    expect(upload).toContain("uploadToR2(\n          key,\n          bytes,");
    expect(r2).toContain("body: ArrayBuffer | Uint8Array");
  });
});
