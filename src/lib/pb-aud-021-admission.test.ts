import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import {
  contactInput,
  contactWorkInput,
  validContactWork,
  solveContactProof,
} from "./contact-admission.shared";
import { issueContactProof, verifyContactProof } from "./contact-admission.server";
import * as diagnostics from "./safe-diagnostics";

const secret = "offline-only-test-secret-not-a-credential";
const userId = "e0000000-0000-4000-8000-000000000021";
const payload = contactInput.parse({
  email: "  HELLO@example.invalid ",
  alias: "Tester",
  subject: "Test",
  message: "Synthetic message",
});

describe("PB-AUD-021 optional real account identity", () => {
  function actorFixture() {
    const source = ts.createSourceFile(
      "identity",
      readFileSync("src/lib/contact-admission.server.ts", "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const node = source.statements
      .filter(ts.isFunctionDeclaration)
      .find((n) => n.name?.text === "contactActor");
    if (!node) throw new Error("Missing actual contactActor");
    let user: { id: string; email_confirmed_at: string | null; is_anonymous: boolean } | null = {
      id: userId,
      email_confirmed_at: "2026-01-01",
      is_anonymous: false,
    };
    let banned = false;
    let profileFailure = false;
    let reads = 0;
    const exports: { contactActor?: (request: Request | undefined) => Promise<string | null> } = {};
    runInNewContext(
      ts.transpileModule(node.getText(source), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports,
        createPublicServerClient: (token: string) => {
          expect(token).toBe("verified-fixture");
          return {
            auth: {
              getUser: async (same: string) => {
                reads++;
                expect(same).toBe(token);
                return { data: { user }, error: null };
              },
            },
            from: () => ({
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { is_banned: banned },
                    error: profileFailure ? { message: "private-db-marker" } : null,
                  }),
                }),
              }),
            }),
          };
        },
      },
    );
    return {
      run: () =>
        exports.contactActor!(
          new Request("https://example.invalid", {
            headers: { authorization: "Bearer verified-fixture", "cf-connecting-ip": "forged" },
          }),
        ),
      guest: () =>
        exports.contactActor!(
          new Request("https://example.invalid", {
            headers: { "x-user-id": userId, "x-forwarded-for": "forged" },
          }),
        ),
      set: (value: typeof user) => {
        user = value;
      },
      ban: () => {
        banned = true;
      },
      fail: () => {
        profileFailure = true;
      },
      reads: () => reads,
    };
  }
  test("fresh auth user, not IP or caller claims, determines independent capacity", async () => {
    const f = actorFixture();
    expect(await f.guest()).toBeNull();
    expect(f.reads()).toBe(0);
    expect(await f.run()).toBe(userId);
    expect(f.reads()).toBe(1);
  });
  test("anonymous/unconfirmed/invalid identities retain the public guest path", async () => {
    const f = actorFixture();
    f.set({ id: userId, email_confirmed_at: null, is_anonymous: false });
    expect(await f.run()).toBeNull();
    f.set({ id: userId, email_confirmed_at: "2026-01-01", is_anonymous: true });
    expect(await f.run()).toBeNull();
    f.set(null);
    expect(await f.run()).toBeNull();
  });
  test("banned users cannot claim protected capacity; profile database failure is generic", async () => {
    const f = actorFixture();
    f.ban();
    expect(await f.run()).toBeNull();
    const failure = actorFixture();
    failure.fail();
    await expect(failure.run()).rejects.toThrow("verification is unavailable");
  });
});
function solve(token: string) {
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    if (validContactWork(createHash("sha256").update(contactWorkInput(token, nonce)).digest()))
      return { token, nonce };
  }
  throw new Error("Offline work fixture exhausted");
}
function proof(data = payload, actor: string | null = null) {
  return solve(issueContactProof(data, actor, Date.now(), secret).token);
}

describe("PB-AUD-021 Contact signed single-use work envelope", () => {
  test("valid work is accepted and only HMAC pseudonyms leave verification", () => {
    const receipt = verifyContactProof(payload, null, proof(), Date.now(), secret);
    expect(receipt.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.nonceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain("example.invalid");
    expect(receipt.emailHash).not.toBe(
      createHash("sha256").update(payload.email.toLowerCase()).digest("hex"),
    );
  });
  test("case-normalized email has a stable limit key across fresh challenges", () => {
    const upper = verifyContactProof(payload, null, proof(), Date.now(), secret);
    const lower = { ...payload, email: payload.email.toLowerCase() };
    const next = verifyContactProof(lower, null, proof(lower), Date.now(), secret);
    expect(upper.emailHash).toBe(next.emailHash);
    expect(upper.nonceHash).not.toBe(next.nonceHash);
  });
  test("cannot change content, recipient, account, signature or key after solving", () => {
    const p = proof();
    for (const data of [
      { ...payload, email: "other@example.invalid" },
      { ...payload, message: "Changed message" },
      { ...payload, alias: "Other" },
      { ...payload, subject: "Other" },
    ]) {
      expect(() => verifyContactProof(data, null, p, Date.now(), secret)).toThrow("verification");
    }
    expect(() => verifyContactProof(payload, userId, p, Date.now(), secret)).toThrow(
      "verification",
    );
    expect(() =>
      verifyContactProof(payload, null, { ...p, token: `${p.token}0` }, Date.now(), secret),
    ).toThrow("verification");
    expect(() => verifyContactProof(payload, null, p, Date.now(), "rotated-key")).toThrow(
      "verification",
    );
  });
  test("missing, malformed, expired or future envelopes and unsolved work fail closed", () => {
    const p = proof();
    const decoded = JSON.parse(Buffer.from(p.token.split(".")[0]!, "base64url").toString("utf8"));
    expect(() => verifyContactProof(payload, null, undefined, Date.now(), secret)).toThrow();
    expect(() =>
      verifyContactProof(payload, null, { token: "bad", nonce: 0 }, Date.now(), secret),
    ).toThrow();
    expect(() => verifyContactProof(payload, null, p, decoded.expires, secret)).toThrow();
    expect(() => verifyContactProof(payload, null, p, decoded.expires - 300_001, secret)).toThrow();
    expect(() =>
      verifyContactProof(payload, null, { ...p, nonce: -1 }, Date.now(), secret),
    ).toThrow();
    expect(() =>
      verifyContactProof(payload, null, { ...p, nonce: 0.5 }, Date.now(), secret),
    ).toThrow();
    let invalid = p.nonce + 1;
    while (
      validContactWork(createHash("sha256").update(contactWorkInput(p.token, invalid)).digest())
    )
      invalid++;
    expect(() =>
      verifyContactProof(payload, null, { ...p, nonce: invalid }, Date.now(), secret),
    ).toThrow();
  });
  test("actual browser WebCrypto solver produces server-verifiable work", async () => {
    const token = issueContactProof(payload, null, Date.now(), secret).token;
    const p = await solveContactProof(token);
    expect(verifyContactProof(payload, null, p, Date.now(), secret).nonceHash).toHaveLength(64);
  }, 25_000);
});

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
type Handler = (args: { data: unknown }) => Promise<unknown>;
function handlers(
  path: string,
  rpc: Rpc,
  request: () => Request,
  send: () => Promise<void>,
  logs: unknown[] = [],
) {
  const exports: Record<string, Handler> = {};
  function createServerFn() {
    let validate: (input: unknown) => unknown = (x) => x;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: Handler) => (args: { data: unknown }) => fn({ data: validate(args.data) }),
    };
    return builder;
  }
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": { createServerFn },
    "@tanstack/react-start/server": { getRequest: request },
    zod: { z },
    "./contact-admission.shared": {
      contactInput,
      contactProof: z.object({ token: z.string(), nonce: z.number() }),
    },
    "./contact-admission.server": {
      contactActor: async (req: Request) =>
        req.headers.get("authorization") === "Bearer verified-fixture" ? userId : null,
      issueContactProof: (data: typeof payload, actor: string | null) =>
        issueContactProof(data, actor, Date.now(), secret),
      verifyContactProof: (
        data: typeof payload,
        actor: string | null,
        p: { token: string; nonce: number },
      ) => verifyContactProof(data, actor, p, Date.now(), secret),
    },
    "./safe-diagnostics": diagnostics,
    "@/integrations/supabase/client.server": { supabaseAdmin: { rpc } },
    "@/lib/contact-email.server": { sendContactEmailViaSmtp: send },
    "@/lib/validation-datetime": { compatibleUtcDateTimePattern: /./ },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/lib/feature-access.functions": {},
    "@/lib/private-review.shared": {
      PRIVATE_REVIEW_VISIBILITIES: ["shared", "private"],
      PRIVATE_REVIEW_SOURCE_TYPES: ["project_version", "track"],
    },
  };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports,
    console: {
      error: (...args: unknown[]) => {
        logs.push(args);
      },
    },
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected offline import ${name}`);
      return modules[name];
    },
  });
  return exports;
}

describe("PB-AUD-021 actual public handlers (offline database and SMTP)", () => {
  test("all IP header variants leave normalized-email quota unchanged; no raw header is persisted", async () => {
    let current = new Request("https://example.invalid");
    let sends = 0;
    const counts = new Map<unknown, number>();
    const calls: Record<string, unknown>[] = [];
    const f = handlers(
      "src/lib/contact.functions.ts",
      async (name, args) => {
        expect(name).toBe("admit_contact_request_v2");
        calls.push(args);
        const n = counts.get(args["_email_hash"]) ?? 0;
        counts.set(args["_email_hash"], n + 1);
        return { data: n < 3, error: null };
      },
      () => current,
      async () => {
        sends++;
      },
    );
    for (let i = 0; i < 4; i++) {
      current = new Request("https://example.invalid", {
        headers: {
          "cf-connecting-ip": `attacker-${i}`,
          "x-real-ip": `other-${i}`,
          "x-forwarded-for": `forwarded-${i}, fake`,
        },
      });
      const challenge = (await f["getContactChallenge"]!({ data: payload })) as { token: string };
      const run = f["sendContactForm"]!({ data: { ...payload, proof: solve(challenge.token) } });
      if (i < 3) await expect(run).resolves.toEqual({ sent: true });
      else await expect(run).rejects.toThrow("Too many");
    }
    expect(sends).toBe(3);
    expect(new Set(calls.map((x) => x["_email_hash"])).size).toBe(1);
    expect(JSON.stringify(calls)).not.toMatch(/attacker|forwarded|other-/);
    expect(
      calls.every((x) => Object.keys(x).sort().join(",") === "_email_hash,_nonce_hash,_user_id"),
    ).toBe(true);
  });
  test("DB outage, replay denial and missing proof cannot silently deliver", async () => {
    let sends = 0;
    let mode = "outage";
    const f = handlers(
      "src/lib/contact.functions.ts",
      async () => ({
        data: mode === "allowed",
        error: mode === "outage" ? { message: "sensitive-db-marker" } : null,
      }),
      () => new Request("https://example.invalid"),
      async () => {
        sends++;
      },
    );
    await expect(f["sendContactForm"]!({ data: { ...payload, proof: proof() } })).rejects.toThrow(
      "could not be sent",
    );
    mode = "denied";
    await expect(f["sendContactForm"]!({ data: { ...payload, proof: proof() } })).rejects.toThrow(
      "Too many",
    );
    await expect(f["sendContactForm"]!({ data: payload })).rejects.toThrow("verification");
    expect(sends).toBe(0);
    expect(await f["sendContactForm"]!({ data: { ...payload, website: "honeypot" } })).toEqual({
      sent: true,
    });
    expect(sends).toBe(0);
  });
  test("SMTP failure stays generic and cannot leak message/credential markers", async () => {
    const logs: unknown[] = [];
    let admissions = 0;
    const f = handlers(
      "src/lib/contact.functions.ts",
      async () => {
        admissions++;
        return { data: true, error: null };
      },
      () => new Request("https://example.invalid"),
      async () => {
        throw new Error("Too many contact requests SYNTHETIC_SMTP_CREDENTIAL_AND_CONTENT");
      },
      logs,
    );
    await expect(f["sendContactForm"]!({ data: { ...payload, proof: proof() } })).rejects.toThrow(
      "could not be sent",
    );
    expect(admissions).toBe(1);
    expect(JSON.stringify(logs)).not.toContain("SYNTHETIC_SMTP_CREDENTIAL_AND_CONTENT");
    expect(logs).toHaveLength(1);
  });
  test("reserved capacity identity comes from verified auth, not an extra payload or header", async () => {
    const calls: Record<string, unknown>[] = [];
    const f = handlers(
      "src/lib/contact.functions.ts",
      async (_name, args) => {
        calls.push(args);
        return { data: true, error: null };
      },
      () =>
        new Request("https://example.invalid", {
          headers: { authorization: "Bearer verified-fixture", "x-real-ip": "guest-spoof" },
        }),
      async () => {},
    );
    const challenge = (await f["getContactChallenge"]!({ data: payload })) as { token: string };
    await f["sendContactForm"]!({
      data: { ...payload, userId: "untrusted-user", proof: solve(challenge.token) },
    });
    expect(calls[0]?.["_user_id"]).toBe(userId);
    await expect(f["sendContactForm"]!({ data: { ...payload, proof: proof() } })).rejects.toThrow(
      "verification",
    );
    expect(calls).toHaveLength(1);
  });
  test("Private Review makes exactly one guarded RPC, ignores headers and retains old token shapes", async () => {
    const calls: unknown[] = [];
    let state = "joined";
    const f = handlers(
      "src/lib/private-review.functions.ts",
      async (name, args) => {
        calls.push({ name, args });
        return {
          data: { state, reviewer_id: userId, reviewer_key: "a".repeat(64), display_name: "Guest" },
          error: null,
        };
      },
      () => {
        throw new Error("Private Review must not read request headers");
      },
      async () => {},
    );
    const data = { token: "b".repeat(64), displayName: "Guest", pin: "1234" };
    await expect(f["joinPrivateReviewSession"]!({ data })).resolves.toEqual({
      reviewer_id: userId,
      reviewer_key: "a".repeat(64),
      display_name: "Guest",
    });
    expect(calls).toEqual([
      {
        name: "join_private_review_session",
        args: { _token: data.token, _display_name: "Guest", _pin: "1234" },
      },
    ]);
    for (const [next, message] of [
      ["invalid_pin", "Invalid PIN"],
      ["rate_limited", "Too many"],
      ["closed", "no longer"],
      ["unavailable", "could not be opened"],
    ]) {
      state = next!;
      await expect(f["joinPrivateReviewSession"]!({ data })).rejects.toThrow(message!);
    }
  });
  test("production admission source has no IP-based branch or hashing input", () => {
    for (const path of [
      "contact.functions.ts",
      "contact-admission.server.ts",
      "private-review.functions.ts",
    ]) {
      const source = readFileSync(`src/lib/${path}`, "utf8").toLowerCase();
      for (const header of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"])
        expect(source).not.toContain(header);
    }
  });
});
