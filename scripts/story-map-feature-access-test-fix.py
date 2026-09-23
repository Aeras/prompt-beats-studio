from pathlib import Path

p = Path("src/lib/feature-access-v2.test.ts")
s = p.read_text()

replacements = [
    ('  "inspiration_wall",\n  "export_center",', '  "inspiration_wall",\n  "story_map",\n  "export_center",'),
    ('describe("Feature Access V2 — 18 features"', 'describe("Feature Access V2 — 19 features"'),
    ('test("canonical TypeScript registry contains exactly 18 unique feature keys"', 'test("canonical TypeScript registry contains exactly 19 unique feature keys"'),
    ('expect(new Set(keys).size).toBe(18);', 'expect(new Set(keys).size).toBe(19);'),
    ('      "inspiration_wall",\n      "lyrics_review",', '      "inspiration_wall",\n      "story_map",\n      "lyrics_review",'),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f"missing anchor: {old!r}")
    s = s.replace(old, new, 1)

p.write_text(s)
