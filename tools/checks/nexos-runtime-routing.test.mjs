import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../src/lib/ai-provider.server.ts", import.meta.url), "utf8");

assert.match(source, /nexos:\s*\{[\s\S]*?secret:\s*"NEXOS_API_KEY"[\s\S]*?endpoint:\s*"https:\/\/api\.nexos\.ai\/v1\/chat\/completions"[\s\S]*?jsonMode:\s*false[\s\S]*?\}/);

console.log("nexos runtime routing check passed");
