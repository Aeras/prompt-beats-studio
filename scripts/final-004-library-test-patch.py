from pathlib import Path

p = Path("src/lib/feature-access-v2.test.ts")
text = p.read_text()
old = '''    for (const key of [
      "playlists",
      "sharing_public_links",
      "favorites",
      "likes",
      "song_analyzer",
    ]) {'''
new = '''    for (const key of ["playlists", "favorites", "likes", "song_analyzer"]) {'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one Library feature hook list, found {text.count(old)}")
text = text.replace(old, new)
needle = '    expect(library).toContain("availableTabs");\n'
replacement = '''    expect(library).toContain("availableTabs");
    expect(library).toContain('if (item === "shared") return true;');
    expect(library).toContain('{tab === "shared" && user && <SharedLinksPanel />}');
'''
if text.count(needle) != 1:
    raise SystemExit(f"Expected one availableTabs assertion, found {text.count(needle)}")
p.write_text(text.replace(needle, replacement))
