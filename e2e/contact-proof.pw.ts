import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("Contact work runs in browser WebCrypto without blocking interaction or calling SMTP", async ({
  page,
}) => {
  // Execute the actual browser-safe functions, not a second solver implementation.
  const source = ts.createSourceFile(
    "contact-admission.shared.ts",
    readFileSync("src/lib/contact-admission.shared.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = source.statements
    .filter(ts.isFunctionDeclaration)
    .map((node) => node.getText(source).replace(/^export /, ""))
    .join("\n");
  const script = ts.transpileModule(functions, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await page.route("**/__pb021-proof", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Offline Contact work fixture</title>",
    }),
  );
  await page.goto("/__pb021-proof");
  await page.addScriptTag({ content: script });
  const token = "pb021-browser-fixture";
  const result = await page.evaluate(async (token) => {
    const bridge = window as typeof window & {
      solveContactProof(token: string): Promise<{ token: string; nonce: number }>;
    };
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const start = performance.now();
    try {
      return { proof: await bridge.solveContactProof(token), ms: performance.now() - start, ticks };
    } finally {
      clearInterval(timer);
    }
  }, token);
  const digest = createHash("sha256")
    .update(`pb-contact-work-v1:${token}:${result.proof.nonce}`)
    .digest();
  expect(digest[0]).toBe(0);
  expect(digest[1]).toBe(0);
  expect(result.ticks).toBeGreaterThan(0);
  expect(result.ms).toBeLessThan(20_100);
  test
    .info()
    .annotations.push({ type: "browser-work-duration", description: `${Math.round(result.ms)}ms` });
});
