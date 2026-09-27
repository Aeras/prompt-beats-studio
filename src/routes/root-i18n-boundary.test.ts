import { describe, expect, test } from "bun:test";

async function source(path: string) {
  return Bun.file(path).text();
}

describe("root i18n error boundaries", () => {
  test("root not-found and error components provide i18n context before using useI18n", async () => {
    const code = await source("src/routes/__root.tsx");

    expect(code).toContain("function NotFoundContent()");
    expect(code).toContain("function ErrorContent(");
    expect(code).toContain("<I18nProvider>\n      <NotFoundContent />");
    expect(code).toContain("<I18nProvider>\n      <ErrorContent error={error} reset={reset} />");
  });
});
