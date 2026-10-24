import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { verifiedAudioType } from "./audio-upload";
import { verifyUploadedObject } from "./upload-receipts.server";
import { assertSafeOwnedAudioKey, isSafeOwnedAudioKey } from "./storage-paths";

const owner = "14141414-1414-4414-8414-141414141414";
const encoder = new TextEncoder();
const mp3 = new Uint8Array([73, 68, 51, 0, 255, 0, 13, 10]);
function multipart(bytes: Uint8Array, suffix = "\r\n--pb-boundary--\r\n") {
  const prefix = encoder.encode(
    '--pb-boundary\r\nContent-Disposition: form-data; name="file"; filename="fixture.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n',
  );
  const end = encoder.encode(suffix);
  const body = new Uint8Array(prefix.length + bytes.length + end.length);
  body.set(prefix);
  body.set(bytes, prefix.length);
  body.set(end, prefix.length + bytes.length);
  return body;
}
type Parsed = { name: string; type: string; bytes: Uint8Array };
type Harness = {
  parseMultipartFile: (type: string, body: Uint8Array) => Parsed | null;
  readBoundedBody: (request: Request, length?: number) => Promise<Uint8Array>;
  Route: { server: { handlers: { POST: (arg: { request: Request }) => Promise<Response> } } };
};
function routeHarness(load?: (name: string) => Promise<unknown>): Harness {
  const source = readFileSync(new URL("../routes/api/upload.ts", import.meta.url), "utf8").replace(
    /^import .*;\r?$/gm,
    "",
  );
  const js = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/^export /gm, "")
    .replace(/import\("([^"]+)"\)/g, 'load("$1")');
  return runInNewContext(`${js}; ({parseMultipartFile,readBoundedBody,Route})`, {
    Uint8Array,
    TextDecoder,
    TextEncoder,
    Response,
    verifiedAudioType,
    load,
    createFileRoute: () => (config: unknown) => config,
  }) as Harness;
}
const contentType = 'multipart/form-data; boundary="pb-boundary"';
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("PB-AUD upload integrity (offline)", () => {
  test("actual R2 PUT preserves the byte view and sends canonical MIME and transfer checksum", async () => {
    const source = ts.createSourceFile(
      "r2.ts",
      readFileSync(new URL("./r2.server.ts", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const fn = source.statements.find(
      (s) => ts.isFunctionDeclaration(s) && s.name?.text === "uploadToR2",
    );
    if (!fn) throw new Error("missing PUT adapter");
    const js = ts
      .transpileModule(fn.getText(source), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace(/^export /gm, "");
    let captured: RequestInit | undefined;
    const put = runInNewContext(`${js}; uploadToR2`, {
      Uint8Array,
      createHash,
      getR2Config: () => ({ endpoint: "https://storage.invalid", bucket: "fixture" }),
      getR2Client: () => ({
        fetch: async (_url: string, init: RequestInit) => {
          captured = init;
          return new Response("", { status: 200 });
        },
      }),
      buildR2ObjectUrl: () => "https://storage.invalid/canonical",
    }) as (key: string, body: Uint8Array, mime: string, sha: string) => Promise<unknown>;
    await put(`tracks/${owner}/fixture.mp3`, mp3, "audio/mpeg", hash(mp3));
    expect(captured?.body).toBe(mp3);
    expect(captured?.headers).toMatchObject({
      "content-type": "audio/mpeg",
      "content-md5": createHash("md5").update(mp3).digest("base64"),
      "x-amz-meta-sha256": hash(mp3),
    });
  });
  test("actual receipt reader rejects stale/replayed/unfinalized and missing objects", async () => {
    const source = ts.createSourceFile(
      "receipt.ts",
      readFileSync(new URL("./upload-receipts.server.ts", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const fn = source.statements.find(
      (s) => ts.isFunctionDeclaration(s) && s.name?.text === "requireFinalizedAudio",
    );
    if (!fn) throw new Error("missing receipt reader");
    const js = ts
      .transpileModule(fn.getText(source), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace(/^export /gm, "")
      .replace(/import\("([^"]+)"\)/g, 'load("$1")');
    const valid = {
      key: `tracks/${owner}/file.mp3`,
      owner_id: owner,
      size: 8,
      mime: "audio/mpeg",
      sha256: "a".repeat(64),
      etag: "fixture",
      canonical_url: "https://storage.invalid/canonical",
      status: "finalized",
      consumed_at: null,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    for (const state of [
      "valid",
      "expired",
      "consumed",
      "pending",
      "discarded",
      "missing",
      "missing-object",
    ]) {
      const row = {
        ...valid,
        ...(state === "expired" ? { expires_at: "2000-01-01T00:00:00Z" } : {}),
        ...(state === "consumed" ? { consumed_at: "2000-01-01T00:00:00Z" } : {}),
        ...(["pending", "discarded"].includes(state) ? { status: state } : {}),
      };
      const builder = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return { data: row, error: state === "missing" ? {} : null };
        },
      };
      const read = runInNewContext(`${js}; requireFinalizedAudio`, {
        assertSafeOwnedAudioKey,
        verifyUploadedObject,
        receiptSchema: { parse: (x: unknown) => x },
        load: async () => ({ supabaseAdmin: { from: () => builder } }),
        headR2Object: async () => {
          if (state === "missing-object") throw new Error("404");
          return row;
        },
        buildR2ObjectUrl: () => valid.canonical_url,
      }) as (key: string, user: string) => Promise<unknown>;
      if (state === "valid") expect(await read(valid.key, owner)).toMatchObject({ key: valid.key });
      else await expect(read(valid.key, owner)).rejects.toThrow();
      await expect(read(valid.key, "15151515-1515-4515-8515-151515151515")).rejects.toThrow();
    }
  });
  test("actual route accepts 50 MiB minus one and exactly, rejects plus one before storage", async () => {
    for (const size of [50 * 1024 * 1024 - 1, 50 * 1024 * 1024, 50 * 1024 * 1024 + 1]) {
      let puts = 0;
      const bytes = new Uint8Array(size);
      bytes.set([73, 68, 51]);
      const services = {
        getUserIdFromRequest: async () => owner,
        createPublicServerClient: () => ({ rpc: async () => ({ data: true, error: null }) }),
        buildObjectKey: () => `tracks/${owner}/size.mp3`,
        beginAudioUpload: async () => ({ sha256: "a".repeat(64) }),
        finalizeAudioUpload: async () => {},
        queueFailedAudioUpload: async () => {},
        uploadToR2: async () => {
          puts++;
          return { url: "https://storage.invalid/canonical" };
        },
      };
      const response = await routeHarness(async () => services).Route.server.handlers.POST({
        request: new Request("https://offline.invalid/api/upload", {
          method: "POST",
          headers: { authorization: "Bearer fixture", "content-type": contentType },
          body: multipart(bytes),
        }),
      });
      expect(response.status).toBe(size > 50 * 1024 * 1024 ? 413 : 200);
      expect(puts).toBe(size > 50 * 1024 * 1024 ? 0 : 1);
    }
  });
  test("chunked envelope above 52 MiB is cancelled without unbounded allocation", async () => {
    let cancelled = false;
    let n = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const request = new Request("https://offline.invalid", {
      method: "POST",
      body: new ReadableStream({
        pull(c) {
          if (n++ < 54) c.enqueue(chunk);
          else c.close();
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit);
    await expect(routeHarness().readBoundedBody(request)).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
  test("exact bytes and SHA-256, including genuine trailing CRLF", () => {
    const { parseMultipartFile } = routeHarness();
    for (const bytes of [
      mp3,
      new Uint8Array([73, 68, 51, 0]),
      new Uint8Array([73, 68, 51, 13, 10, 13, 10]),
    ]) {
      const parsed = parseMultipartFile(contentType, multipart(bytes));
      expect(parsed?.bytes).toEqual(bytes);
      expect(hash(parsed!.bytes)).toBe(hash(bytes));
    }
  });
  test("binary boundary-like sequences remain data unless they are actual MIME delimiters", () => {
    const bytes = encoder.encode(
      "ID3\0--pb-boundary\r\n\r\n--pb-boundary-NOT\r\n--pb-boundary--X\r\n",
    );
    expect(routeHarness().parseMultipartFile(contentType, multipart(bytes))?.bytes).toEqual(bytes);
  });
  test("malformed, incomplete, duplicate-file and empty bodies fail safely", () => {
    const { parseMultipartFile } = routeHarness();
    expect(parseMultipartFile(contentType, new Uint8Array())).toBeNull();
    expect(parseMultipartFile(contentType, multipart(mp3, "\r\n--pb-boundary-"))).toBeNull();
    expect(parseMultipartFile("text/plain; boundary=pb-boundary", multipart(mp3))).toBeNull();
    const duplicate = encoder.encode(
      new TextDecoder()
        .decode(multipart(mp3))
        .replace(
          "--pb-boundary--\r\n",
          '--pb-boundary\r\nContent-Disposition: form-data; name="file"; filename="second.mp3"\r\n\r\nID3\r\n--pb-boundary--\r\n',
        ),
    );
    expect(parseMultipartFile(contentType, duplicate)).toBeNull();
    expect(verifiedAudioType("empty.mp3", "audio/mpeg", new Uint8Array())).toBeNull();
  });
  test("chunked requests crossing every framing boundary preserve bytes", async () => {
    const raw = multipart(mp3);
    const request = new Request("https://offline.invalid", {
      method: "POST",
      body: new ReadableStream({
        start(c) {
          for (let i = 0; i < raw.length; i += 3) c.enqueue(raw.subarray(i, i + 3));
          c.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    const harness = routeHarness();
    const body = await harness.readBoundedBody(request);
    expect(harness.parseMultipartFile(contentType, body)?.bytes).toEqual(mp3);
  });
  test("50 MiB limit applies to file bytes, not multipart framing", () => {
    const bytes = new Uint8Array(50 * 1024 * 1024);
    bytes.set([73, 68, 51]);
    const parsed = routeHarness().parseMultipartFile(contentType, multipart(bytes));
    expect(parsed?.bytes.length).toBe(50 * 1024 * 1024);
    expect(hash(parsed!.bytes)).toBe(hash(bytes));
  });
  test("canonical MIME aliases and signature/extension mismatches", () => {
    for (const mime of ["audio/mp3", "audio/mpeg", "application/octet-stream", ""])
      expect(verifiedAudioType("audio.mp3", mime, mp3)?.mime).toBe("audio/mpeg");
    const wav = encoder.encode("RIFF0000WAVEdata");
    for (const mime of ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"])
      expect(verifiedAudioType("audio.wav", mime, wav)?.mime).toBe("audio/wav");
    for (const [name, mime] of [
      ["audio.wav", "audio/mpeg"],
      ["audio.mp3", "text/html"],
      ["audio.html", "audio/mpeg"],
      ["audio.mp3", "audio/wav"],
    ])
      expect(verifiedAudioType(name!, mime!, mp3)).toBeNull();
  });
  test("fixed-clock concurrent uploads and lossy filenames have independent owner-scoped keys", async () => {
    const source = readFileSync(new URL("./r2.server.ts", import.meta.url), "utf8");
    const ast = ts.createSourceFile("r2.ts", source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(
      (s) => ts.isFunctionDeclaration(s) && s.name?.text === "buildObjectKey",
    );
    if (!fn) throw new Error("missing actual key builder");
    const js = ts
      .transpileModule(fn.getText(ast), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace(/^export /gm, "");
    const build = runInNewContext(`${js}; buildObjectKey`, {
      Date: { now: () => 123 },
      crypto: { randomUUID },
      assertSafeOwnedAudioKey: (key: string, user: string) => {
        if (!isSafeOwnedAudioKey(key, user)) throw new Error("unsafe");
      },
    }) as (owner: string, name: string) => string;
    const keys = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        Promise.resolve(build(owner, i % 2 ? "?.mp3" : "!.mp3")),
      ),
    );
    expect(new Set(keys).size).toBe(500);
    expect(keys.every((k) => k.startsWith(`tracks/${owner}/`))).toBe(true);
    expect(isSafeOwnedAudioKey(`tracks/${owner}/1790990000000-old.mp3`, owner)).toBe(true);
  });
  test("HEAD proof rejects missing, replaced, size, MIME and checksum mismatch", () => {
    const receipt = {
      size: 8,
      mime: "audio/mpeg" as const,
      sha256: "a".repeat(64),
      etag: "original",
    };
    const object = { ...receipt };
    expect(() => verifyUploadedObject(receipt, object)).not.toThrow();
    for (const change of [
      { size: 0 },
      { size: 9 },
      { mime: "text/html" },
      { sha256: null },
      { etag: "replaced" },
      { etag: null },
    ])
      expect(() => verifyUploadedObject(receipt, { ...object, ...change })).toThrow();
  });
  test("actual upload route preserves admission order and returns only finalized canonical uploads", async () => {
    for (const failure of ["none", "begin", "put", "finalize"]) {
      const events: string[] = [];
      const load = async (name: string) => {
        if (name.includes("supabase-public"))
          return {
            getUserIdFromRequest: async () => owner,
            createPublicServerClient: () => ({
              rpc: async (key: string) => {
                events.push(key);
                return { data: true, error: null };
              },
            }),
          };
        if (name.includes("r2.server"))
          return {
            buildObjectKey: () => `tracks/${owner}/fixture.mp3`,
            uploadToR2: async (_key: string, bytes: Uint8Array, mime: string) => {
              events.push("put");
              expect(bytes).toEqual(mp3);
              expect(mime).toBe("audio/mpeg");
              if (failure === "put") throw new Error("offline failure");
              return { url: "https://storage.invalid/canonical" };
            },
          };
        return {
          beginAudioUpload: async () => {
            events.push("begin");
            if (failure === "begin") throw new Error("registration unavailable");
            return { sha256: hash(mp3) };
          },
          finalizeAudioUpload: async () => {
            events.push("finalize");
            if (failure === "finalize") throw new Error("offline failure");
          },
          queueFailedAudioUpload: async () => {
            events.push("cleanup");
          },
        };
      };
      const response = await routeHarness(load).Route.server.handlers.POST({
        request: new Request("https://offline.invalid/api/upload", {
          method: "POST",
          headers: { authorization: "Bearer offline-fixture", "content-type": contentType },
          body: multipart(mp3),
        }),
      });
      expect(events.slice(0, 3)).toEqual([
        "current_user_can_use_feature",
        "admit_track_upload",
        "begin",
      ]);
      expect(response.status).toBe(failure === "none" ? 200 : 502);
      if (failure === "none")
        expect(await response.json()).toMatchObject({ url: "https://storage.invalid/canonical" });
      else if (failure === "begin") expect(events).not.toContain("cleanup");
      else expect(events.at(-1)).toBe("cleanup");
    }
  });
});
